import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Customer Admin Portal.
 *
 * The tests run against `vite preview` (the production build) so we exercise
 * the same bundle that ships to staging/production. All API calls are mocked
 * with `page.route()` — there is no live backend dependency.
 *
 * Run locally:
 *   npm run build
 *   npm run test:e2e            # headless Chromium
 *   npm run test:e2e -- --ui    # UI mode for debugging
 *
 * First-time browser install:
 *   npx playwright install --with-deps chromium
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Build the SPA in `test` mode (loads .env.test → VITE_API_BASE_URL=http://api.test)
  // and serve via `vite preview`. The mocked routes in e2e/helpers/mockApi.ts
  // intercept network calls to that origin.
  webServer: {
    command: "npm run e2e:serve",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
