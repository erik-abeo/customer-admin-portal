import { httpClient } from "./httpClient";
import type {
  CreateDatabaseInfoRequest,
  CreateDatabaseInfoResponse,
  DatabaseInfoItem,
  GetAllDatabaseInfoResponse,
  GetDatabaseInfoResponse,
  UpdateDatabaseInfoRequest,
  UpdateDatabaseInfoResponse,
} from "./types";

export const databasesApi = {
  async list(): Promise<DatabaseInfoItem[]> {
    const { data } = await httpClient.get<GetAllDatabaseInfoResponse>(
      "/get-all-database-info",
    );
    return data.DatabaseInfoList ?? [];
  },

  async get(id: number): Promise<GetDatabaseInfoResponse> {
    const { data } = await httpClient.get<GetDatabaseInfoResponse>(
      `/get-database-info/${id}`,
    );
    return data;
  },

  async create(
    request: CreateDatabaseInfoRequest,
  ): Promise<CreateDatabaseInfoResponse> {
    const { data } = await httpClient.post<CreateDatabaseInfoResponse>(
      "/create-database-info",
      request,
    );
    return data;
  },

  async update(
    request: UpdateDatabaseInfoRequest,
  ): Promise<UpdateDatabaseInfoResponse> {
    const { data } = await httpClient.put<UpdateDatabaseInfoResponse>(
      "/update-database-info",
      request,
    );
    return data;
  },

  /**
   * Calls the (planned) backend endpoint
   *   DELETE /My/delete-database-info/{id}
   * documented in BACKEND-CONTRACT.md. Will return 404 until the
   * controller method is added on the backend; the UI gates this call
   * behind the `deletes` feature flag.
   */
  async remove(id: number): Promise<{ Success: boolean; Message: string | null }> {
    const { data } = await httpClient.delete<{
      Success: boolean;
      Message: string | null;
    }>(`/delete-database-info/${id}`);
    return data;
  },
};
