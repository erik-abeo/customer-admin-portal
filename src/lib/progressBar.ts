import { nprogress } from "@mantine/nprogress";

/**
 * Refcounted wrapper around `@mantine/nprogress` so multiple independent
 * callers (route-level Suspense fallback + TanStack Query mutation cache)
 * can drive the same progress bar without prematurely hiding it.
 *
 * Behavior:
 *   - First `start()` (count goes 0 → 1) calls the underlying `nprogress.start`.
 *   - Subsequent `start()` calls only increment the counter.
 *   - `stop()` calls decrement; only the final one (count goes 1 → 0)
 *     calls `nprogress.complete`.
 *   - `reset()` force-clears the counter and bar (useful for tests).
 */

let count = 0;

export function startProgress(): void {
  count += 1;
  if (count === 1) {
    nprogress.start();
  }
}

export function stopProgress(): void {
  if (count === 0) return;
  count -= 1;
  if (count === 0) {
    nprogress.complete();
  }
}

/** Test helper — resets internal state and force-completes the bar. */
export function resetProgressForTests(): void {
  count = 0;
  nprogress.complete();
}

/** Test helper — exposes the internal pending-count. */
export function getProgressCountForTests(): number {
  return count;
}
