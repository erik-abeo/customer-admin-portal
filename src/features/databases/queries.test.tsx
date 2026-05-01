/**
 * Tests for the database query hooks that back the detail page.
 *
 * `useDatabase(id)` fetches `GET /My/get-database-info/{id}` and unwraps
 * the `{ Success, Message, DatabaseInfo }` envelope. We mock the API
 * module so we don't need an axios adapter, and exercise:
 *  1. successful unwrap to a DatabaseInfoItem
 *  2. `Success: false` becomes a thrown ApiError surfaced as `query.error`
 *  3. `placeholderData` is sourced from the list cache so deep links paint
 *     instantly while the by-id refetch happens in the background
 *  4. disabled state when `id` is undefined
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { databasesApi } from "@/api/databases";
import { ApiError } from "@/api/httpClient";
import type { DatabaseInfoItem, GetDatabaseInfoResponse } from "@/api/types";
import { databaseKeys, useDatabase } from "./queries";

vi.mock("@/api/databases", () => ({
  databasesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const sampleItem: DatabaseInfoItem = {
  Id: 42,
  DatabaseServerId: 7,
  DatabaseName: "customer_acme",
  Description: "Acme tenant",
  CrystalPmId: 1234,
};

const okResponse: GetDatabaseInfoResponse = {
  Success: true,
  Message: null,
  DatabaseInfo: sampleItem,
};

const notFoundResponse: GetDatabaseInfoResponse = {
  Success: false,
  Message: "Database 999 not found",
  DatabaseInfo: null,
};

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe("useDatabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the unwrapped DatabaseInfo on success", async () => {
    vi.mocked(databasesApi.get).mockResolvedValueOnce(okResponse);

    const client = makeClient();
    const { result } = renderHook(() => useDatabase(42), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual(sampleItem);
    expect(databasesApi.get).toHaveBeenCalledWith(42);
  });

  it("surfaces Success:false as an ApiError on the query", async () => {
    vi.mocked(databasesApi.get).mockResolvedValueOnce(notFoundResponse);

    const client = makeClient();
    const { result } = renderHook(() => useDatabase(999), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).message).toContain("999");
  });

  it("uses the list cache as placeholderData while refetching by id", async () => {
    let resolveGet: ((value: GetDatabaseInfoResponse) => void) | null = null;
    vi.mocked(databasesApi.get).mockImplementation(
      () =>
        new Promise<GetDatabaseInfoResponse>((resolve) => {
          resolveGet = resolve;
        }),
    );

    const client = makeClient();
    client.setQueryData<DatabaseInfoItem[]>(databaseKeys.all, [sampleItem]);

    const { result } = renderHook(() => useDatabase(42), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.data).toEqual(sampleItem);
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isLoading).toBe(false);

    resolveGet!({
      Success: true,
      Message: null,
      DatabaseInfo: { ...sampleItem, Description: "Updated" },
    });

    await waitFor(() => {
      expect(result.current.isPlaceholderData).toBe(false);
    });
    expect(result.current.data?.Description).toBe("Updated");
  });

  it("does not call the API when id is undefined", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useDatabase(undefined), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe("idle");
    });
    expect(databasesApi.get).not.toHaveBeenCalled();
  });
});
