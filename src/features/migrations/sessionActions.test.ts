import { describe, expect, it } from "vitest";

import type { MigrationSessionItem } from "@/api/types";

import { canDiscardTarget, canRevoke, revokeEndsAStream } from "./sessionActions";

const session = (overrides: Partial<MigrationSessionItem>): MigrationSessionItem => ({
  Id: 1,
  MigrationKeyPrefix: "7K4D",
  DatabaseServerId: 1,
  DatabaseServerName: "db-east-1",
  DatabaseId: 10,
  DatabaseName: "easyopti_1042",
  ProvisionDatabaseName: "easyopti_1042",
  DatabaseCreated: true,
  CrystalPmId: 1042,
  Status: "failed",
  Phase: null,
  CreatedByAdmin: "ops@crystalpm.example",
  CreatedDateTimeUtc: "2026-09-22T14:00:00Z",
  ExpiresDateTimeUtc: "2026-09-22T16:00:00Z",
  RedeemedDateTimeUtc: null,
  CompletedDateTimeUtc: null,
  ClientPublicIp: null,
  ClientMachineId: null,
  MigrationUserName: null,
  MigrationUserHost: null,
  LastHeartbeatUtc: null,
  ErrorMessage: null,
  ...overrides,
});

describe("canDiscardTarget", () => {
  it("offers a failed session's target when it created that database", () => {
    expect(canDiscardTarget(session({}))).toBe(true);
    expect(canDiscardTarget(session({ Status: "revoked" }))).toBe(true);
    expect(canDiscardTarget(session({ Status: "expired" }))).toBe(true);
  });

  it("never offers a database that already existed", () => {
    // Minted against an existing database: it has a DatabaseId but did not
    // create it, so it is not this migration's to drop.
    expect(
      canDiscardTarget(
        session({ DatabaseCreated: false, ProvisionDatabaseName: null }),
      ),
    ).toBe(false);
  });

  it("does not offer a target that is already gone", () => {
    expect(canDiscardTarget(session({ DatabaseId: null }))).toBe(false);
  });

  it("does not offer anything while the migration could still succeed, or after it did", () => {
    for (const status of ["pending", "redeemed", "streaming", "completed", null]) {
      expect(canDiscardTarget(session({ Status: status }))).toBe(false);
    }
  });
});

describe("revoking", () => {
  it("is offered only while a session can still change", () => {
    expect(canRevoke(session({ Status: "pending" }))).toBe(true);
    expect(canRevoke(session({ Status: "streaming" }))).toBe(true);
    expect(canRevoke(session({ Status: "completed" }))).toBe(false);
    expect(canRevoke(session({ Status: null }))).toBe(false);
  });

  it("ends a stream only once the key has been redeemed", () => {
    expect(revokeEndsAStream(session({ Status: "pending" }))).toBe(false);
    expect(revokeEndsAStream(session({ Status: "redeemed" }))).toBe(true);
    expect(revokeEndsAStream(session({ Status: "streaming" }))).toBe(true);
  });
});
