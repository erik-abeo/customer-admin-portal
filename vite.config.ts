/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split commonly-stable third-party code into its own long-lived
        // chunk so a portal-only deploy doesn't invalidate the vendor cache.
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@mantine") || id.includes("@tabler")) return "mantine";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("react-router")) return "router";
          // Group everything else (react, react-dom, scheduler, fontsource,
          // axios, zod, ...) into a single long-lived vendor chunk to avoid
          // circular dependencies between react and other vendored libs.
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
    },
  },
});
