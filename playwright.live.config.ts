import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the live suite: the real portal build against the real
 * ClientRemoteDatabaseAccessAPI and real MySQL 8.4 and MariaDB 10.6 servers.
 *
 * The mocked suite (playwright.config.ts) stays the everyday check; this one
 * proves the portal and the service agree about everything the mocks assume.
 *
 * Needs, from the crystalpm repository, the API's test containers running:
 *   docker compose -f tests/ClientRemoteDatabaseAccessAPI.Tests/docker-compose.test.yml up -d
 * and the .NET 8 SDK and Docker on the path. Then:
 *   npm run test:e2e:live
 *
 * The tests share one authorization database and run in order, one worker.
 */
export default defineConfig({
  testDir: "./e2e/live",
  testMatch: /.*\.live\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  globalSetup: "./e2e/live/globalSetup.ts",

  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command:
      "npx vite build --mode live --outDir dist-live && npx vite preview --config vite.live.config.ts",
    port: 4174,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
