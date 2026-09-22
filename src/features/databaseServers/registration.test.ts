import { describe, expect, it } from "vitest";

import type { ProbeDatabaseServerResponse } from "@/api/types";

import { canRegisterServer } from "./registration";

const probe = (IsSupported: boolean): ProbeDatabaseServerResponse =>
  ({ Success: true, IsSupported }) as ProbeDatabaseServerResponse;

describe("canRegisterServer", () => {
  it("registers a new server only after a passing probe", () => {
    expect(canRegisterServer(false, null)).toBe(false);
    expect(canRegisterServer(false, probe(false))).toBe(false);
    expect(canRegisterServer(false, probe(true))).toBe(true);
  });

  it("does not gate an edit, which has no password to probe with", () => {
    expect(canRegisterServer(true, null)).toBe(true);
    expect(canRegisterServer(true, probe(false))).toBe(true);
  });
});
