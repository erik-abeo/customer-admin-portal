import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { migrationsApi } from "@/api/migrations";
import { movesApi } from "@/api/moves";
import { useRevokeMigrationSession } from "@/features/migrations/queries";
import { useDeleteStaticUser } from "@/features/staticUsers/queries";
import { staticUsersApi } from "@/api/staticUsers";

import { useDropCustomerMoveSource } from "./queries";

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

/** Runs a mutation that fails, and returns the query keys it invalidated. */
async function invalidatedByFailure<T>(
  hook: () => { mutateAsync: (v: T) => Promise<unknown> },
  variables: T,
) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(client, "invalidateQueries");
  const { result } = renderHook(hook, { wrapper: wrapperFor(client) });
  await act(async () => {
    await result.current.mutateAsync(variables).catch(() => undefined);
  });
  return spy.mock.calls.map(([filters]) => filters?.queryKey);
}

describe("mutations that fail still refresh what they may have changed", () => {
  it("a drop-source that failed after claiming the move refreshes the move", async () => {
    vi.spyOn(movesApi, "dropSource").mockRejectedValue(
      new Error("Internal server error"),
    );
    const keys = await invalidatedByFailure(() => useDropCustomerMoveSource(), 7);
    expect(keys).toContainEqual(["customer-moves"]);
    expect(keys).toContainEqual(["customer-moves", 7]);
    expect(keys).toContainEqual(["databases"]);
  });

  it("a revoke that answered 500 with the key revoked refreshes the sessions", async () => {
    vi.spyOn(migrationsApi, "revoke").mockRejectedValue(
      new Error("login could not be dropped"),
    );
    const keys = await invalidatedByFailure(() => useRevokeMigrationSession(), 3);
    expect(keys.length).toBeGreaterThan(0);
  });

  it("a static user delete that failed partway refreshes the list", async () => {
    vi.spyOn(staticUsersApi, "remove")
      .mockResolvedValueOnce({ Success: true, Message: null })
      .mockRejectedValueOnce(new Error("second row failed"));
    const keys = await invalidatedByFailure(() => useDeleteStaticUser(), [1, 2]);
    expect(keys.length).toBeGreaterThan(0);
  });
});
