import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { migrationsApi } from "@/api/migrations";
import type { CreateMigrationSessionRequest } from "@/api/types";
import { useRefreshOnStatusChange } from "@/lib/statusChanges";

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
const isActive = (status: string | null | undefined) =>
  status === "pending" || status === "redeemed" || status === "streaming";

/**
 * What a session's status changes. Redeeming a key for a new database registers
 * it, and a discard or a failure can change what a server holds, so the
 * database list and the capacity view are refetched on every status change.
 */
const CHANGED_BY_A_SESSION = [["databases"], ["server-capacity"]] as const;

export function useMigrationSessions() {
  const query = useQuery({
    queryKey: KEYS.all,
    queryFn: () => migrationsApi.list(),
    // Poll only while at least one session could still change. A list of
    // finished migrations is static, and refetching it forever would be waste
    // the operator pays for in a browser tab they forgot to close.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((s) => isActive(s.Status)) ? ACTIVE_POLL_MS : false,
  });
  useRefreshOnStatusChange(query.data, CHANGED_BY_A_SESSION);
  return query;
}

export function useMigrationSession(id: number | undefined) {
  const query = useQuery({
    queryKey: id ? KEYS.detail(id) : ["migration-sessions", "disabled"],
    queryFn: () => migrationsApi.get(id as number),
    enabled: id !== undefined,
    refetchInterval: (query) =>
      isActive(query.state.data?.Session?.Status) ? ACTIVE_POLL_MS : false,
  });
  // Structurally shared, so the session keeps its identity until it changes.
  const session = query.data?.Session;
  const asList = useMemo(() => (session ? [session] : undefined), [session]);
  useRefreshOnStatusChange(asList, CHANGED_BY_A_SESSION);
  return query;
}

export function useCreateMigrationSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateMigrationSessionRequest) =>
      migrationsApi.create(request),
    // The result holds the key in plain text. With no cache time it leaves the
    // MutationCache as soon as the page resets the mutation, rather than
    // lingering for the default five minutes.
    gcTime: 0,
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useRevokeMigrationSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => migrationsApi.revoke(id),
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: (_data, _error, id) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useDiscardMigrationTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => migrationsApi.discardTarget(id),
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: (_data, _error, id) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
      // The database registry changed too: discarding drops the registration
      // along with the schema, and the server holds one fewer customer.
      qc.invalidateQueries({ queryKey: ["databases"] });
      qc.invalidateQueries({ queryKey: ["server-capacity"] });
    },
  });
}

export const migrationSessionKeys = KEYS;
