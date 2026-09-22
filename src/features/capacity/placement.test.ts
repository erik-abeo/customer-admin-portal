/**
 * Placement ranking and its reasoning.
 *
 * These decide where a customer's records are put, so they are tested as rules
 * rather than through a rendered table. The cases that matter are the ones with
 * no obvious right answer: an unmeasurable server, a server with no stated cap,
 * and a fleet where nothing has room.
 */
import { describe, expect, it } from "vitest";

import type { CapacityVerdict, ServerCapacity } from "@/api/types";

import {
  compareForPlacement,
  formatBytes,
  freeCapacityFraction,
  recommendPlacement,
} from "./placement";

const server = (
  id: number,
  name: string,
  verdict: CapacityVerdict,
  overrides: Partial<ServerCapacity> = {},
): ServerCapacity => ({
  DatabaseServerId: id,
  Name: name,
  Engine: "MySql",
  EngineVersion: "8.4.3",
  Status: "available",
  CustomerDatabaseCount: 0,
  MaxCustomerDatabases: 10,
  AuthorizedUserCount: 0,
  DataBytes: 0,
  IndexBytes: 0,
  ApproxRowCount: 0,
  ThreadsConnected: 10,
  MaxConnections: 200,
  Verdict: verdict,
  VerdictReasons: ["0 of 10 customer databases used."],
  UnreachableReason: null,
  Databases: [],
  ...overrides,
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1.0 KB"],
    [4_509_715_660, "4.2 GB"],
  ])("renders %i as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it("renders an absent measurement as a dash rather than zero", () => {
    // Zero bytes and "we did not measure this" are different facts, and showing
    // the second as the first is how an unreachable server looks empty.
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
  });
});

describe("freeCapacityFraction", () => {
  it("is null when the server has no stated cap", () => {
    // Not 1. An unbounded server is not "100% free", and treating it as such
    // would let it win a comparison it was never entered into.
    expect(freeCapacityFraction(server(1, "a", "Headroom", { MaxCustomerDatabases: null }))).toBeNull();
  });

  it("never goes negative when a server is over its cap", () => {
    expect(
      freeCapacityFraction(
        server(1, "a", "Full", { MaxCustomerDatabases: 5, CustomerDatabaseCount: 8 }),
      ),
    ).toBe(0);
  });
});

describe("compareForPlacement", () => {
  it("puts headroom ahead of near capacity, and both ahead of full", () => {
    const ranked = [
      server(3, "full", "Full"),
      server(1, "headroom", "Headroom"),
      server(2, "near", "NearCapacity"),
    ].sort(compareForPlacement);

    expect(ranked.map((s) => s.Name)).toEqual(["headroom", "near", "full"]);
  });

  it("ranks an unmeasurable server below a full one", () => {
    // A full server is a known quantity with no room. An unreachable one has
    // unknown contents, and unknown is worse than known-and-unsuitable when the
    // thing being placed is a customer's records.
    const ranked = [
      server(1, "unreachable", "Unreachable"),
      server(2, "full", "Full"),
    ].sort(compareForPlacement);

    expect(ranked.map((s) => s.Name)).toEqual(["full", "unreachable"]);
  });

  it("prefers more free capacity within the same verdict", () => {
    const ranked = [
      server(1, "busier", "Headroom", { MaxCustomerDatabases: 10, CustomerDatabaseCount: 7 }),
      server(2, "emptier", "Headroom", { MaxCustomerDatabases: 10, CustomerDatabaseCount: 1 }),
    ].sort(compareForPlacement);

    expect(ranked.map((s) => s.Name)).toEqual(["emptier", "busier"]);
  });

  it("prefers a server with a stated cap over one without", () => {
    // The one somebody has thought about the limits of, over the one nobody has.
    const ranked = [
      server(1, "uncapped", "Headroom", { MaxCustomerDatabases: null }),
      server(2, "capped", "Headroom", { MaxCustomerDatabases: 10, CustomerDatabaseCount: 5 }),
    ].sort(compareForPlacement);

    expect(ranked.map((s) => s.Name)).toEqual(["capped", "uncapped"]);
  });

  it("is stable by name when everything else ties", () => {
    const ranked = [
      server(1, "beta", "Headroom"),
      server(2, "alpha", "Headroom"),
    ].sort(compareForPlacement);

    expect(ranked.map((s) => s.Name)).toEqual(["alpha", "beta"]);
  });
});

describe("recommendPlacement", () => {
  it("recommends the best server with headroom, and says why", () => {
    const result = recommendPlacement([
      server(1, "busy", "NearCapacity"),
      server(2, "roomy", "Headroom", { VerdictReasons: ["2 of 10 customer databases used."] }),
    ]);

    expect(result.recommended?.Name).toBe("roomy");
    expect(result.summary).toContain("roomy");
    // The reasoning travels with the recommendation. A rank nobody can
    // interrogate is a rank nobody trusts.
    expect(result.summary).toContain("2 of 10 customer databases used.");
  });

  it("recommends nothing when only near-capacity servers exist", () => {
    // Near capacity is offered for an operator to choose deliberately, never
    // suggested. The point of the warning is that somebody should be deciding.
    const result = recommendPlacement([server(1, "busy", "NearCapacity")]);

    expect(result.recommended).toBeNull();
    expect(result.summary).toContain("near capacity");
    expect(result.summary).toContain("Consider adding a server");
  });

  it("says how many servers could not be measured", () => {
    const result = recommendPlacement([
      server(1, "gone", "Unreachable"),
      server(2, "alsogone", "Unreachable"),
    ]);

    expect(result.recommended).toBeNull();
    expect(result.summary).toContain("2 could not be measured");
  });

  it("says so plainly when there are no servers at all", () => {
    const result = recommendPlacement([]);

    expect(result.recommended).toBeNull();
    expect(result.ranked).toEqual([]);
    expect(result.summary).toBe("No database servers are registered yet.");
  });

  it("does not mutate the array it was given", () => {
    const servers = [server(2, "b", "Full"), server(1, "a", "Headroom")];
    const before = servers.map((s) => s.Name);

    recommendPlacement(servers);

    expect(servers.map((s) => s.Name)).toEqual(before);
  });
});
