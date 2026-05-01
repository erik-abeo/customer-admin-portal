/**
 * Tests for the database server query hooks that back the detail page.
 *
 * `useDatabaseServer(id)` fetches `GET /My/get-database-server-info/{id}`.
 * The C# `GetDatabaseServerInfoResponse` is the bare item shape (no
 * envelope), so the hook returns the item directly. We exercise:
 *  1. successful fetch
 *  2. `placeholderData` is sourced from the list cache so navigating from
 *     the list page paints instantly
 *  3. disabled state when `id` is undefined
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { databaseServersApi } from "@/api/databaseServers";
import type { DatabaseServerInfoItem } from "@/api/types";
import { databaseServerKeys, useDatabaseServer } from "./queries";

vi.mock("@/api/databaseServers", () => ({
  databaseServersApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const sampleItem: DatabaseServerInfoItem = {
  Id: 7,
  Name: "primary-east",
  Description: "Primary east-coast cluster",
  LocalServerAddress: "10.0.1.10",
  RemoteServerAddress: "db-east.crystalpm.internal",
  ServerPort: 3306,
  RootUserPassword: "•••",
  Certificate: null,
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

describe("useDatabaseServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the server item on success", async () => {
    vi.mocked(databaseServersApi.get).mockResolvedValueOnce(sampleItem);

    const client = makeClient();
    const { result } = renderHook(() => useDatabaseServer(7), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual(sampleItem);
    expect(databaseServersApi.get).toHaveBeenCalledWith(7);
  });

  it("uses the list cache as placeholderData while refetching by id", async () => {
    let resolveGet: ((value: DatabaseServerInfoItem) => void) | null = null;
    vi.mocked(databaseServersApi.get).mockImplementation(
      () =>
        new Promise<DatabaseServerInfoItem>((resolve) => {
          resolveGet = resolve;
        }),
    );

    const client = makeClient();
    client.setQueryData<DatabaseServerInfoItem[]>(databaseServerKeys.all, [sampleItem]);

    const { result } = renderHook(() => useDatabaseServer(7), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.data).toEqual(sampleItem);
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isLoading).toBe(false);

    resolveGet!({ ...sampleItem, Description: "Updated" });

    await waitFor(() => {
      expect(result.current.isPlaceholderData).toBe(false);
    });
    expect(result.current.data?.Description).toBe("Updated");
  });

  it("does not call the API when id is undefined", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useDatabaseServer(undefined), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe("idle");
    });
    expect(databaseServersApi.get).not.toHaveBeenCalled();
  });
});
