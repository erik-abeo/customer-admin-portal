/**
 * The portal against the real ClientRemoteDatabaseAccessAPI, real MySQL 8.4 and
 * real MariaDB 10.6: every flow the mocked suite can only assume.
 *
 * Tests run in order and build on each other through the API's own database:
 * servers registered in one are used by the next. Customer schemas are seeded
 * straight into MySQL, because in production they arrive by migration.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  authSql,
  DB_PASSWORD,
  MARIADB_CONTAINER,
  MARIADB_PORT,
  MYSQL_CONTAINER,
  MYSQL_PORT,
  readCertificate,
  sql,
} from "./stack";

test.describe.configure({ mode: "serial" });

const apiKey = (): string => {
  const key = process.env.CPM_LIVE_API_KEY;
  if (!key)
    throw new Error(
      "CPM_LIVE_API_KEY is not set; the global setup did not start the API.",
    );
  return key;
};

async function signIn(page: Page): Promise<void> {
  const key = apiKey();
  await page.addInitScript((value) => {
    window.sessionStorage.setItem(
      "cap.auth.v1",
      JSON.stringify({ adminName: "Live Test", apiKey: value }),
    );
  }, key);
}

/** Picks an option in a Mantine Select by its visible label. */
async function choose(
  page: Page,
  field: Locator,
  option: string | RegExp,
): Promise<void> {
  // Clicking the option already chosen deselects it in a Mantine Select, and some
  // forms preselect the first entry, so an existing match is left alone.
  const current = await field.inputValue();
  if (
    current &&
    (typeof option === "string" ? current.includes(option) : option.test(current))
  )
    return;
  await field.click();
  // The open dropdown only: the page behind a modal can hold other selects.
  const listbox = page.getByRole("listbox").filter({ visible: true });
  await listbox.getByRole("option", { name: option }).first().click();
  await expect(field).not.toHaveValue("");
}

const schemaExists = (container: string, schema: string): boolean =>
  sql(
    container,
    `SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE schema_name = '${schema}'`,
  ).trim() === "1";

