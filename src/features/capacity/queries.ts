import { useQuery } from "@tanstack/react-query";

import { capacityApi } from "@/api/capacity";

const KEYS = {
  fleet: ["server-capacity"] as const,
  server: (id: number) => ["server-capacity", id] as const,
};

/**
 * Measuring the fleet queries every server, so this is deliberately not on a
 * short stale time. It refetches when the operator asks, not on every focus.
 */
const STALE_MS = 60_000;

export function useFleetCapacity() {
  return useQuery({
    queryKey: KEYS.fleet,
    queryFn: () => capacityApi.fleet(),
    staleTime: STALE_MS,
  });
}

export function useServerCapacity(id: number | undefined) {
  return useQuery({
    queryKey: id ? KEYS.server(id) : ["server-capacity", "disabled"],
    queryFn: () => capacityApi.server(id as number),
    enabled: id !== undefined,
    staleTime: STALE_MS,
  });
}

export const serverCapacityKeys = KEYS;
