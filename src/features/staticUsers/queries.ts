import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { staticUsersApi } from "@/api/staticUsers";
import type {
  CreateStaticDatabaseUserRequest,
  UpdateStaticDatabaseUserRequest,
} from "@/api/types";

const KEYS = {
  all: ["static-users"] as const,
  detail: (id: number) => ["static-users", id] as const,
};

export function useStaticUsers() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: () => staticUsersApi.list(),
  });
}

export function useStaticUser(id: number | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : ["static-users", "disabled"],
    queryFn: () => staticUsersApi.get(id as number),
    enabled: id !== undefined,
  });
}

/** Static grant counts, and whether they can be relied on yet. */
export interface StaticGrantCounts {
  /** Grants per database id; only complete once `status` is "ready". */
  counts: Map<number, number>;
  /**
   * "loading" until every user's grants have been read, "error" if any read
   * failed, "ready" once all have. Until "ready" the counts must not be taken
   * as zero: a database could carry grants that have not been read.
   */
  status: "idle" | "loading" | "error" | "ready";
}

/**
 * How many static user privileges each database carries, keyed by database id.
 * Counted as the service counts them for a move's refusal: one per user row
 * per database.
 *
 * The list does not carry grants, so each row's detail is read; it shares the
 * detail query with the edit form. Pass `enabled` false to read nothing.
 */
export function useStaticGrantCounts(enabled: boolean): StaticGrantCounts {
  const list = useQuery({
    queryKey: KEYS.all,
    queryFn: () => staticUsersApi.list(),
    enabled,
  });
  const details = useQueries({
    queries: (enabled ? (list.data ?? []) : []).map((row) => ({
      queryKey: KEYS.detail(row.Id),
      queryFn: () => staticUsersApi.get(row.Id),
    })),
  });
  const counts = new Map<number, number>();
  if (!enabled) return { counts, status: "idle" };
  if (list.isError || details.some((d) => d.isError))
    return { counts, status: "error" };
  if (!list.data || details.some((d) => !d.data)) return { counts, status: "loading" };
  for (const detail of details)
    for (const grant of detail.data?.DatabasePrivileges ?? [])
      counts.set(grant.DatabaseId, (counts.get(grant.DatabaseId) ?? 0) + 1);
  return { counts, status: "ready" };
}

export function useCreateStaticUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateStaticDatabaseUserRequest) =>
      staticUsersApi.create(request),
    // The result holds the generated password in plain text. With no cache
    // time it leaves the MutationCache as soon as the page resets the
    // mutation, as the migration key does, rather than lingering five minutes.
    gcTime: 0,
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateStaticUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateStaticDatabaseUserRequest) =>
      staticUsersApi.update(request),
    // A rotation's result holds the new password; see useCreateStaticUser.
    gcTime: 0,
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(variables.Id) });
    },
  });
}

/**
 * The static-user list groups rows by username and a logical user can
 * exist on multiple servers; deletion therefore takes the *list of
 * row IDs* for that user and removes each.
 */
export function useDeleteStaticUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rowIds: number[]) => {
      const results = await Promise.all(rowIds.map((id) => staticUsersApi.remove(id)));
      return results;
    },
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export const staticUserKeys = KEYS;
