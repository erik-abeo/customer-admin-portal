import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

export function useCreateStaticUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateStaticDatabaseUserRequest) =>
      staticUsersApi.create(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateStaticUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateStaticDatabaseUserRequest) =>
      staticUsersApi.update(request),
    onSuccess: (_data, variables) => {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export const staticUserKeys = KEYS;
