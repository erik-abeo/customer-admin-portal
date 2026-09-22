import { describe, expect, it } from "vitest";

import type { ServerMetricsPoint } from "@/api/types";

import { historyRows, summarizeHistory } from "./history";

const point = (overrides: Partial<ServerMetricsPoint>): ServerMetricsPoint => ({
  UtcTimestamp: "2026-09-01T00:00:00Z",
  CustomerDatabaseCount: 10,
  AuthorizedUserCount: 40,
  DataBytes: 1_000,
  IndexBytes: 200,
  ApproxRowCount: 5_000,
  DatabaseConnections: 12,
  ...overrides,
});

describe("summarizeHistory", () => {
  it("reports each figure from the first point to the last", () => {
    const summary = summarizeHistory([
      point({}),
      point({ UtcTimestamp: "2026-09-10T00:00:00Z", CustomerDatabaseCount: 11 }),
      point({
        UtcTimestamp: "2026-09-20T00:00:00Z",
        CustomerDatabaseCount: 13,
        AuthorizedUserCount: 52,
        DataBytes: 1_500,
        IndexBytes: 300,
        DatabaseConnections: 9,
      }),
    ]);

    expect(summary.from).toBe("2026-09-01T00:00:00Z");
    expect(summary.to).toBe("2026-09-20T00:00:00Z");
    expect(summary.customers).toEqual({ first: 10, last: 13, change: 3 });
    expect(summary.users).toEqual({ first: 40, last: 52, change: 12 });
    expect(summary.bytes).toEqual({ first: 1_200, last: 1_800, change: 600 });
    expect(summary.connections).toEqual({ first: 12, last: 9, change: -3 });
  });

  it("skips points that did not record a figure rather than reading them as zero", () => {
    const summary = summarizeHistory([
      point({ DatabaseConnections: null, DataBytes: null, IndexBytes: null }),
      point({ UtcTimestamp: "2026-09-20T00:00:00Z", DatabaseConnections: 15 }),
    ]);

    expect(summary.connections).toEqual({ first: 15, last: 15, change: 0 });
    expect(summary.bytes).toEqual({ first: 1_200, last: 1_200, change: 0 });
  });

  it("has nothing to say about an empty window", () => {
    expect(summarizeHistory([])).toEqual({
      from: null,
      to: null,
      customers: null,
      users: null,
      bytes: null,
      connections: null,
    });
  });
});

describe("historyRows", () => {
  it("lists newest first without reordering the caller's array", () => {
    const points = [point({}), point({ UtcTimestamp: "2026-09-20T00:00:00Z" })];

    const rows = historyRows(points);

    expect(rows.map((r) => r.UtcTimestamp)).toEqual([
      "2026-09-20T00:00:00Z",
      "2026-09-01T00:00:00Z",
    ]);
    expect(rows[0].TotalBytes).toBe(1_200);
    expect(points[0].UtcTimestamp).toBe("2026-09-01T00:00:00Z");
  });
});
