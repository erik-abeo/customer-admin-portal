import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { databasesApi } from "@/api/databases";
import type { CreateDatabaseInfoRequest, UpdateDatabaseInfoRequest } from "@/api/types";

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

export function useCreateDatabase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateDatabaseInfoRequest) => databasesApi.create(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateDatabase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateDatabaseInfoRequest) => databasesApi.update(request),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(variables.Id) });
    },
  });
}

export function useDeleteDatabase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => databasesApi.remove(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.removeQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export const databaseKeys = KEYS;
