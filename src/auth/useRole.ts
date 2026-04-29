import { useSyncExternalStore } from "react";

import { type AdminRole, getCurrentRole, subscribeRole } from "./roles";

/**
 * React hook that returns the current admin role and re-renders when it
 * changes. Powered by the role pub/sub in `roles.ts`, which is updated
 * by the httpClient response interceptor.
 */
export function useRole(): AdminRole {
  return useSyncExternalStore(
    (cb) => subscribeRole(() => cb()),
    () => getCurrentRole(),
    () => getCurrentRole(),
  );
}

export function useCanWrite(): boolean {
  return useRole() === "admin";
}
