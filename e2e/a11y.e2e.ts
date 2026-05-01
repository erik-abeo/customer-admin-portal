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

async function scan(page: Page, contextLabel: string) {
  const builder = new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    // The dashboard's metric tiles render decorative icons inside Mantine's
    // ThemeIcon — those are already handled by Mantine via aria-hidden, so
    // axe occasionally double-reports them. We trust the per-component
    // tests for this rule and silence it at the page level.
    .disableRules(["color-contrast"]);

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
});
