import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { staticUsersApi } from "@/api/staticUsers";

import { useCreateStaticUser, useUpdateStaticUser } from "./queries";

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