async function scan(
  page: Page,
  label: string,
  options: { modalOpen?: boolean } = {},
): Promise<void> {
  const disabled = ["color-contrast", "landmark-one-main", "region"];
  if (options.modalOpen) {
    // Mantine renders a modal's title bar as a <header>, which axe counts as a
    // second banner because it does not honour aria-modal. Assistive technology
    // does: the page behind a modal is out of its reach while the modal is open.
    disabled.push("landmark-no-duplicate-banner", "landmark-unique");
  }
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    // As in the mocked a11y suite: contrast is enforced by Lighthouse on the login
    // page, and landmarks by the AppLayout tests.
    .disableRules(disabled)
    .analyze();
  const summary = results.violations
    .map(
      (v) =>
        `[${v.id}] ${v.help} (${v.nodes.length}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    )
    .join("\n");
  expect(results.violations, `axe on ${label}:\n${summary}`).toEqual([]);
}

/** Registers a server through the form, probing it first as the form requires. */
async function registerServer(
  page: Page,
  name: string,
  port: number,
  certificate: string,
  engine: RegExp,
): Promise<void> {
  await page.goto("/database-servers");
  await page
    .getByRole("button", { name: /^Add server$/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Name/).fill(name);
  await dialog.getByLabel(/^Local server address/).fill("127.0.0.1");
  await dialog.getByLabel(/^Server port/).fill(String(port));
  await dialog.getByLabel(/^Administrator username/).fill("root");
  await dialog.getByLabel(/^Administrator password/).fill(DB_PASSWORD);
  await dialog.getByLabel(/^Certificate \(PEM\)/).fill(certificate);

  const create = dialog.getByRole("button", { name: /^Create server$/ });
  await expect(create).toBeDisabled();

  await dialog.getByRole("button", { name: /^Test connection$/ }).click();
  await expect(dialog.getByText(engine).first()).toBeVisible();
  await expect(dialog.getByText("TLS", { exact: true })).toBeVisible();
  await expect(create).toBeEnabled();

  await create.click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole("link", { name })
      .or(page.getByText(name, { exact: true }))
      .first(),
  ).toBeVisible();
}

test("signs in with the service's own key and reads from it", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/admin name/i).fill("Live Test");
  await page.getByLabel(/api key/i).fill(apiKey());
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("link", { name: /^Database servers$/i })).toBeVisible();

  // A real read through the proxy: an empty fleet, not an error.
  await page.goto("/database-servers");
  await expect(page.getByText(/Register a MariaDB instance/i)).toBeVisible();
});

test("refuses a wrong password in words, then registers MySQL once its CA verifies", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/database-servers");
  await page
    .getByRole("button", { name: /^Add server$/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Name/).fill("live-mysql-a");
  await dialog.getByLabel(/^Local server address/).fill("127.0.0.1");
  await dialog.getByLabel(/^Server port/).fill(String(MYSQL_PORT));
  await dialog.getByLabel(/^Administrator username/).fill("root");
  // Wrong, but meeting the form's complexity rule: a password failing that rule
  // shows its message on blur, which moves the button out from under the click.
  await dialog.getByLabel(/^Administrator password/).fill("Wrong-Password-2026");

  await dialog.getByRole("button", { name: /^Test connection$/ }).click();
  await expect(dialog.getByText(/Could not connect/i).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Create server$/ })).toBeDisabled();
  await dialog.getByRole("button", { name: /^Cancel$/ }).click();

  await registerServer(
    page,
    "live-mysql-a",
    MYSQL_PORT,
    readCertificate(MYSQL_CONTAINER),
    /MySql 8\.4/,
  );
});

test("registers a second MySQL server and a MariaDB server", async ({ page }) => {
  await signIn(page);
  await registerServer(
    page,
    "live-mysql-b",
    MYSQL_PORT,
    readCertificate(MYSQL_CONTAINER),
    /MySql 8\.4/,
  );
  await registerServer(
    page,
    "live-mariadb",
    MARIADB_PORT,
    readCertificate(MARIADB_CONTAINER),
    /MariaDb 10\.6/,
  );
});

test("registers customer databases and shows their status", async ({ page }) => {
  // Two small customers already on live-mysql-a, as a migration would have left them.
  for (const schema of ["cpmp_move_a", "cpmp_move_b"]) {
    sql(
      MYSQL_CONTAINER,
      // A row keyed 0, as legacy CrystalPM data has; kept as 0 only with this mode.
      `SET SESSION sql_mode = CONCAT(@@sql_mode, ',NO_AUTO_VALUE_ON_ZERO');
       CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
       CREATE TABLE \`${schema}\`.patient (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, name varchar(50) NOT NULL, dob date NULL);
       INSERT INTO \`${schema}\`.patient (id, name, dob) VALUES (0, 'Zero Row', '1970-01-01'), (1, 'Renée', '1980-01-15'), (2, 'José', '1975-06-30');`,
    );
  }

  await signIn(page);
  for (const [schema, customer] of [
    ["cpmp_move_a", "9101"],
    ["cpmp_move_b", "9102"],
  ]) {
    await page.goto("/databases");
    await page
      .getByRole("button", { name: /^Add database$/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await choose(page, dialog.getByLabel(/^Database server/), /live-mysql-a/);
    await dialog.getByLabel(/^Database name/).fill(schema);
    await dialog.getByLabel(/^CrystalPM ID/).fill(customer);
    await dialog
      .getByRole("button", { name: /^(Create|Add|Save)/ })
      .last()
      .click();
    await expect(dialog).toBeHidden();
  }

  await page.goto("/databases");
  const row = page.getByRole("row", { name: /cpmp_move_a/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("active", { exact: true })).toBeVisible();
});

test("measures capacity and shows a server's trend", async ({ page }) => {
  // The collector runs hourly, so two snapshots are written directly: the trend
  // view reads what the collector would have stored.
  const serverId = authSql(
    "SELECT id FROM database_server_info WHERE name = 'live-mysql-a'",
  ).trim();
  authSql(
    `INSERT INTO server_metrics_snapshot (database_server_id, database_id, \`utc_timestamp\`, customer_database_count, authorized_user_count, data_bytes, index_bytes)
     VALUES (${serverId}, NULL, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY), 1, 0, 16384, 0),
            (${serverId}, NULL, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR), 2, 0, 32768, 0);`,
  );

  await signIn(page);
  await page.goto("/capacity");
  await expect(page.getByText("live-mysql-a").first()).toBeVisible();
  await expect(page.getByText("live-mariadb").first()).toBeVisible();

  await page.getByRole("button", { name: "Trend for live-mysql-a" }).click();
  const trend = page.getByRole("dialog", { name: /Trend: live-mysql-a/ });
  await expect(trend).toBeVisible();
  // Two snapshots in the window, oldest first: one customer database, then two.
  await expect(trend.getByText(/^2 snapshots, /)).toBeVisible();

  await scan(page, "the capacity trend", { modalOpen: true });
  await trend.getByRole("button", { name: "Close" }).click();
  await expect(trend).toBeHidden();

  // A closed modal stays in the DOM, hidden, through its exit transition; the page
  // itself is scanned on a fresh load.
  await page.reload();
  await expect(page.getByText("live-mysql-a").first()).toBeVisible();
  await scan(page, "the capacity page");
});

test("mints a key shown once, then revokes it", async ({ page }) => {
  await signIn(page);
  await page.goto("/migrations");
  await page.getByRole("button", { name: /^New migration$/ }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel(/^CrystalPM customer id/).fill("9201");
  await choose(page, form.getByLabel(/^Database server/), /live-mysql-a/);
  await form.getByLabel(/^New database name/).fill("cpmp_mint_one");
  await form.getByRole("button", { name: /^Review destination$/ }).click();
  await page.getByRole("button", { name: /^Mint the key$/ }).click();

  const reveal = page.getByRole("dialog", { name: "Migration key" });
  await expect(reveal).toBeVisible();
  const key = (await reveal.locator("code").first().innerText()).trim();
  expect(key).toMatch(/^CPM-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);

  // Neither Escape nor a click outside loses a key that cannot be shown again.
  await page.keyboard.press("Escape");
  await expect(reveal).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(reveal).toBeVisible();
  await reveal.getByRole("button", { name: /^I have copied the key$/ }).click();
  await expect(reveal).toBeHidden();

  const row = page.getByRole("row", { name: /9201/ });
  await expect(row.getByText("pending", { exact: true })).toBeVisible();
  await expect(row.getByText(key.split("-")[1], { exact: true })).toBeVisible();

  await row.getByRole("button", { name: /^Revoke the key for customer 9201$/ }).click();
  await page.getByRole("button", { name: /^Revoke key$/ }).click();
  await expect(row.getByText("revoked", { exact: true })).toBeVisible();
  // Nothing was created, so there is nothing to discard.
  await expect(row.getByRole("button", { name: /^Discard the target/ })).toHaveCount(0);
  expect(schemaExists(MYSQL_CONTAINER, "cpmp_mint_one")).toBe(false);

  await scan(page, "the migrations page");
});

test("revokes a redeemed key, which drops its login, then discards the database it made", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/migrations");
  await page.getByRole("button", { name: /^New migration$/ }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel(/^CrystalPM customer id/).fill("9202");
  await choose(page, form.getByLabel(/^Database server/), /live-mysql-a/);
  await form.getByLabel(/^New database name/).fill("cpmp_mint_two");
  await form.getByRole("button", { name: /^Review destination$/ }).click();
  await page.getByRole("button", { name: /^Mint the key$/ }).click();
  const reveal = page.getByRole("dialog", { name: "Migration key" });
  const key = (await reveal.locator("code").first().innerText()).trim();
  await reveal.getByRole("button", { name: /^I have copied the key$/ }).click();

  // What the installer does, through the same origin and without the admin key.
  const redeemed = await page.request.post("/My/redeem-migration-key", {
    data: { MigrationKey: key, ClientMachineId: "LIVE-FRONT-DESK" },
  });
  expect(redeemed.ok()).toBe(true);
  const credentials = (await redeemed.json()) as {
    Success: boolean;
    UserName: string;
    SslMode: string;
  };
  expect(credentials.Success).toBe(true);
  expect(credentials.SslMode).toBe("VerifyCA");
  expect(schemaExists(MYSQL_CONTAINER, "cpmp_mint_two")).toBe(true);

  await page.reload();
  const row = page.getByRole("row", { name: /9202/ });
  await expect(row.getByText("redeemed", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: /^Revoke the key for customer 9202$/ }).click();
  const confirm = page.getByRole("dialog", { name: /Revoke this migration key/ });
  await expect(confirm.getByText(/login/i).first()).toBeVisible();
  await confirm.getByRole("button", { name: /^Revoke key$/ }).click();
  await expect(row.getByText("revoked", { exact: true })).toBeVisible();
  expect(
    sql(
      MYSQL_CONTAINER,
      `SELECT COUNT(*) FROM mysql.user WHERE user = '${credentials.UserName}'`,
    ).trim(),
  ).toBe("0");

  await row.getByRole("button", { name: /^Discard the target of migration/ }).click();
  await page.getByRole("button", { name: /^Drop the database$/ }).click();
  await expect.poll(() => schemaExists(MYSQL_CONTAINER, "cpmp_mint_two")).toBe(false);
  await expect(row.getByRole("button", { name: /^Discard the target/ })).toHaveCount(0);
});

/** Plans a move of one database to live-mysql-b under a new name. */
async function planMove(
  page: Page,
  database: string,
  targetName: string,
): Promise<Locator> {
  await page.goto("/moves");
  await page.getByRole("button", { name: /^Plan a move$/ }).click();
  const form = page.getByRole("dialog", { name: /Plan a customer move/ });
  await choose(
    page,
    form.getByLabel(/^Customer database/),
    new RegExp(`^${database} `),
  );
  await choose(page, form.getByLabel(/^Move to server/), /live-mysql-b/);
  await form.getByLabel(/^Name on the target/).fill(targetName);
  await form.getByRole("button", { name: /^Plan the move$/ }).click();
  await page.getByRole("button", { name: /^Start the move$/ }).click();
  await expect(form).toBeHidden();
  return page.getByRole("row", { name: new RegExp(targetName) });
}

test("cancels a move before it copies, and the customer is untouched", async ({
  page,
}) => {
  await signIn(page);
  const row = await planMove(page, "cpmp_move_b", "cpmp_move_b_moved");
  await row
    .getByRole("button", { name: /^Cancel the move for customer 9102$/ })
    .click();
  await page.getByRole("button", { name: /^Cancel the move$/ }).click();
  await expect(row.getByText("cancelled", { exact: true })).toBeVisible();

  // Give the executor a pass to prove it leaves a cancelled move alone.
  await page.waitForTimeout(16_000);
  await page.reload();
  await expect(
    page
      .getByRole("row", { name: /cpmp_move_b_moved/ })
      .getByText("cancelled", { exact: true }),
  ).toBeVisible();
  expect(schemaExists(MYSQL_CONTAINER, "cpmp_move_b_moved")).toBe(false);
  expect(
    authSql(
      "SELECT status FROM database_info WHERE database_name = 'cpmp_move_b'",
    ).trim(),
  ).toBe("active");
});

test("moves a customer, rolls the move back, moves again and drops the source", async ({
  page,
}) => {
  test.setTimeout(420_000);
  await signIn(page);

  const first = await planMove(page, "cpmp_move_a", "cpmp_move_a_moved");
  await expect(first.getByText("flipped", { exact: true })).toBeVisible({
    timeout: 150_000,
  });
  expect(
    authSql("SELECT database_name FROM database_info WHERE crystalpm_id = 9101").trim(),
  ).toBe("cpmp_move_a_moved");
  expect(
    sql(MYSQL_CONTAINER, "SELECT COUNT(*) FROM `cpmp_move_a_moved`.patient").trim(),
  ).toBe("3");

  await expect(first.getByRole("button", { name: /^Drop the source/ })).toBeVisible();
  await first
    .getByRole("button", { name: /^Roll back the move for customer 9101$/ })
    .click();
  await page
    .getByRole("button", { name: /^Roll back$/ })
    .last()
    .click();
  await expect(first.getByText("rolled back", { exact: true })).toBeVisible();
  expect(
    authSql("SELECT database_name FROM database_info WHERE crystalpm_id = 9101").trim(),
  ).toBe("cpmp_move_a");
  await expect(first.getByRole("button", { name: /^Drop the source/ })).toHaveCount(0);

  const second = await planMove(page, "cpmp_move_a", "cpmp_move_a_final");
  await expect(second.getByText("flipped", { exact: true })).toBeVisible({
    timeout: 150_000,
  });
  await second
    .getByRole("button", { name: /^Drop the source of the move for customer 9101$/ })
    .click();
  await page.getByRole("button", { name: /^Drop the source$/ }).click();
  await expect(second.getByText("settled", { exact: true })).toBeVisible();
  expect(schemaExists(MYSQL_CONTAINER, "cpmp_move_a")).toBe(false);
  expect(
    sql(
      MYSQL_CONTAINER,
      "SELECT name FROM `cpmp_move_a_final`.patient WHERE id = 1",
    ).trim(),
  ).toBe("Renée");

  await scan(page, "the moves page");
});
