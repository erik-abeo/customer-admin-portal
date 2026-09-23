import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { movesApi } from "@/api/moves";
import type {
  CreateCustomerMoveRequest,
  CustomerMove,
  DatabaseInfoItem,
  MigrationSessionItem,
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

const hasRecordedSource = (move: CustomerMove): boolean =>
  !move.SourceDroppedDateTimeUtc && Boolean(move.SourceDatabaseName?.trim());

/**
 * Whether a move can be rolled back: cut over, source still there and its name
 * recorded. The service refuses a move with no recorded source name.
 */
export const canRollBackMove = (move: CustomerMove): boolean =>
  move.Status === "flipped" && hasRecordedSource(move);

/**
 * Whether a move's source can be dropped: cut over with the source still there,
 * or settled by a drop that never finished. The service claims a move by
 * settling it before it drops the source, so a drop interrupted after that claim
 * leaves it settled with no drop recorded, and the service finishes it when
 * asked again.
 */
export const canDropMoveSource = (move: CustomerMove): boolean =>
  (move.Status === "flipped" || move.Status === "settled") && hasRecordedSource(move);

/**
 * Whether a move still holds the customer, by the service's own rule
 * (`UnsettledCondition` in CustomerMoveRepository): planned, draining, copying,
 * verifying or flipped, or settled by a source drop that has not finished. While
 * one does, the service refuses another move of the same database.
 */
/**
 * Whether a move result asks for work by hand. The service says so only in
 * words: a cancel whose empty target could not be dropped succeeds with "needs
 * dropping by hand", and one whose status restore failed fails with "Set the
 * database's status back to active by hand".
 */
export const needsWorkByHand = (message: string | null | undefined): boolean =>
  /by hand/i.test(message ?? "");

export const isUnsettledMove = (move: CustomerMove): boolean =>
  ["planned", "draining", "copying", "verifying", "flipped"].includes(
    move.Status ?? "",
  ) ||
  (move.Status === "settled" && !move.SourceDroppedDateTimeUtc);

/**
 * Why a database cannot be moved now, or null when it can: it is not active, or
 * an earlier move of it is still unsettled. After a flip the database is active
 * again on the target, so status alone does not catch the second.
 */
export const whyDatabaseNotMovable = (
  database: DatabaseInfoItem,
  moves: ReadonlyArray<CustomerMove>,
  sessions: ReadonlyArray<MigrationSessionItem> = [],
  staticGrants?: ReadonlyMap<number, number>,
): string | null => {
  const unavailable = whyDatabaseUnavailable(database.Status);
  if (unavailable) return unavailable;
  // Refused by the service too: the grants live on the source server, and a
  // move does not carry them, so they would still point at the old copy.
  const grants = staticGrants?.get(database.Id) ?? 0;
  if (grants > 0)
    return `${grants} static user privilege(s) are held on it, and moves do not carry static users yet`;
  const unsettled = moves.find(
    (m) => m.DatabaseId === database.Id && isUnsettledMove(m),
  );
  if (!unsettled) {
    // The service refuses this too: quiescing does not stop the installer's
    // login, so a move would copy under a stream still writing.
    const streaming = sessions.some(
      (s) =>
        s.DatabaseId === database.Id &&
        (s.Status === "redeemed" || s.Status === "streaming"),
    );
    return streaming ? "a migration is streaming into it" : null;
  }
  if (unsettled.Status === "flipped")
    return "a cut-over move has not been settled or rolled back";
  if (unsettled.Status === "settled") return "a move's source drop has not finished";
  return "a move of it is already in progress";
};

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
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

const invalidateMoveAndDatabases = (
  qc: ReturnType<typeof useQueryClient>,
  id: number,
) => {
  qc.invalidateQueries({ queryKey: KEYS.all });
  qc.invalidateQueries({ queryKey: KEYS.detail(id) });
  // Each of these repoints, restores or removes a database, so the registry
  // and the capacity view are stale once they finish, even when they fail.
  qc.invalidateQueries({ queryKey: ["databases"] });
  qc.invalidateQueries({ queryKey: ["server-capacity"] });
};

export function useCancelCustomerMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => movesApi.cancel(id),
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: (_data, _error, id) => invalidateMoveAndDatabases(qc, id),
  });
}

export function useRollBackCustomerMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => movesApi.rollBack(id),
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: (_data, _error, id) => invalidateMoveAndDatabases(qc, id),
  });
}

export function useDropCustomerMoveSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => movesApi.dropSource(id),
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: (_data, _error, id) => invalidateMoveAndDatabases(qc, id),
  });
}

export const customerMoveKeys = KEYS;
