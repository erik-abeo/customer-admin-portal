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
};

/**
 * A server with its decrypted administrator password and certificate removed.
 * The list endpoint returns both for every server, and nearly every page uses
 * the list only for names and ids, so they are dropped before the list reaches
 * the query cache rather than kept there for every server on every page.
 */
export const withoutSecrets = (
  server: DatabaseServerInfoItem,
): DatabaseServerInfoItem => ({
  ...server,
  RootUserPassword: "",
  Certificate: null,
});

/**
 * Every server, without secrets. For a server's own password and certificate,
 * which only the edit form needs, use {@link useDatabaseServer}.
 */
export function useDatabaseServers() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: async () => (await databaseServersApi.list()).map(withoutSecrets),
  });
}

/**
 * Fetch a single database server by id. Backed by
 * `GET /My/get-database-server-info/{id}`.
 *
 * If the list cache (`useDatabaseServers`) already has a matching record,
 * that value is surfaced as `placeholderData` so deep-link visits paint
 * instantly while the by-id refetch happens in the background. The placeholder
 * has no secrets, so anything that needs them, the edit form above all, must
 * wait until `isPlaceholderData` is false.
 */
export function useDatabaseServer(id: number | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: id ? KEYS.detail(id) : ["database-servers", "disabled"],
    queryFn: () => databaseServersApi.get(id as number),
    enabled: id !== undefined,
    placeholderData: () => {
      if (id === undefined) return undefined;
      const cached = qc.getQueryData<DatabaseServerInfoItem[]>(KEYS.all);
      return cached?.find((s) => s.Id === id);
    },
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
  });
}

export function useCreateDatabaseServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateDatabaseServerInfoRequest) =>
      databaseServersApi.create(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateDatabaseServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateDatabaseServerInfoRequest) =>
      databaseServersApi.update(request),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(variables.Id) });
    },
  });
}

export function useDeleteDatabaseServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => databaseServersApi.remove(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.removeQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export const databaseServerKeys = KEYS;
