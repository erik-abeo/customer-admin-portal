import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useRefreshOnStatusChange } from "./statusChanges";

type Item = { Id: number; Status: string | null };

const KEYS = [["databases"], ["server-capacity"]] as const;

function setup(initial: Item[] | undefined) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ items }: { items: Item[] | undefined }) => useRefreshOnStatusChange(items, KEYS),
    { wrapper, initialProps: { items: initial } },
  );
  return {
    invalidate,
    rerender: (items: Item[] | undefined) => hook.rerender({ items }),
  };
}

describe("useRefreshOnStatusChange", () => {
  it("does nothing on the first data, which only establishes the statuses", () => {
    const { invalidate } = setup([{ Id: 1, Status: "planned" }]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("refreshes every given key when a status changes", () => {
    const { invalidate, rerender } = setup([{ Id: 1, Status: "planned" }]);

    rerender([{ Id: 1, Status: "draining" }]);

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["databases"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["server-capacity"] });
  });

  it("does not refresh when new data carries the same statuses", () => {
    const { invalidate, rerender } = setup([{ Id: 1, Status: "copying" }]);

    rerender([{ Id: 1, Status: "copying" }]);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not refresh for a record it has not seen before", () => {
    const { invalidate, rerender } = setup([{ Id: 1, Status: "copying" }]);

    rerender([
      { Id: 1, Status: "copying" },
      { Id: 2, Status: "planned" },
    ]);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("waits for data rather than treating undefined as a change", () => {
    const { invalidate, rerender } = setup(undefined);

    rerender([{ Id: 1, Status: "planned" }]);
    rerender([{ Id: 1, Status: "planned" }]);

    expect(invalidate).not.toHaveBeenCalled();
  });
});
