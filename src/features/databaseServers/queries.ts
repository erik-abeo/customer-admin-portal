import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { databaseServersApi } from "@/api/databaseServers";
import type {
  CreateDatabaseServerInfoRequest,
  DatabaseServerInfoItem,
  ProbeDatabaseServerRequest,
  UpdateDatabaseServerInfoRequest,
} from "@/api/types";

const KEYS = {
  all: ["database-servers"] as const,
  detail: (id: number) => ["database-servers", id] as const,
  // Under detail, so invalidating or removing a server's detail covers it.
  edit: (id: number) => ["database-servers", id, "edit"] as const,
};

/** A server as the cache holds it: no password, and only whether a CA is stored. */
export type DatabaseServerWithoutSecrets = DatabaseServerInfoItem & {
  HasCertificate: boolean;
};

/**
 * A server with its decrypted administrator password and certificate removed.
 * Both endpoints return them, and apart from the edit form every page uses a
 * server only for its name, address and whether it has a CA, so they are
 * dropped before the result reaches the query cache.
 */
export const withoutSecrets = (
  server: DatabaseServerInfoItem,
): DatabaseServerWithoutSecrets => ({
  ...server,
  RootUserPassword: "",
  Certificate: null,
  HasCertificate: Boolean(server.Certificate?.trim()),
});

/**
 * Every server, without secrets. For a server's own password and certificate,
 * which only the edit form needs, use {@link useDatabaseServerForEdit}.
 */
export function useDatabaseServers() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: async () => (await databaseServersApi.list()).map(withoutSecrets),
  });
}

/**
 * Fetch a single database server by id, without secrets. Backed by
 * `GET /My/get-database-server-info/{id}`.
 *
 * If the list cache (`useDatabaseServers`) already has a matching record,
 * that value is surfaced as `placeholderData` so deep-link visits paint
 * instantly while the by-id refetch happens in the background. Both are
 * stripped the same way, so the placeholder is as complete as the result.
 */
export function useDatabaseServer(id: number | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: id ? KEYS.detail(id) : ["database-servers", "disabled"],
    queryFn: async () => withoutSecrets(await databaseServersApi.get(id as number)),
    enabled: id !== undefined,
    placeholderData: () => {
      if (id === undefined) return undefined;
      const cached = qc.getQueryData<DatabaseServerWithoutSecrets[]>(KEYS.all);
      return cached?.find((s) => s.Id === id);
    },
  });
}

/**
 * A server with its decrypted password and certificate, for the edit form and
 * nothing else. Pass `undefined` while the form is closed. It is never served
 * from cache (`gcTime` 0 drops it as soon as the form unmounts) and has no
 * placeholder, so the form only ever opens on the stored values.
 */
export function useDatabaseServerForEdit(id: number | undefined) {
  return useQuery({
    queryKey: id ? KEYS.edit(id) : ["database-servers", "edit", "disabled"],
    queryFn: () => databaseServersApi.get(id as number),
    enabled: id !== undefined,
    gcTime: 0,
    staleTime: 0,
  });
}

/**
 * Probes a candidate server on demand.
 *
 * A mutation rather than a query despite being read-only: it runs when the
 * operator asks, against whatever is in the form at that moment, and caching a
 * result keyed on a password would be both useless and unwise.
 */
export function useProbeDatabaseServer() {
  return useMutation({
    mutationFn: (request: ProbeDatabaseServerRequest) =>
      databaseServersApi.probe(request),
    // Its variables hold the admin password, the stored one on an edit. With no
    // cache time the mutation leaves the MutationCache as soon as the form
    // using it unmounts, rather than lingering for the default five minutes.
    gcTime: 0,
  });
}

export function useCreateDatabaseServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateDatabaseServerInfoRequest) =>
      databaseServersApi.create(request),
    // Its variables hold the admin password; the page resets it on close.
    gcTime: 0,
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      // A new server is a new row in the fleet reading.
      qc.invalidateQueries({ queryKey: ["server-capacity"] });
    },
  });
}

export function useUpdateDatabaseServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateDatabaseServerInfoRequest) =>
      databaseServersApi.update(request),
    // Its variables can hold a new admin password; the page resets it on close.
    gcTime: 0,
    // On settled, not only on success: a request that fails can still have
    // changed the server (a 500 after a partial write, a revoke whose login drop
    // failed, a drop-source that failed after claiming the move), and the page
    // should show what is there now rather than what was there before.
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(variables.Id) });
      // Name and address show in, and are measured by, the capacity reading.
      qc.invalidateQueries({ queryKey: ["server-capacity"] });
      // Moves and migration sessions read the server's name live, and the
      // destructive confirms (drop source, discard) quote it.
      qc.invalidateQueries({ queryKey: ["customer-moves"] });
      qc.invalidateQueries({ queryKey: ["migration-sessions"] });
    },
  });
}

export function useDeleteDatabaseServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => databaseServersApi.remove(id),
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

export const databaseServerKeys = KEYS;
