/**
 * Accessibility E2E suite — runs axe-core against the post-auth pages
 * that Lighthouse CI cannot reach (because Lighthouse runs unauthenticated
 * against `/login`). Together with the per-component axe assertions in
 * src/**\/*.test.tsx, this gives full coverage of the rendered UI under
 * real Mantine + React rendering, against a real Chromium engine.
 *
 * Notes
 * -----
 *  - We disable the `region` rule on detail pages because Mantine's
 *    `<Container>` uses `<div>` as the root by default — wrapping every
 *    page in a `<main>` landmark is handled by AppLayout and is already
 *    asserted on the layout itself. Adding a second landmark per page
 *    creates redundant noise without improving real-world a11y.
 *  - We use `disableRules` instead of `withRules` so any new violation
 *    introduced by future changes is caught automatically.
 *  - We tolerate axe's "color-contrast" check on Mantine's icon-only
 *    action buttons in the dashboard — the buttons have visible focus
 *    rings and accessible names, which is what matters for SR users.
 *    The contrast check is already enforced by Lighthouse on the login
 *    page, where the brand button is the canonical primary CTA.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { installApiMocks } from "./helpers/mockApi";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(
  page: Page,
  contextLabel: string,
  options: { modalOpen?: boolean } = {},
) {
  const disabled = ["landmark-one-main", "region"];
  if (options.modalOpen) {
    // Mantine renders a modal's title bar as a <header>, which axe counts as a
    // second banner because it does not honour aria-modal. Assistive technology
    // does: the page behind a modal is out of its reach while it is open.
    disabled.push("landmark-no-duplicate-banner", "landmark-unique");
  }
  const builder = new AxeBuilder({ page })
    // We include `best-practice` so axe's heading-order rule fires on
    // every page — the WCAG tags alone don't cover hierarchy regressions.
    // We then disable the rules that are already handled elsewhere or
    // that produce false positives against Mantine's components.
    .withTags([...WCAG_TAGS, "best-practice"])
    // The login screen sits outside <main> intentionally; landmark assertions
    // on every page would be redundant with the AppLayout tests.
    .disableRules(disabled);

  const results = await builder.analyze();

  if (results.violations.length > 0) {
    const summary = results.violations
      .map(
        (v) =>
          `[${v.id}] ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"}) → ${v.helpUrl}`,
      )
      .join("\n");
    throw new Error(
      `axe found ${results.violations.length} accessibility violation${
        results.violations.length === 1 ? "" : "s"
      } on ${contextLabel}:\n${summary}`,
    );
  }
}

test.describe("Accessibility (post-auth)", () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        "cap.auth.v1",
        JSON.stringify({ adminName: "Erik", apiKey: "test-key-123" }),
      );
    });
  });

  test("Dashboard is accessible", async ({ page }) => {
    await page.goto("/");
    // The dashboard heading is a time-aware greeting ("Good morning" /
    // "Good afternoon" / "Good evening" / "Hello") followed by the admin
    // first name. We anchor on the constant suffix.
    await expect(page.getByRole("heading", { name: /, Erik$/ })).toBeVisible();
    await scan(page, "Dashboard");
  });

  test("Database servers list is accessible", async ({ page }) => {
    await page.goto("/database-servers");
    await expect(page.getByText("us-east-prod-01")).toBeVisible();
    await scan(page, "Database servers list");
  });

  test("Database server detail is accessible", async ({ page }) => {
    await page.goto("/database-servers/1");
    await expect(page.getByRole("heading", { name: /us-east-prod-01/i })).toBeVisible();
    await scan(page, "Database server detail");
  });

  test("Databases list is accessible", async ({ page }) => {
    await page.goto("/databases");
    // The database name renders inside a Mantine `<Anchor>` so we anchor
    // on the link role (more stable than free-text matching against
    // monospace styling).
    await expect(page.getByRole("link", { name: "tenant_acme" })).toBeVisible();
    await scan(page, "Databases list");
  });

  test("Database detail is accessible", async ({ page }) => {
    await page.goto("/databases/100");
    // Detail page renders the database name as the title.
    await expect(page.getByRole("heading", { name: /tenant_acme/i })).toBeVisible();
    await scan(page, "Database detail");
  });

  test("Authorized users list is accessible", async ({ page }) => {
    await page.goto("/authorized-users");
    await expect(
      page.getByRole("heading", { name: /Authorized users/i }),
    ).toBeVisible();
    await scan(page, "Authorized users list");
  });

  test("Static DB users list is accessible", async ({ page }) => {
    await page.goto("/static-users");
    await expect(
      page.getByRole("heading", { name: /Static database users/i }),
    ).toBeVisible();
    await scan(page, "Static DB users list");
  });

  // The scheme follows the operator's system setting, and contrast differs
  // between the two, so the pages with the most muted text are checked dark too.
  for (const [path, heading] of [
    ["/", /, Erik$/],
    ["/database-servers", /Database servers/i],
    ["/static-users", /Static database users/i],
  ] as const) {
    test(`${path} is accessible in the dark scheme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await scan(page, `${path} (dark)`);
    });
  }

  // Field errors are red text, which is where contrast has failed before, so a
  // form showing them is checked in both schemes.
  for (const scheme of ["light", "dark"] as const) {
    test(`a form showing field errors is accessible (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/databases");
      await page
        .getByRole("button", { name: /Add database/i })
        .first()
        .click();
      const dialog = page.getByRole("dialog", { name: /Add database/i });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel(/^Database name/).fill("");
      await dialog.getByRole("button", { name: /Create database/i }).click();
      await expect(dialog.getByText(/Database name is required/i)).toBeVisible();
      await scan(page, `field errors (${scheme})`, { modalOpen: true });
    });
  }

  test("a list with more than one page is accessible", async ({ page }) => {
    await installApiMocks(page, { manyServers: true });
    await page.goto("/database-servers");
    await expect(page.getByText("bulk-server-01")).toBeVisible();
    // The arrow controls are icon buttons; they must be named.
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous page" })).toBeVisible();
    await scan(page, "Multi-page list");
  });
});
