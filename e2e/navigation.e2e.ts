import { expect, test } from "@playwright/test";

import { installApiMocks } from "./helpers/mockApi";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);

    // Pre-seed sessionStorage so we land authenticated. This avoids
    // re-running the login flow in every test.
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        "cap.auth.v1",
        JSON.stringify({ adminName: "Erik", apiKey: "test-key-123" }),
      );
    });
  });

  test("primary nav routes resolve and render their headings", async ({ page }) => {
    await page.goto("/");

    const targets: Array<{ link: RegExp; heading: RegExp }> = [
      { link: /^Database servers$/i, heading: /Database servers/i },
      { link: /^Databases$/i, heading: /Databases/i },
      { link: /^Authorized users$/i, heading: /Authorized users/i },
      { link: /^Static DB users$/i, heading: /Static database users/i },
    ];

    for (const t of targets) {
      await page.getByRole("link", { name: t.link }).click();
      await expect(page.getByRole("heading", { name: t.heading })).toBeVisible();
    }
  });

  test("server list renders mocked rows", async ({ page }) => {
    await page.goto("/database-servers");
    await expect(page.getByText("us-east-prod-01")).toBeVisible();
    await expect(page.getByText("us-east-prod-02")).toBeVisible();
  });

  test("empty state shows CTA on the servers page", async ({ page }) => {
    await installApiMocks(page, { empty: true });
    await page.goto("/database-servers");
    await expect(page.getByText(/no database servers registered yet/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /add your first server/i }),
    ).toBeVisible();
  });
});
