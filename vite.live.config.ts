import { defineConfig, mergeConfig } from "vite";

import { LIVE_API_PORT, LIVE_PORTAL_PORT } from "./e2e/live/ports";
import baseConfig from "./vite.config";

/**
 * Preview server for the live Playwright suite only (playwright.live.config.ts).
 *
 * Serves the `live` build and proxies /My to the real API process the suite
 * starts, so the browser reaches the API on the portal's own origin, which is
 * how the production nginx serves them and why the API needs no CORS policy.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    build: { outDir: "dist-live" },
    preview: {
      host: "127.0.0.1",
      port: LIVE_PORTAL_PORT,
      strictPort: true,
      proxy: {
        "/My": { target: `http://127.0.0.1:${LIVE_API_PORT}`, changeOrigin: true },
      },
    },
  }),
);
