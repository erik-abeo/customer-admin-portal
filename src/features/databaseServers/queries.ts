import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { databaseServersApi } from "@/api/databaseServers";
import type {
  CreateDatabaseServerInfoRequest,
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

export function useDatabaseServer(id: number | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : ["database-servers", "disabled"],
    queryFn: () => databaseServersApi.get(id as number),
    enabled: id !== undefined,
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
