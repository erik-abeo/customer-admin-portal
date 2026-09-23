import { beforeEach, describe, expect, it, vi } from "vitest";

import { authorizedUsersApi } from "./authorizedUsers";
import { ApiError, httpClient } from "./httpClient";

describe("authorizedUsersApi reads", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("throws the service's Message when a list answers 200 with Success false", async () => {
    // The service's shape when it cannot read users: 200, Success false, null list.
    vi.spyOn(httpClient, "get").mockResolvedValue({
      data: {
        Success: false,
        Message: "Internal server error",
        AuthorizedUserInfoList: null,
      },
    });

    const failed = authorizedUsersApi.list();
    await expect(failed).rejects.toBeInstanceOf(ApiError);
    await expect(failed).rejects.toThrow("Internal server error");
    await expect(authorizedUsersApi.listForDatabase(1, 2)).rejects.toThrow(
      "Internal server error",
    );
  });

  it("returns an empty list only when the read succeeded with none", async () => {
    vi.spyOn(httpClient, "get").mockResolvedValue({
      data: {
        Success: true,
        Message: "Users retrieved successfully",
        AuthorizedUserInfoList: null,
      },
    });
    await expect(authorizedUsersApi.list()).resolves.toEqual([]);
  });

  it("throws for a single user the service could not read", async () => {
    vi.spyOn(httpClient, "get").mockResolvedValue({
      data: { Success: false, Message: "User not found in custom database" },
    });
    await expect(authorizedUsersApi.get(5)).rejects.toThrow(
      "User not found in custom database",
    );
  });
});
