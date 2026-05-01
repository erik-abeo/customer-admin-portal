import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { databaseServersApi } from "@/api/databaseServers";
import type {
  CreateDatabaseServerInfoRequest,
  DatabaseServerInfoItem,
  UpdateDatabaseServerInfoRequest,
} from "@/api/types";

const KEYS = {
  all: ["database-servers"] as const,
  detail: (id: number) => ["database-servers", id] as const,
};

export function useDatabaseServers() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: () => databaseServersApi.list(),
  });
}

/**
 * Fetch a single database server by id. Backed by
 * `GET /My/get-database-server-info/{id}`.
 *
 * If the list cache (`useDatabaseServers`) already has a matching record,
 * that value is surfaced as `placeholderData` so deep-link visits paint
 * instantly while the by-id refetch happens in the background.
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
