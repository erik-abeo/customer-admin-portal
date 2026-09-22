import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { movesApi } from "@/api/moves";
import type { CreateCustomerMoveRequest } from "@/api/types";

const KEYS = {
  all: ["customer-moves"] as const,
  detail: (id: number) => ["customer-moves", id] as const,
};

/** Phases a move is still working through, and therefore worth polling for. */
const ACTIVE = new Set([
  "planned",
  "quiescing",
  "draining",
  "copying",
  "verifying",
]);

/**
 * Five seconds while something is moving.
 *
 * A move quiesces the customer, so during it somebody is almost certainly
 * watching this page waiting to see it finish. A list of settled moves is
 * static and stops polling entirely.
 */
const ACTIVE_POLL_MS = 5_000;

export function useCustomerMoves() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: () => movesApi.list(),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((m) => ACTIVE.has(m.Status))
        ? ACTIVE_POLL_MS
        : false,
  });
}

export function useCustomerMove(id: number | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : ["customer-moves", "disabled"],
    queryFn: () => movesApi.get(id as number),
    enabled: id !== undefined,
    refetchInterval: (query) =>
      ACTIVE.has(query.state.data?.Move?.Status ?? "") ? ACTIVE_POLL_MS : false,
  });
}

export function useCreateCustomerMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateCustomerMoveRequest) => movesApi.create(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

const invalidateMoveAndDatabases = (
  qc: ReturnType<typeof useQueryClient>,
  id: number,
) => {
  qc.invalidateQueries({ queryKey: KEYS.all });
  qc.invalidateQueries({ queryKey: KEYS.detail(id) });
  // Both of these repoint or remove a database, so the registry and the
  // capacity view are stale the moment they succeed.
  qc.invalidateQueries({ queryKey: ["databases"] });
  qc.invalidateQueries({ queryKey: ["server-capacity"] });
};

export function useRollBackCustomerMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => movesApi.rollBack(id),
    onSuccess: (_data, id) => invalidateMoveAndDatabases(qc, id),
  });
}

export function useDropCustomerMoveSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => movesApi.dropSource(id),
    onSuccess: (_data, id) => invalidateMoveAndDatabases(qc, id),
  });
}

export const customerMoveKeys = KEYS;
