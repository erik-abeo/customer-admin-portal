import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { startProgress, stopProgress } from "./progressBar";

/**
 * Subscribes to the TanStack Query mutation cache and drives the global
 * navigation progress bar while any mutation is in-flight. Combined with
 * the route-level Suspense fallback, this means every administrative
 * action (route change, save, delete) gets visible top-of-page feedback.
 *
 * Coordinates with `PageFallback` via the refcounted `progressBar`
 * wrapper, so a finishing mutation can never hide the bar while a
 * route chunk is still loading (and vice versa).
 */
export function MutationProgress() {
  const qc = useQueryClient();

  useEffect(() => {
    const cache = qc.getMutationCache();
    let pendingShown = false;

    const sync = () => {
      const next = cache.getAll().filter((m) => m.state.status === "pending").length;
      if (next > 0 && !pendingShown) {
        startProgress();
        pendingShown = true;
      } else if (next === 0 && pendingShown) {
        stopProgress();
        pendingShown = false;
      }
    };

    const unsubscribe = cache.subscribe(sync);
    sync();

    return () => {
      unsubscribe();
      if (pendingShown) {
        stopProgress();
        pendingShown = false;
      }
    };
  }, [qc]);

  return null;
}
