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

import type {
  CustomerMove,
  DatabaseInfoItem,
  DatabaseServerInfoItem,
  MigrationSessionItem,
} from "@/api/types";

import {
  describeTarget,
  isSafeDatabaseName,
  selectServer,
  toCreateRequest,
  visibleDatabases,
  whyDatabaseNotSelectable,
  whyServerNotSelectable,
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
  Status: "active",
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
    expect(toCreateRequest(baseSelection, "ops@crystalpm.example")).toMatchObject({
      DatabaseServerId: 1,
      DatabaseId: 10,
      DatabaseName: null,
      CrystalPmId: 1042,
    });
  });

  it("records who minted the key", () => {
    expect(toCreateRequest(baseSelection, "ops@crystalpm.example").CreatedByAdmin).toBe(
      "ops@crystalpm.example",
    );
    expect(toCreateRequest(baseSelection, null).CreatedByAdmin).toBeNull();
  });

  it("sends the name and no id when provisioning", () => {
    expect(
      toCreateRequest(
        {
          ...baseSelection,
          Mode: "provision",
          DatabaseId: "",
          DatabaseName: " easyopti_1042 ",
        },
        null,
      ),
    ).toMatchObject({ DatabaseId: null, DatabaseName: "easyopti_1042" });
  });

  it("falls back to the default lifetime rather than sending zero", () => {
    expect(
      toCreateRequest({ ...baseSelection, ExpiresInMinutes: "" }, null)
        .ExpiresInMinutes,
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

describe("whyDatabaseNotSelectable", () => {
  const mine = database(10, 1, "easyopti_1042", 1042);

  it("accepts an active database that belongs to the customer entered", () => {
    expect(whyDatabaseNotSelectable(mine, 1042)).toBeNull();
    expect(whyDatabaseNotSelectable(mine, "1042")).toBeNull();
  });

  it("refuses another customer's database and says whose it is", () => {
    expect(whyDatabaseNotSelectable(mine, 887)).toBe("belongs to customer 1042");
  });

  it("refuses a database that is not active whoever it belongs to", () => {
    expect(whyDatabaseNotSelectable({ ...mine, Status: "moving" }, 1042)).toBe(
      "a customer move is in progress",
    );
  });

  it("judges only status until a customer id is entered", () => {
    expect(whyDatabaseNotSelectable(mine, "")).toBeNull();
    expect(whyDatabaseNotSelectable({ ...mine, Status: "suspended" }, "")).toBe(
      "suspended",
    );
  });
});

describe("whyServerNotSelectable", () => {
  it("refuses a server that is not available when the key provisions a database", () => {
    expect(whyServerNotSelectable("provision", "retiring")).toBe(
      "marked 'retiring', not taking new customers",
    );
    expect(whyServerNotSelectable("provision", "available")).toBeNull();
  });

  it("allows any server for a key against an existing database, as the service does", () => {
    expect(whyServerNotSelectable("existing", "retiring")).toBeNull();
  });
});

describe("whyDatabaseNotSelectable with sessions and moves", () => {
  const mine = database(10, 1, "easyopti_1042", 1042);
  const now = Date.parse("2026-09-23T12:00:00Z");

  it("refuses a database that already has a live key", () => {
    const pending = [
      { DatabaseId: 10, Status: "pending", ExpiresDateTimeUtc: "2026-09-23T13:00:00Z" },
    ] as MigrationSessionItem[];
    expect(whyDatabaseNotSelectable(mine, 1042, { sessions: pending, now })).toBe(
      "it already has a live migration key",
    );
    const expired = [
      { DatabaseId: 10, Status: "pending", ExpiresDateTimeUtc: "2026-09-23T11:00:00Z" },
    ] as MigrationSessionItem[];
    expect(whyDatabaseNotSelectable(mine, 1042, { sessions: expired, now })).toBeNull();
  });

  it("refuses a database with any unsettled move, planned and flipped included", () => {
    for (const status of ["planned", "copying", "flipped"]) {
      const moves = [{ DatabaseId: 10, Status: status }] as CustomerMove[];
      expect(whyDatabaseNotSelectable(mine, 1042, { moves })).toBe(
        "a customer move of it is still in progress or can still be rolled back",
      );
    }
    const settledUndropped = [
      { DatabaseId: 10, Status: "settled", SourceDroppedDateTimeUtc: null },
    ] as CustomerMove[];
    expect(
      whyDatabaseNotSelectable(mine, 1042, { moves: settledUndropped }),
    ).not.toBeNull();
    const done = [
      {
        DatabaseId: 10,
        Status: "settled",
        SourceDroppedDateTimeUtc: "2026-09-23T00:00:00Z",
      },
    ] as CustomerMove[];
    expect(whyDatabaseNotSelectable(mine, 1042, { moves: done })).toBeNull();
  });
});
