import { describe, expect, it } from "vitest";

import type { CustomerMove, DatabaseInfoItem, MigrationSessionItem } from "@/api/types";

import {
  canCancelMove,
  canDropMoveSource,
  canRollBackMove,
  isActiveMove,
  needsWorkByHand,
  whyDatabaseNotMovable,
} from "./queries";

const move = (overrides: Partial<CustomerMove>): CustomerMove =>
  ({
    Id: 1,
    DatabaseId: 100,
    Status: "flipped",
    SourceDatabaseName: "tenant_acme",
    SourceDroppedDateTimeUtc: null,
    ...overrides,
  }) as CustomerMove;

const database: DatabaseInfoItem = {
  Id: 100,
  DatabaseServerId: 1,
  DatabaseName: "tenant_acme",
  Description: null,
  CrystalPmId: 11111,
  Status: "active",
};

describe("canRollBackMove", () => {
  it("offers rollback only for a cut-over move whose source is recorded and still there", () => {
    expect(canRollBackMove(move({}))).toBe(true);
    expect(canRollBackMove(move({ SourceDatabaseName: null }))).toBe(false);
    expect(
      canRollBackMove(move({ SourceDroppedDateTimeUtc: "2026-09-22T12:00:00Z" })),
    ).toBe(false);
    expect(canRollBackMove(move({ Status: "settled" }))).toBe(false);
  });
});

describe("canDropMoveSource", () => {
  it("offers the drop after cutover while the source is still there", () => {
    expect(canDropMoveSource(move({}))).toBe(true);
    expect(canDropMoveSource(move({ SourceDatabaseName: null }))).toBe(false);
    expect(
      canDropMoveSource(move({ SourceDroppedDateTimeUtc: "2026-09-22T12:00:00Z" })),
    ).toBe(false);
  });

  it("offers it again for a drop interrupted after the move was settled", () => {
    expect(canDropMoveSource(move({ Status: "settled" }))).toBe(true);
    expect(
      canDropMoveSource(
        move({ Status: "settled", SourceDroppedDateTimeUtc: "2026-09-22T12:00:00Z" }),
      ),
    ).toBe(false);
  });

  it("is not offered before cutover", () => {
    expect(canDropMoveSource(move({ Status: "copying" }))).toBe(false);
  });
});

describe("whyDatabaseNotMovable", () => {
  it("allows an active database with nothing unsettled", () => {
    // Settled with its source dropped, and moves that ended without cutting over.
    expect(
      whyDatabaseNotMovable(database, [
        move({ Status: "settled", SourceDroppedDateTimeUtc: "2026-09-22T12:00:00Z" }),
        move({ Status: "cancelled" }),
        move({ Status: "failed" }),
        move({ Status: "rolled_back" }),
      ]),
    ).toBeNull();
  });

  it("refuses one with a move still in progress, as the service does", () => {
    for (const status of ["planned", "draining", "copying", "verifying"]) {
      expect(whyDatabaseNotMovable(database, [move({ Status: status })])).toBe(
        "a move of it is already in progress",
      );
    }
  });

  it("refuses one whose move settled but never finished dropping its source", () => {
    expect(whyDatabaseNotMovable(database, [move({ Status: "settled" })])).toBe(
      "a move's source drop has not finished",
    );
  });

  it("ignores another database's moves", () => {
    expect(
      whyDatabaseNotMovable(database, [move({ DatabaseId: 999, Status: "planned" })]),
    ).toBeNull();
  });

  it("refuses one whose earlier move has cut over and not been settled", () => {
    expect(whyDatabaseNotMovable(database, [move({})])).toBe(
      "a cut-over move has not been settled or rolled back",
    );
  });

  it("refuses one that is not active", () => {
    expect(whyDatabaseNotMovable({ ...database, Status: "moving" }, [])).toBe(
      "a customer move is in progress",
    );
  });
});

describe("move status rules", () => {
  it("polls every phase that is still working", () => {
    for (const status of ["planned", "draining", "copying", "verifying"]) {
      expect(isActiveMove(status)).toBe(true);
    }
    for (const status of [
      "flipped",
      "settled",
      "failed",
      "cancelled",
      "rolled_back",
      null,
    ]) {
      expect(isActiveMove(status)).toBe(false);
    }
  });

  it("offers cancel only before anything has been copied", () => {
    expect(canCancelMove("planned")).toBe(true);
    expect(canCancelMove("draining")).toBe(true);
    expect(canCancelMove("copying")).toBe(false);
    expect(canCancelMove("verifying")).toBe(false);
    expect(canCancelMove(null)).toBe(false);
  });
});

describe("needsWorkByHand", () => {
  it("spots the cancel results that ask for manual cleanup", () => {
    expect(
      needsWorkByHand(
        "Move cancelled. The customer is back online on the source. The empty database 'x' it reserved on the target server could not be removed and needs dropping by hand.",
      ),
    ).toBe(true);
    expect(
      needsWorkByHand(
        "The move was cancelled, but the customer could not be put back online. Set the database's status back to active by hand.",
      ),
    ).toBe(true);
    expect(
      needsWorkByHand("Move cancelled. The customer is back online on the source."),
    ).toBe(false);
    expect(needsWorkByHand(null)).toBe(false);
    // Revoke's 500 when the installer's login could not be dropped.
    expect(
      needsWorkByHand(
        "The key is revoked, but the installer's database login 'cpmmig_1' could not be dropped yet and may still be streaming. It is retried automatically every few minutes; drop it by hand on the server if it cannot wait.",
      ),
    ).toBe(true);
  });
});

describe("whyDatabaseNotMovable with migrations", () => {
  it("refuses a database a migration is streaming into, as the service does", () => {
    const streaming = [
      { DatabaseId: 100, Status: "streaming" },
    ] as MigrationSessionItem[];
    expect(whyDatabaseNotMovable(database, [], streaming)).toBe(
      "a migration is streaming into it",
    );
    const finished = [
      { DatabaseId: 100, Status: "completed" },
    ] as MigrationSessionItem[];
    expect(whyDatabaseNotMovable(database, [], finished)).toBeNull();
  });
});

describe("whyDatabaseNotMovable with static grants", () => {
  const ready = (entries: [number, number][]) => ({
    counts: new Map(entries),
    status: "ready" as const,
  });

  it("refuses a database static users hold privileges on, as the service does", () => {
    expect(whyDatabaseNotMovable(database, [], [], ready([[100, 2]]))).toBe(
      "2 static user privilege(s) are held on it, and moves do not carry static users yet",
    );
    expect(whyDatabaseNotMovable(database, [], [], ready([[101, 1]]))).toBeNull();
  });

  it("does not take grants as absent while they load, or when a read failed", () => {
    expect(
      whyDatabaseNotMovable(database, [], [], { counts: new Map(), status: "loading" }),
    ).toBe("checking static user grants");
    expect(
      whyDatabaseNotMovable(database, [], [], { counts: new Map(), status: "error" }),
    ).toBe("static user grants could not be read, so it cannot be checked");
  });
});

describe("whyDatabaseNotMovable while its lists load or fail", () => {
  it("does not offer a database while moves or migrations are unknown", () => {
    expect(whyDatabaseNotMovable(database, { items: [], status: "loading" })).toBe(
      "checking customer moves",
    );
    expect(whyDatabaseNotMovable(database, [], { items: [], status: "error" })).toBe(
      "migrations could not be read, so it cannot be checked",
    );
  });
});
