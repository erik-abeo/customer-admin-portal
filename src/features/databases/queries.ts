import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/httpClient";
import { databasesApi } from "@/api/databases";
import type {
  CreateDatabaseInfoRequest,
  DatabaseInfoItem,
  UpdateDatabaseInfoRequest,
} from "@/api/types";

const KEYS = {
  all: ["databases"] as const,
  detail: (id: number) => ["databases", id] as const,
};

export function useDatabases() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: () => databasesApi.list(),
  });
}

/**
 * Fetch a single database by id. Backed by `GET /My/get-database-info/{id}`.
 *
 * Returns `DatabaseInfoItem` on success; throws an `ApiError` if the
 * backend reports `Success: false` (e.g. invalid id, soft-deleted record)
 * or if `DatabaseInfo` is null. HTTP-level errors propagate from axios.
 *
 * If the list cache (`useDatabases`) already has a matching record, that
 * value is surfaced as `placeholderData` so deep-link visits paint
 * instantly while the by-id refetch happens in the background.
 *
 * `enabled: id !== undefined` keeps the hook safe to mount before the
 * route param has been parsed.
 */
export function useDatabase(id: number | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: id ? KEYS.detail(id) : ["databases", "disabled"],
    enabled: id !== undefined,
    queryFn: async (): Promise<DatabaseInfoItem> => {
      const response = await databasesApi.get(id as number);
      if (!response.Success || !response.DatabaseInfo) {
        throw new ApiError(
          response.Message ?? `Database ${id} not found`,
          response.Success ? 404 : 500,
          response,
        );
      }
      return response.DatabaseInfo;
    },
    placeholderData: () => {
      if (id === undefined) return undefined;
      const cached = qc.getQueryData<DatabaseInfoItem[]>(KEYS.all);
      return cached?.find((d) => d.Id === id);
    },
  });
}

export function useCreateDatabase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateDatabaseInfoRequest) => databasesApi.create(request),
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      // A server's customer count, and its verdict, are capacity inputs.
      qc.invalidateQueries({ queryKey: ["server-capacity"] });
    },
  });
}

export function useUpdateDatabase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateDatabaseInfoRequest) => databasesApi.update(request),
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(variables.Id) });
      // Moving a registration to another server changes both servers' counts.
      qc.invalidateQueries({ queryKey: ["server-capacity"] });
      // Both user lists carry where their databases are: an authorized user's
      // mappings name the server, and a static user's grants are listed per
      // server, and the per-database user reads are keyed by server.
      qc.invalidateQueries({ queryKey: ["authorized-users"] });
      qc.invalidateQueries({ queryKey: ["static-users"] });
      // Migration sessions show the database's name and server, read live, and
      // the discard confirm quotes both.
      qc.invalidateQueries({ queryKey: ["migration-sessions"] });
    },
  });
}

export function useDeleteDatabase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => databasesApi.remove(id),
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ["server-capacity"] });
    },
    // The detail goes only once the record is gone.
    onSuccess: (_data, id) => qc.removeQueries({ queryKey: KEYS.detail(id) }),
  });
}

export const databaseKeys = KEYS;
