import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { dumpsApi } from "@/api/dumps";
import type {
  CreateDumpRequest,
  ImportDumpRequest,
  UpdateDumpRequest,
} from "@/api/types";

const KEYS = {
  all: ["dumps"] as const,
  filtered: (filter: { databaseServerId?: number; databaseId?: number }) =>
    ["dumps", "filtered", filter] as const,
};

export function useDumps(filter?: { databaseServerId?: number; databaseId?: number }) {
  const key = filter ? KEYS.filtered(filter) : KEYS.all;
  return useQuery({
    queryKey: key,
    queryFn: () => dumpsApi.list(filter),
  });
}

export function useCreateDump() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateDumpRequest) => dumpsApi.create(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateDump() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateDumpRequest) => dumpsApi.update(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteDump() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => dumpsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useImportDump() {
  return useMutation({
    mutationFn: (request: ImportDumpRequest) => dumpsApi.import(request),
  });
}

export function useUploadDump() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      file: File;
      databaseServerId: number;
      databaseId: number;
      description?: string | null;
      onProgress?: (loaded: number, total: number) => void;
    }) =>
      dumpsApi.upload(
        args.file,
        {
          databaseServerId: args.databaseServerId,
          databaseId: args.databaseId,
          description: args.description ?? null,
        },
        args.onProgress,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export const dumpKeys = KEYS;
