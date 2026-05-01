import { httpClient } from "./httpClient";
import type {
  CreateDumpRequest,
  CreateDumpResponse,
  DumpInfoItem,
  GetAllDumpsResponse,
  ImportDumpRequest,
  ImportDumpResponse,
  UpdateDumpRequest,
  UpdateDumpResponse,
} from "./types";

/**
 * Database-dump management. All endpoints below are PENDING BACKEND
 * implementation; see BACKEND-CONTRACT.md → "Dumps". The UI surface that
 * calls these methods is gated behind `features.dumps`.
 */
export const dumpsApi = {
  async list(filter?: {
    databaseServerId?: number;
    databaseId?: number;
  }): Promise<DumpInfoItem[]> {
    const params: Record<string, string> = {};
    if (filter?.databaseServerId) {
      params.databaseServerId = String(filter.databaseServerId);
    }
    if (filter?.databaseId) {
      params.databaseId = String(filter.databaseId);
    }
    const { data } = await httpClient.get<GetAllDumpsResponse>("/get-all-dumps", {
      params,
    });
    return data.Dumps ?? [];
  },

  async create(request: CreateDumpRequest): Promise<CreateDumpResponse> {
    const { data } = await httpClient.post<CreateDumpResponse>("/create-dump", request);
    return data;
  },

  async update(request: UpdateDumpRequest): Promise<UpdateDumpResponse> {
    const { data } = await httpClient.put<UpdateDumpResponse>("/update-dump", request);
    return data;
  },

  async remove(id: number): Promise<{ Success: boolean; Message: string | null }> {
    const { data } = await httpClient.delete<{
      Success: boolean;
      Message: string | null;
    }>(`/delete-dump/${id}`);
    return data;
  },

  async import(request: ImportDumpRequest): Promise<ImportDumpResponse> {
    const { data } = await httpClient.post<ImportDumpResponse>("/import-dump", request);
    return data;
  },

  /**
   * Multipart upload of a dump file. Backend should accept a single
   * `file` field plus optional `databaseServerId` / `databaseId` /
   * `description` form fields, and return the new DumpInfoItem.
   */
  async upload(
    file: File,
    metadata: {
      databaseServerId: number;
      databaseId: number;
      description?: string | null;
    },
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<CreateDumpResponse> {
    const form = new FormData();
    form.append("file", file);
    form.append("databaseServerId", String(metadata.databaseServerId));
    form.append("databaseId", String(metadata.databaseId));
    if (metadata.description) {
      form.append("description", metadata.description);
    }
    const { data } = await httpClient.post<CreateDumpResponse>("/upload-dump", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress) onProgress(e.loaded, e.total ?? file.size);
      },
    });
    return data;
  },
};
