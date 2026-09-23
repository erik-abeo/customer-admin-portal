import { describe, expect, it } from "vitest";

import type { CustomerMove, DatabaseInfoItem, MigrationSessionItem } from "@/api/types";

import {
  advanceMoves,
  advanceSessions,
  restoreSource,
  type SimulationState,
} from "./simulation";

const T0 = Date.parse("2026-09-22T12:00:00Z");

const state = (overrides: Partial<SimulationState> = {}): SimulationState => {
  let id = 0;
  return {
    databases: [],
    customerMoves: [],
    customerMoveVerification: {},
    migrationSessions: [],
    migrationProgress: {},
    demoStreamsEndAt: {},
    progressIds: { next: () => ++id },
    ...overrides,
  };
};

const database = (): DatabaseInfoItem => ({
  Id: 100,
  DatabaseServerId: 1,
  DatabaseName: "tenant_acme",
  Description: null,
  CrystalPmId: 11111,
  Status: "moving",
});

const move = (): CustomerMove =>
  ({
    Id: 7,
    DatabaseId: 100,
    SourceDatabaseServerId: 1,
    SourceDatabaseName: "tenant_acme",
    TargetDatabaseServerId: 2,
    TargetDatabaseName: "tenant_acme_2",
    Status: "planned",
    CreatedDateTimeUtc: new Date(T0).toISOString(),
  }) as CustomerMove;

const session = (overrides: Partial<MigrationSessionItem>): MigrationSessionItem =>
  ({
    Id: 502,
    Status: "streaming",
    Phase: "Migrate all tables",
    ExpiresDateTimeUtc: new Date(T0 + 3_600_000).toISOString(),
    RedeemedDateTimeUtc: new Date(T0).toISOString(),
    LastHeartbeatUtc: new Date(T0).toISOString(),
    ErrorMessage: null,
    ...overrides,
  }) as MigrationSessionItem;

describe("advanceMoves", () => {
  it("walks a move through each phase in order, stamping each", () => {
    const s = state({ databases: [database()], customerMoves: [move()] });

    advanceMoves(s, T0 + 10_000);
    expect(s.customerMoves[0].Status).toBe("copying");
    expect(s.customerMoves[0].QuiescedDateTimeUtc).toBeTruthy();
    expect(s.customerMoves[0].CopyStartedDateTimeUtc).toBeTruthy();
    expect(s.databases[0].Status).toBe("moving");
  });

  it("cuts over by repointing the database at the target and putting it back online", () => {
    const s = state({ databases: [database()], customerMoves: [move()] });

    advanceMoves(s, T0 + 60_000);

    expect(s.customerMoves[0].Status).toBe("flipped");
    expect(s.databases[0]).toMatchObject({
      DatabaseServerId: 2,
      DatabaseName: "tenant_acme_2",
      Status: "active",
    });
    expect(s.customerMoveVerification[7].every((row) => row.Matched)).toBe(true);
  });

  it("leaves a cancelled move alone", () => {
    const cancelled = { ...move(), Status: "cancelled" };
    const s = state({ databases: [database()], customerMoves: [cancelled] });

    advanceMoves(s, T0 + 60_000);

    expect(s.customerMoves[0].Status).toBe("cancelled");
  });

  it("restores the source on rollback", () => {
    const s = state({ databases: [database()], customerMoves: [move()] });
    advanceMoves(s, T0 + 60_000);

    restoreSource(s, s.customerMoves[0]);

    expect(s.databases[0]).toMatchObject({
      DatabaseServerId: 1,
      DatabaseName: "tenant_acme",
    });
  });
});

describe("advanceSessions", () => {
  it("expires an unredeemed key past its time", () => {
    const s = state({
      migrationSessions: [
        session({ Status: "pending", ExpiresDateTimeUtc: new Date(T0).toISOString() }),
      ],
    });
    advanceSessions(s, T0 + 1);
    expect(s.migrationSessions[0].Status).toBe("expired");
  });

  it("fails a live session that has been silent for fifteen minutes, as the sweeper does", () => {
    const s = state({ migrationSessions: [session({})] });
    advanceSessions(s, T0 + 16 * 60_000);
    expect(s.migrationSessions[0].Status).toBe("failed");
    expect(s.migrationProgress[502].at(-1)?.IsError).toBe(true);
  });

  it("lets a live demo stream finish, so the list stops polling", () => {
    const s = state({ migrationSessions: [session({})] });

    advanceSessions(s, T0 + 1_000);
    expect(s.migrationSessions[0].Status).toBe("streaming");

    advanceSessions(s, T0 + 3 * 60_000);
    expect(s.migrationSessions[0].Status).toBe("completed");
  });
});
