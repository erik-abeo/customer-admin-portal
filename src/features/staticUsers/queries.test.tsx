import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { staticUsersApi } from "@/api/staticUsers";

import {
  useCreateStaticUser,
  useStaticGrantCounts,
  useUpdateStaticUser,
} from "./queries";

vi.mock("@/api/staticUsers", () => ({
  staticUsersApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

/** Whether anything in the MutationCache still holds the password. */
const cacheHolds = (client: QueryClient, secret: string) =>
  client
    .getMutationCache()
    .getAll()
    .some((m) => JSON.stringify(m.state.data ?? null).includes(secret));

describe("static user mutations", () => {
  it("drop a generated password from the MutationCache once reset", async () => {
    vi.mocked(staticUsersApi.create).mockResolvedValue({
      Message: "Success",
      UserName: "static_user_9",
      Servers: [{ UserPassword: "Gen-Secret-1" }],
    } as never);
    const client = new QueryClient();
    const { result } = renderHook(() => useCreateStaticUser(), {
      wrapper: wrapperFor(client),
    });

    await act(() => result.current.mutateAsync({} as never));
    expect(cacheHolds(client, "Gen-Secret-1")).toBe(true);

    act(() => result.current.reset());
    await waitFor(() => expect(cacheHolds(client, "Gen-Secret-1")).toBe(false));
  });

  it("drop a rotated password from the MutationCache once reset", async () => {
    vi.mocked(staticUsersApi.update).mockResolvedValue({
      Message: "Success",
      UserName: "static_user_9",
      NewPassword: "Rotated-Secret-2",
      Servers: [],
    } as never);
    const client = new QueryClient();
    const { result } = renderHook(() => useUpdateStaticUser(), {
      wrapper: wrapperFor(client),
    });

    await act(() => result.current.mutateAsync({ Id: 9 } as never));
    expect(cacheHolds(client, "Rotated-Secret-2")).toBe(true);

    act(() => result.current.reset());
    await waitFor(() => expect(cacheHolds(client, "Rotated-Secret-2")).toBe(false));
  });
});

describe("useStaticGrantCounts", () => {
  it("counts each database's static grants once every user's detail has loaded", async () => {
    vi.mocked(staticUsersApi.list).mockResolvedValue([{ Id: 1 }, { Id: 2 }] as never);
    vi.mocked(staticUsersApi.get).mockImplementation(
      async (id: number) =>
        ({
          Id: id,
          DatabasePrivileges:
            id === 1
              ? [{ DatabaseId: 100 }, { DatabaseId: 101 }]
              : [{ DatabaseId: 100 }],
        }) as never,
    );
    const { result } = renderHook(() => useStaticGrantCounts(true), {
      wrapper: wrapperFor(new QueryClient()),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.counts.get(100)).toBe(2);
    expect(result.current.counts.get(101)).toBe(1);
  });

  it("reads nothing while disabled", () => {
    vi.mocked(staticUsersApi.list).mockClear();
    const { result } = renderHook(() => useStaticGrantCounts(false), {
      wrapper: wrapperFor(new QueryClient()),
    });
    expect(result.current.status).toBe("idle");
    expect(staticUsersApi.list).not.toHaveBeenCalled();
  });

  it("reports a failed read as an error, not as no grants", async () => {
    vi.mocked(staticUsersApi.list).mockResolvedValue([{ Id: 1 }] as never);
    vi.mocked(staticUsersApi.get).mockRejectedValue(new Error("500"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStaticGrantCounts(true), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.counts.size).toBe(0);
  });
});
