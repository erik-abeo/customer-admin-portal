import { describe, expect, it } from "vitest";

import type { CustomerDatabaseCapacity } from "@/api/types";

import { applyVerdict } from "./capacityVerdict";

const base = {
  Status: "available" as string | null,
  CustomerDatabaseCount: 2,
  MaxCustomerDatabases: 10 as number | null,
  ThreadsConnected: 20 as number | null,
  MaxConnections: 200 as number | null,
  Databases: [] as CustomerDatabaseCapacity[],
};

describe("applyVerdict, as ServerCapacityService.ApplyVerdict", () => {
  it("has headroom with room on every measure, and says so", () => {
    expect(applyVerdict(base)).toEqual({
      Verdict: "Headroom",
      VerdictReasons: [
        "2 of 10 customer databases used.",
        "20 of 200 connections in use.",
      ],
    });
  });

  it("is Full when the server is not available, whatever its counts", () => {
    const result = applyVerdict({ ...base, Status: "retiring" });
    expect(result.Verdict).toBe("Full");
    expect(result.VerdictReasons[0]).toBe(
      "The server is marked 'retiring', so it is not accepting customers.",
    );
  });

  it("treats a missing status as closed", () => {
    expect(applyVerdict({ ...base, Status: null }).VerdictReasons[0]).toBe(
      "The server has no recorded status, so it is not offered for new customers.",
    );
  });

  it("is Full at the limit and near capacity from 80 percent, of databases or connections", () => {
    expect(applyVerdict({ ...base, CustomerDatabaseCount: 10 }).VerdictReasons[0]).toBe(
      "At its stated limit of 10 customer databases.",
    );
    expect(applyVerdict({ ...base, CustomerDatabaseCount: 8 }).Verdict).toBe(
      "NearCapacity",
    );
    expect(applyVerdict({ ...base, ThreadsConnected: 160 }).Verdict).toBe(
      "NearCapacity",
    );
  });

  it("says when there is no limit, and flags orphaned registrations", () => {
    const result = applyVerdict({
      ...base,
      MaxCustomerDatabases: null,
      Databases: [{ IsOrphaned: true } as CustomerDatabaseCapacity],
    });
    expect(result.VerdictReasons).toContain(
      "2 customer databases, with no stated limit to compare against.",
    );
    expect(result.VerdictReasons).toContain(
      "1 registered database(s) are not present on the server. Worth resolving before adding another.",
    );
  });
});
