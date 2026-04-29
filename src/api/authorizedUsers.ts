import { httpClient } from "./httpClient";
import type {
  AuthorizedUserInfoItem,
  CreateUserRequest,
  GetAuthorizedUserResponse,
  GetAuthorizedUsersResponse,
  UpdateUserRequest,
} from "./types";

export const authorizedUsersApi = {
  async list(): Promise<AuthorizedUserInfoItem[]> {
    const { data } = await httpClient.get<GetAuthorizedUsersResponse>("/get-users");
    return data.AuthorizedUserInfoList ?? [];
  },

  async listForDatabase(
    databaseServerId: number,
    databaseId: number,
  ): Promise<AuthorizedUserInfoItem[]> {
    const { data } = await httpClient.get<GetAuthorizedUsersResponse>(
      `/get-users/${databaseServerId}/${databaseId}`,
    );
    return data.AuthorizedUserInfoList ?? [];
  },

  async get(userId: number | string): Promise<GetAuthorizedUserResponse> {
    const { data } = await httpClient.get<GetAuthorizedUserResponse>(
      `/get-user/${userId}`,
    );
    return data;
  },

  async create(request: CreateUserRequest): Promise<unknown> {
    const { data } = await httpClient.post("/create-user", request);
    return data;
  },

  async update(request: UpdateUserRequest): Promise<unknown> {
    const { data } = await httpClient.put("/update-user", request);
    return data;
  },

  async remove(userId: number | string): Promise<unknown> {
    const { data } = await httpClient.delete(`/delete-user/${userId}`);
    return data;
  },
};
