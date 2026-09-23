import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

interface HasStatus {
  Id: number;
  Status: string | null;
}

/**
 * Ids whose status differs between the last poll and this one. An id not seen
 * before is not a change: the first poll only establishes what things are.
 */
export const changedStatuses = (
  before: ReadonlyMap<number, string | null>,
  after: ReadonlyArray<HasStatus>,
): number[] =>
  after
    .filter((item) => before.has(item.Id) && before.get(item.Id) !== item.Status)
    .map((item) => item.Id);

/**
 * Refetches other views when a polled record changes status.
 *
 * Polling watches one kind of record, but its status changes move others: a
 * customer move marks its database `moving` and later repoints or restores it,
 * and redeeming a migration key registers a database. Without this the
 * database list and the capacity view would show the old state until something
 * else refetched them.
 */
export function useRefreshOnStatusChange(
  items: ReadonlyArray<HasStatus> | undefined,
  refresh: ReadonlyArray<QueryKey>,
) {
  const qc = useQueryClient();
  const seen = useRef<Map<number, string | null>>(new Map());
  // Held in a ref so a caller passing a fresh array each render does not re-run
  // the effect; only new data should.
  const keys = useRef(refresh);
  keys.current = refresh;

  useEffect(() => {
    if (!items) return;
    if (changedStatuses(seen.current, items).length > 0) {
      for (const queryKey of keys.current) qc.invalidateQueries({ queryKey });
    }
    for (const item of items) seen.current.set(item.Id, item.Status);
  }, [items, qc]);
}
