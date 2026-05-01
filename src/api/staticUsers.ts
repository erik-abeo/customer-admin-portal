import { httpClient } from "./httpClient";
import type {
  CreateStaticDatabaseUserRequest,
  CreateStaticDatabaseUserResponse,
  GetStaticDatabaseUserDetailResponse,
  GetStaticDatabaseUserResponse,
  UpdateStaticDatabaseUserRequest,
  UpdateStaticDatabaseUserResponse,
} from "./types";

export const staticUsersApi = {
  async list(): Promise<GetStaticDatabaseUserResponse[]> {
    const { data } = await httpClient.get<GetStaticDatabaseUserResponse[]>(
      "/get-all-static-database-users",
    );
    return data ?? [];
  },

  async listByServer(
    databaseServerId: number,
  ): Promise<GetStaticDatabaseUserResponse[]> {
    const { data } = await httpClient.get<GetStaticDatabaseUserResponse[]>(
      `/get-static-database-users-by-server/${databaseServerId}`,
    );
    return data ?? [];
  },

  async listByDatabase(databaseId: number): Promise<GetStaticDatabaseUserResponse[]> {
    const { data } = await httpClient.get<GetStaticDatabaseUserResponse[]>(
      `/get-static-database-users-by-database/${databaseId}`,
    );
    return data ?? [];
  },

  async get(id: number): Promise<GetStaticDatabaseUserDetailResponse> {
    const { data } = await httpClient.get<GetStaticDatabaseUserDetailResponse>(
      `/get-static-database-user/${id}`,
    );
    return data;
  },

  async create(
    request: CreateStaticDatabaseUserRequest,
  ): Promise<CreateStaticDatabaseUserResponse> {
    const { data } = await httpClient.post<CreateStaticDatabaseUserResponse>(
      "/create-static-database-user",
      request,
    );
    return data;
  },

  async update(
    request: UpdateStaticDatabaseUserRequest,
  ): Promise<UpdateStaticDatabaseUserResponse> {
    const { data } = await httpClient.put<UpdateStaticDatabaseUserResponse>(
      "/update-static-database-user",
      request,
    );
    return data;
  },

  /**
   * Calls the (planned) backend endpoint
   *   DELETE /My/delete-static-database-user/{id}
   * documented in BACKEND-CONTRACT.md. The endpoint is per (server,user)
   * row, matching the existing list semantics; the UI invokes it once
   * per server the user exists on, then invalidates the list. Gated
   * behind the `deletes` feature flag.
   */
  async remove(id: number): Promise<{ Success: boolean; Message: string | null }> {
    const { data } = await httpClient.delete<{
      Success: boolean;
      Message: string | null;
    }>(`/delete-static-database-user/${id}`);
    return data;
  },
};
