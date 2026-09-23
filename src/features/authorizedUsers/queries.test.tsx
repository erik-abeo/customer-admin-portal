import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { authorizedUsersApi } from "@/api/authorizedUsers";

import { useCreateAuthorizedUser, useUpdateAuthorizedUser } from "./queries";

vi.mock("@/api/authorizedUsers", () => ({
  authorizedUsersApi: {
    list: vi.fn(),
    listForDatabase: vi.fn(),
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

const holds = (client: QueryClient, secret: string) =>
  client
    .getMutationCache()
    .getAll()
    .some((m) => JSON.stringify(m.state.variables ?? null).includes(secret));

describe("authorized user mutations", () => {
  it.each([
    ["create", useCreateAuthorizedUser, "create"] as const,
    ["update", useUpdateAuthorizedUser, "update"] as const,
  ])(
    "drop the password from the MutationCache once %s is reset",
    async (_n, hook, api) => {
      vi.mocked(authorizedUsersApi[api]).mockResolvedValue("ok");
      const client = new QueryClient();
      const { result } = renderHook(() => hook(), { wrapper: wrapperFor(client) });

      await act(() => result.current.mutateAsync({ Password: "User-Pass-3" } as never));
      expect(holds(client, "User-Pass-3")).toBe(true);

      act(() => result.current.reset());
      await waitFor(() => expect(holds(client, "User-Pass-3")).toBe(false));
    },
  );

  it("refetch the capacity reading, which counts users", async () => {
    vi.mocked(authorizedUsersApi.create).mockResolvedValue("ok");
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreateAuthorizedUser(), {
      wrapper: wrapperFor(client),
    });
    await act(() => result.current.mutateAsync({} as never));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["server-capacity"] });
  });
});
