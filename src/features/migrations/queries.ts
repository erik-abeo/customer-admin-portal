import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { migrationsApi } from "@/api/migrations";
import type { CreateMigrationSessionRequest } from "@/api/types";

const KEYS = {
  all: ["migration-sessions"] as const,
  detail: (id: number) => ["migration-sessions", id] as const,
};

/**
 * How often a session list or detail refetches while something is streaming.
 *
 * Progress arrives from an installer heartbeat, so there is nothing to
 * subscribe to; polling is the honest mechanism. Five seconds is frequent
 * enough that a phase change feels live and slow enough that leaving the page
 * open does not hammer the gateway.
 */
const ACTIVE_POLL_MS = 5_000;

/** A session that is still doing something, and therefore worth polling for. */
const isActive = (status: string | undefined) =>
  status === "pending" || status === "redeemed" || status === "streaming";

export function useMigrationSessions() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: () => migrationsApi.list(),
    // Poll only while at least one session could still change. A list of
    // finished migrations is static, and refetching it forever would be waste
    // the operator pays for in a browser tab they forgot to close.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((s) => isActive(s.Status)) ? ACTIVE_POLL_MS : false,
  });
}

export function useMigrationSession(id: number | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : ["migration-sessions", "disabled"],
    queryFn: () => migrationsApi.get(id as number),
    enabled: id !== undefined,
    refetchInterval: (query) =>
      isActive(query.state.data?.Session?.Status) ? ACTIVE_POLL_MS : false,
  });
}

export function useCreateMigrationSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateMigrationSessionRequest) =>
      migrationsApi.create(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useRevokeMigrationSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => migrationsApi.revoke(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export const migrationSessionKeys = KEYS;
