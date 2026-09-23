import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { movesApi } from "@/api/moves";
import type {
  CreateCustomerMoveRequest,
  CustomerMove,
  DatabaseInfoItem,
} from "@/api/types";
import { whyDatabaseUnavailable } from "@/features/databases/status";
import { useRefreshOnStatusChange } from "@/lib/statusChanges";

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
 * Whether a move still has a retained source to roll back to or drop: cut over,
 * source not yet dropped, and its name recorded. The service refuses both
 * actions for a move with no recorded source name, so they are not offered.
 */
export const hasRetainedSource = (move: CustomerMove): boolean =>
  move.Status === "flipped" &&
  !move.SourceDroppedDateTimeUtc &&
  Boolean(move.SourceDatabaseName?.trim());

/**
 * Why a database cannot be moved now, or null when it can: it is not active, or
 * an earlier move of it has cut over and not been settled or rolled back. After
 * a flip the database is active again on the target, so status alone does not
 * catch the second; the service refuses it for the same reason.
 */
export const whyDatabaseNotMovable = (
  database: DatabaseInfoItem,
  moves: ReadonlyArray<CustomerMove>,
): string | null =>
  whyDatabaseUnavailable(database.Status) ??
  (moves.some((m) => m.DatabaseId === database.Id && m.Status === "flipped")
    ? "a cut-over move has not been settled or rolled back"
    : null);

/**
 * Five seconds while something is moving.
 *
 * A move quiesces the customer, so during it somebody is almost certainly
 * watching this page waiting to see it finish. A list of settled moves is
 * static and stops polling entirely.
 */
const ACTIVE_POLL_MS = 5_000;

/**
 * What a move's status changes. Planning marks the database `moving`, cutting
 * over repoints it at another server, and failing, cancelling or rolling back
 * restores it, so every phase change is a reason to refetch these.
 */
const MOVED_BY_A_MOVE = [["databases"], ["server-capacity"]] as const;

export function useCustomerMoves() {
  const query = useQuery({
    queryKey: KEYS.all,
    queryFn: () => movesApi.list(),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((m) => isActiveMove(m.Status))
        ? ACTIVE_POLL_MS
        : false,
  });
  useRefreshOnStatusChange(query.data, MOVED_BY_A_MOVE);
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
  useRefreshOnStatusChange(asList, MOVED_BY_A_MOVE);
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
