import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { movesApi } from "@/api/moves";
import type { CreateCustomerMoveRequest, CustomerMove } from "@/api/types";

const KEYS = {
  all: ["customer-moves"] as const,
  detail: (id: number) => ["customer-moves", id] as const,
};

/** Phases a move is still working through, and therefore worth polling for. */
const ACTIVE = new Set(["planned", "draining", "copying", "verifying"]);

/** Phases an operator can still cancel from: nothing has been copied yet. */
const CANCELLABLE = new Set(["planned", "draining"]);

export const isActiveMove = (status: string | null | undefined): boolean =>
  ACTIVE.has(status ?? "");

export const canCancelMove = (status: string | null | undefined): boolean =>
  CANCELLABLE.has(status ?? "");

/**
 * Ids of moves that were active in `before` and are not in `after`: the ones
 * that just cut over, failed or were cancelled.
 */
export const movesThatSettled = (
  before: ReadonlySet<number>,
  after: ReadonlyArray<Pick<CustomerMove, "Id" | "Status">>,
): number[] =>
  after.filter((m) => before.has(m.Id) && !isActiveMove(m.Status)).map((m) => m.Id);

/**
 * Five seconds while something is moving.
 *
 * A move quiesces the customer, so during it somebody is almost certainly
 * watching this page waiting to see it finish. A list of settled moves is
 * static and stops polling entirely.
 */
const ACTIVE_POLL_MS = 5_000;

/**
 * Refreshes what a move changes once one stops moving.
 *
 * A move that cuts over repoints a database at another server, and one that
 * fails or is cancelled puts it back to active. Polling only watches the move,
 * so without this the database list and the capacity view would keep showing
 * the customer where they were until something else refetched them.
 */
function useRefreshWhenMovesSettle(moves: ReadonlyArray<CustomerMove> | undefined) {
  const qc = useQueryClient();
  const active = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!moves) return;
    if (movesThatSettled(active.current, moves).length > 0) {
      qc.invalidateQueries({ queryKey: ["databases"] });
      qc.invalidateQueries({ queryKey: ["server-capacity"] });
    }
    active.current = new Set(
      moves.filter((m) => isActiveMove(m.Status)).map((m) => m.Id),
    );
  }, [moves, qc]);
}

export function useCustomerMoves() {
  const query = useQuery({
    queryKey: KEYS.all,
    queryFn: () => movesApi.list(),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((m) => isActiveMove(m.Status))
        ? ACTIVE_POLL_MS
        : false,
  });
  useRefreshWhenMovesSettle(query.data);
  return query;
}

export function useCustomerMove(id: number | undefined) {
  const query = useQuery({
    queryKey: id ? KEYS.detail(id) : ["customer-moves", "disabled"],
    queryFn: () => movesApi.get(id as number),
    enabled: id !== undefined,
    refetchInterval: (query) =>
      isActiveMove(query.state.data?.Move?.Status) ? ACTIVE_POLL_MS : false,
  });
  // Query results are structurally shared, so the move keeps its identity
  // between polls until something in it changes.
  const move = query.data?.Move;
  const asList = useMemo(() => (move ? [move] : undefined), [move]);
  useRefreshWhenMovesSettle(asList);
  return query;
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
  // Each of these repoints, restores or removes a database, so the registry
  // and the capacity view are stale the moment they succeed.
  qc.invalidateQueries({ queryKey: ["databases"] });
  qc.invalidateQueries({ queryKey: ["server-capacity"] });
};

export function useCancelCustomerMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => movesApi.cancel(id),
    onSuccess: (_data, id) => invalidateMoveAndDatabases(qc, id),
  });
}

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
