import { describe, expect, it } from "vitest";

import { isActiveDatabase, whyDatabaseUnavailable } from "./status";

describe("database status", () => {
  it("treats only active as available", () => {
    expect(isActiveDatabase("active")).toBe(true);
    for (const status of ["moving", "suspended", "retired", null, undefined]) {
      expect(isActiveDatabase(status)).toBe(false);
    }
  });

  it("says why anything else cannot be chosen", () => {
    expect(whyDatabaseUnavailable("active")).toBeNull();
    expect(whyDatabaseUnavailable("moving")).toBe("a customer move is in progress");
    expect(whyDatabaseUnavailable("suspended")).toBe("suspended");
    expect(whyDatabaseUnavailable("retired")).toBe("retired");
    // Null only defensively, and still not offered.
    expect(whyDatabaseUnavailable(null)).toBe("status unknown");
  });
});
