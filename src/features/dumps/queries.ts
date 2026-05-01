import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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

/**
 * Upload mutation that surfaces a 0..1 progress fraction to the caller.
 * `progress` is `null` while idle and during the brief "request issued
 * but no upload-progress event yet" window — render an indeterminate
 * indicator in that case.
 */
export function useUploadDump() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: async (args: {
      file: File;
      databaseServerId: number;
      databaseId: number;
      description?: string | null;
    }) => {
      setProgress(null);
      return dumpsApi.upload(
        args.file,
        {
          databaseServerId: args.databaseServerId,
          databaseId: args.databaseId,
          description: args.description ?? null,
        },
        (loaded, total) => {
          if (total > 0) {
            setProgress(Math.min(1, loaded / total));
          }
        },
      );
    },
    onSettled: () => setProgress(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });

  // Mantine's <Progress value={0..100} animated /> takes a finite value,
  // so callers should treat `null` as "indeterminate" (use the `animated`
  // prop in that case).
  return Object.assign(mutation, { progress });
}

export const dumpKeys = KEYS;
