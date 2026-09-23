import { describe, expect, it } from "vitest";

import { fromQuery, toKnownList, whyListUnknown } from "./knownList";

describe("knownList", () => {
  it("reads a query as loading, failed or in", () => {
    expect(fromQuery({ data: undefined, isError: false }).status).toBe("loading");
    expect(fromQuery({ data: [1], isError: false })).toEqual({
      items: [1],
      status: "ready",
    });
    // A failed refetch is an error even with an older copy cached.
    expect(fromQuery({ data: [1], isError: true }).status).toBe("error");
  });

  it("treats a plain array, or nothing, as a list already in", () => {
    expect(toKnownList([1, 2])).toEqual({ items: [1, 2], status: "ready" });
    expect(toKnownList(undefined)).toEqual({ items: [], status: "ready" });
  });

  it("says why a check cannot be made yet", () => {
    expect(whyListUnknown({ items: [], status: "loading" }, "customer moves")).toBe(
      "checking customer moves",
    );
    expect(whyListUnknown({ items: [], status: "error" }, "customer moves")).toBe(
      "customer moves could not be read, so it cannot be checked",
    );
    expect(whyListUnknown({ items: [], status: "ready" }, "customer moves")).toBeNull();
  });
});
