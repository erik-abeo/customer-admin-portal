/**
 * The migration target picker's safety rules.
 *
 * DEV-2203 names three behaviours carried over from the upload modal removed in
 * `4a24044` (recoverable at `git show c9a9ed1:src/pages/DumpsPage.tsx`): the
 * server is picked before the database, changing the server clears the
 * database, and the destination is stated back before anything is committed to.
 *
 * They are tested here rather than through the rendered form because they are
 * rules, not rendering. A test that drives a combobox proves the dropdown still
 * works; these prove the invariant still holds, and the invariant is what stops
 * one customer's records being streamed over another's.
 */
import { describe, expect, it } from "vitest";

import type { DatabaseInfoItem, DatabaseServerInfoItem } from "@/api/types";

import {
  describeTarget,
  isSafeDatabaseName,
  selectServer,
  toCreateRequest,
  visibleDatabases,
  type MigrationTargetSelection,
} from "./migrationTarget";

const server = (Id: number, Name: string): DatabaseServerInfoItem => ({
  Id,
  Name,
  Description: null,
  LocalServerAddress: `10.0.0.${Id}`,
  RemoteServerAddress: null,
  ServerPort: 3306,
  AdminUserName: "cpmadmin",
  RootUserPassword: "",
  Certificate: null,
  SecurityGroupId: null,
});

const database = (
  Id: number,
  DatabaseServerId: number,
  DatabaseName: string,
  CrystalPmId: number,
): DatabaseInfoItem => ({
  Id,
  DatabaseServerId,
  DatabaseName,
  Description: null,
  CrystalPmId,
});

const servers = [server(1, "us-east-prod-01"), server(2, "us-east-prod-02")];
const databases = [
  database(10, 1, "easyopti_on_server_one", 111),
  database(20, 2, "easyopti_on_server_two", 222),
];

const baseSelection: MigrationTargetSelection = {
  Mode: "existing",
  DatabaseServerId: "1",
  DatabaseId: "10",
  DatabaseName: "",
  CrystalPmId: 1042,
  ExpiresInMinutes: 120,
};

describe("visibleDatabases", () => {
  it("offers nothing until a server is chosen", () => {
    expect(visibleDatabases(databases, "")).toEqual([]);
  });

  it("offers only the databases on the chosen server", () => {
    expect(visibleDatabases(databases, "1").map((d) => d.DatabaseName)).toEqual([
      "easyopti_on_server_one",
    ]);
  });
});

describe("selectServer", () => {
  it("clears the chosen database when the server changes", () => {
    const next = selectServer(baseSelection, "2");

    expect(next.DatabaseServerId).toBe("2");
    // The rule with no visible symptom: without this the form still submits,
    // and submits database 10 against server 2, which do not map to each other.
    expect(next.DatabaseId).toBe("");
  });

  it("clears the chosen database even when the server is cleared entirely", () => {
    expect(selectServer(baseSelection, null)).toMatchObject({
      DatabaseServerId: "",
      DatabaseId: "",
    });
  });

  it("clears the database even when the same server is re-selected", () => {
    // Re-selecting the same server could plausibly be treated as a no-op. It is
    // not, because "no change" is an inference and the safe answer does not
    // depend on one.
    expect(selectServer(baseSelection, "1").DatabaseId).toBe("");
  });
});

describe("describeTarget", () => {
  it("names the customer, database and server for an existing database", () => {
    expect(describeTarget(baseSelection, servers, databases)).toBe(
      'customer 1042 into "easyopti_on_server_one" on us-east-prod-01',
    );
  });

  it("names the database about to be created when provisioning", () => {
    const selection: MigrationTargetSelection = {
      ...baseSelection,
      Mode: "provision",
      DatabaseId: "",
      DatabaseName: "  easyopti_1042  ",
    };
    expect(describeTarget(selection, servers, databases)).toBe(
      'customer 1042 into "easyopti_1042" on us-east-prod-01',
    );
  });

  it("does not name a database from another server", () => {
    // If the clearing rule ever regressed, this is the sentence an operator
    // would be asked to confirm, so it must not quietly resolve.
    const mismatched: MigrationTargetSelection = {
      ...baseSelection,
      DatabaseServerId: "2",
      DatabaseId: "10",
    };
    expect(describeTarget(mismatched, servers, databases)).toContain(
      "the selected database",
    );
  });
});

describe("toCreateRequest", () => {
  it("sends the database id and no name when using an existing database", () => {
    expect(toCreateRequest(baseSelection)).toMatchObject({
      DatabaseServerId: 1,
      DatabaseId: 10,
      DatabaseName: null,
      CrystalPmId: 1042,
    });
  });

  it("sends the name and no id when provisioning", () => {
    expect(
      toCreateRequest({
        ...baseSelection,
        Mode: "provision",
        DatabaseId: "",
        DatabaseName: " easyopti_1042 ",
      }),
    ).toMatchObject({ DatabaseId: null, DatabaseName: "easyopti_1042" });
  });

  it("falls back to the default lifetime rather than sending zero", () => {
    expect(
      toCreateRequest({ ...baseSelection, ExpiresInMinutes: "" }).ExpiresInMinutes,
    ).toBe(120);
  });
});

describe("isSafeDatabaseName", () => {
  it.each(["easyopti", "easyopti_1042", "A1_b2"])("accepts %s", (name) => {
    expect(isSafeDatabaseName(name)).toBe(true);
  });

  it.each(["", "1leading_digit", "has space", "has-dash", "back`tick", "drop;table"])(
    "rejects %s",
    (name) => {
      expect(isSafeDatabaseName(name)).toBe(false);
    },
  );
});
