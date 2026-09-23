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
import type { DatabaseServerInfoItem, ProbeDatabaseServerResponse } from "@/api/types";
import {
  databaseServerKeys,
  useDatabaseServer,
  useDatabaseServerForEdit,
  useDatabaseServers,
  useProbeDatabaseServer,
} from "./queries";

vi.mock("@/api/databaseServers", () => ({
  databaseServersApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    probe: vi.fn(),
  },
}));

const sampleItem: DatabaseServerInfoItem = {
  Id: 7,
  Name: "primary-east",
  Description: "Primary east-coast cluster",
  LocalServerAddress: "10.0.1.10",
  RemoteServerAddress: "db-east.crystalpm.internal",
  ServerPort: 3306,
  AdminUserName: "cpmadmin",
  RootUserPassword: "•••",
  Certificate: null,
  SecurityGroupId: null,
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

describe("useDatabaseServers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps no administrator password or certificate in the list cache", async () => {
    vi.mocked(databaseServersApi.list).mockResolvedValueOnce([
      {
        ...sampleItem,
        RootUserPassword: "Real-Admin-Pass!",
        Certificate: "-----BEGIN CERTIFICATE-----",
      },
    ]);
    const client = makeClient();
    const { result } = renderHook(() => useDatabaseServers(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = client.getQueryData<DatabaseServerInfoItem[]>(
      databaseServerKeys.all,
    );
    expect(cached?.[0].Name).toBe("primary-east");
    expect(cached?.[0].RootUserPassword).toBe("");
    expect(cached?.[0].Certificate).toBeNull();
  });
});

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
    expect(result.current.data).toEqual({
      ...sampleItem,
      RootUserPassword: "",
      HasCertificate: false,
    });
    expect(databaseServersApi.get).toHaveBeenCalledWith(7);
  });

  it("keeps no password or certificate, only whether a certificate is stored", async () => {
    vi.mocked(databaseServersApi.get).mockResolvedValueOnce({
      ...sampleItem,
      RootUserPassword: "Real-Admin-Pass!",
      Certificate: "-----BEGIN CERTIFICATE-----",
    });
    const client = makeClient();
    const { result } = renderHook(() => useDatabaseServer(7), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = client.getQueryData<DatabaseServerInfoItem>(
      databaseServerKeys.detail(7),
    );
    expect(cached?.RootUserPassword).toBe("");
    expect(cached?.Certificate).toBeNull();
    expect(result.current.data?.HasCertificate).toBe(true);
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
    const listed = { ...sampleItem, HasCertificate: false };
    client.setQueryData(databaseServerKeys.all, [listed]);

    const { result } = renderHook(() => useDatabaseServer(7), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.data).toEqual(listed);
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

describe("useProbeDatabaseServer", () => {
  const unsupported: ProbeDatabaseServerResponse = {
    Success: true,
    Message:
      "This server cannot be registered: MySql 5.7 is below the supported minimum.",
    Engine: "MySql",
    EngineVersion: "5.7.44",
    RawVersion: "5.7.44",
    MeetsMinimumVersion: false,
    TlsInUse: true,
    CanCreateDatabase: true,
    CanCreateUser: true,
    CanGrant: true,
    CanSeeConnections: true,
    IsSupported: false,
    Checks: [
      { Name: "connect", Passed: true, Detail: "Connected to db.example:3306." },
      {
        Name: "version",
        Passed: false,
        Detail: "MySql 5.7.44 is below the supported minimum of 8.0.",
      },
    ],
  };

  it("returns a reachable-but-unsupported server as data rather than an error", async () => {
    // The distinction the UI depends on: an unusable server still answers 200,
    // so the mutation resolves and the caller reads IsSupported. Treating this
    // as a failure would lose the per-check detail that says why.
    vi.mocked(databaseServersApi.probe).mockResolvedValue(unsupported);

    const client = makeClient();
    const { result } = renderHook(() => useProbeDatabaseServer(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({
      Host: "db.example",
      Port: "3306",
      User: "cpmadmin",
      Password: "secret",
      SslMode: "Required",
      CertificatePem: null,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.IsSupported).toBe(false);
    expect(result.current.data?.Checks).toHaveLength(2);
  });
});

describe("useDatabaseServerForEdit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the stored secrets and drops them once the form unmounts", async () => {
    const stored = { ...sampleItem, RootUserPassword: "Real-Admin-Pass!" };
    vi.mocked(databaseServersApi.get).mockResolvedValueOnce(stored);
    // Default gcTime, so it is the hook's own gcTime 0 that drops the entry.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(() => useDatabaseServerForEdit(7), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.data).toEqual(stored));
    unmount();
    await waitFor(() =>
      expect(client.getQueryData(databaseServerKeys.edit(7))).toBeUndefined(),
    );
  });

  it("does not fetch while the form is closed", () => {
    renderHook(() => useDatabaseServerForEdit(undefined), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(databaseServersApi.get).not.toHaveBeenCalled();
  });
});
