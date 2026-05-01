/**
 * One-call entry point that swaps the network layer for the in-memory
 * demo adapter. Call this *before* React mounts so:
 *
 *   1. The shared `httpClient` instance picks up the demo adapter for
 *      every list / detail / mutation in the SPA.
 *   2. `axios.defaults.adapter` is also patched so the LoginPage's
 *      raw `axios.get(...)` probe (which doesn't go through httpClient)
 *      is also intercepted.
 *
 * Idempotent — calling it twice is a no-op.
 */
import axios from "axios";

import { httpClient } from "@/api/httpClient";

import { demoAdapter } from "./demoAdapter";

let installed = false;

export function installDemoMode(): void {
  if (installed) return;
  installed = true;
  // The cast is safe: axios's runtime adapter contract accepts any
  // function returning a Promise<AxiosResponse>. The .d.ts overloads
  // are intentionally narrow on the consumer side.
  httpClient.defaults.adapter = demoAdapter;
  axios.defaults.adapter = demoAdapter;
  console.info(
    "%c[Customer Admin Portal] Demo mode active — all API calls are served from in-memory fixtures.",
    "color: #4f70ff; font-weight: 600;",
  );
}

export function isDemoModeInstalled(): boolean {
  return installed;
}
