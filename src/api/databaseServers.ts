import { httpClient } from "./httpClient";
import type {
  CreateDatabaseServerInfoRequest,
  CreateDatabaseServerInfoResponse,
  DatabaseServerInfoItem,
  GetAllDatabaseServerInfoResponse,
  GetDatabaseServerInfoResponse,
  UpdateDatabaseServerInfoRequest,
  UpdateDatabaseServerInfoResponse,
} from "./types";

export const databaseServersApi = {
  async list(): Promise<DatabaseServerInfoItem[]> {
    const { data } = await httpClient.get<GetAllDatabaseServerInfoResponse>(
      "/get-all-database-server-info",
    );
    return data.DatabaseServerInfoList ?? [];
  },

  async get(id: number): Promise<GetDatabaseServerInfoResponse> {
    const { data } = await httpClient.get<GetDatabaseServerInfoResponse>(
      `/get-database-server-info/${id}`,
    );
    return data;
  },

  async create(
    request: CreateDatabaseServerInfoRequest,
  ): Promise<CreateDatabaseServerInfoResponse> {
    const { data } = await httpClient.post<CreateDatabaseServerInfoResponse>(
      "/create-database-server-info",
      request,
    );
    return data;
  },

  async update(
    request: UpdateDatabaseServerInfoRequest,
  ): Promise<UpdateDatabaseServerInfoResponse> {
    const { data } = await httpClient.put<UpdateDatabaseServerInfoResponse>(
      "/update-database-server-info",
      request,
    );
    return data;
  },

  /**
   * Calls the (planned) backend endpoint
   *   DELETE /My/delete-database-server-info/{id}
   * documented in BACKEND-CONTRACT.md. Will return 404 until the
   * controller method is added on the backend; the UI gates this call
   * behind the `deletes` feature flag so it never fires by default.
   */
  async remove(id: number): Promise<{ Success: boolean; Message: string | null }> {
    const { data } = await httpClient.delete<{
      Success: boolean;
      Message: string | null;
    }>(`/delete-database-server-info/${id}`);
    return data;
  },
};
