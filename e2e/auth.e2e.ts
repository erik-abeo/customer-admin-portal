import { expect, test } from "@playwright/test";

import { installApiMocks } from "./helpers/mockApi";

test.describe("Authentication", () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
  });

  test("login page renders branding and a key field", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /Customer Admin Portal/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/api key/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("submitting an API key signs in and routes to the dashboard", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByLabel(/admin name/i).fill("Erik");
    await page.getByLabel(/api key/i).fill("test-key-123");
    await page.getByRole("button", { name: /sign in/i }).click();

    // After sign-in we're on the dashboard; the side-nav is the most stable
    // anchor (greeting text varies with time of day).
    await expect(page.getByRole("link", { name: /^Database servers$/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/$/);
  });

  test("unauthenticated visits to a protected route bounce to /login", async ({
    page,
  }) => {
    await page.goto("/database-servers");
    await expect(page).toHaveURL(/\/login/);
  });
});
