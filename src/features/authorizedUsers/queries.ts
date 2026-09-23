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
    // Its variables hold the user's password. With no cache time it leaves the
    // MutationCache once the page resets it on close, not five minutes later.
    gcTime: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ["authorized-users"] });
      // Authorized users per server and database are capacity inputs.
      qc.invalidateQueries({ queryKey: ["server-capacity"] });
    },
  });
}

export function useUpdateAuthorizedUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateUserRequest) => authorizedUsersApi.update(request),
    // Its variables can hold a new password; see useCreateAuthorizedUser.
    gcTime: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authorized-users"] });
      // Authorized users per server and database are capacity inputs.
      qc.invalidateQueries({ queryKey: ["server-capacity"] });
    },
  });
}

export function useDeleteAuthorizedUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number | string) => authorizedUsersApi.remove(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authorized-users"] });
      // Authorized users per server and database are capacity inputs.
      qc.invalidateQueries({ queryKey: ["server-capacity"] });
    },
  });
}

export const authorizedUserKeys = KEYS;
