import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authorizedUsersApi } from "@/api/authorizedUsers";
import type { CreateUserRequest, UpdateUserRequest } from "@/api/types";

const KEYS = {
  all: ["authorized-users"] as const,
  byDatabase: (serverId: number, databaseId: number) =>
    ["authorized-users", "by-database", serverId, databaseId] as const,
  detail: (id: number | string) => ["authorized-users", String(id)] as const,
};

export function useAuthorizedUsers() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: () => authorizedUsersApi.list(),
  });
}

export function useAuthorizedUsersForDatabase(
  serverId: number | undefined,
  databaseId: number | undefined,
) {
  return useQuery({
    queryKey:
      serverId !== undefined && databaseId !== undefined
        ? KEYS.byDatabase(serverId, databaseId)
        : ["authorized-users", "by-database", "disabled"],
    queryFn: () =>
      authorizedUsersApi.listForDatabase(serverId as number, databaseId as number),
    enabled: serverId !== undefined && databaseId !== undefined,
  });
}

export function useCreateAuthorizedUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateUserRequest) => authorizedUsersApi.create(request),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ["authorized-users"] });
    },
  });
}

export function useUpdateAuthorizedUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateUserRequest) => authorizedUsersApi.update(request),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authorized-users"] });
    },
  });
}

export function useDeleteAuthorizedUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number | string) => authorizedUsersApi.remove(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authorized-users"] });
    },
  });
}

export const authorizedUserKeys = KEYS;
