import { describe, expect, it } from "vitest";

import type { DatabaseInfoItem } from "@/api/types";

import {
  RELOCATION_REFUSED_MESSAGE,
  whyDatabaseCannotRelocate,
  whyDatabaseEditIsStale,
} from "./editGuard";

const opened: DatabaseInfoItem = {
  Id: 7,
  DatabaseServerId: 1,
  DatabaseName: "tenant_acme",
  Description: null,
  CrystalPmId: 11111,
  Status: "active",
};

describe("whyDatabaseCannotRelocate", () => {
  it("locks server and name outside active", () => {
    expect(whyDatabaseCannotRelocate("active")).toBeNull();
    expect(whyDatabaseCannotRelocate("moving")).toBe("a customer move is in progress");
    expect(whyDatabaseCannotRelocate("suspended")).toBe("suspended");
  });
});

const same = { DatabaseServerId: 1, DatabaseName: "tenant_acme" };

describe("whyDatabaseEditIsStale", () => {
  it("lets an unchanged, active database be saved", () => {
    expect(
      whyDatabaseEditIsStale(opened, { ...opened, Description: "edited" }, same),
    ).toBeNull();
  });

  it("refuses when the server changed since the form opened", () => {
    expect(
      whyDatabaseEditIsStale(opened, { ...opened, DatabaseServerId: 2 }, same),
    ).toBe(
      "'tenant_acme' has moved to another server since this form was opened. Close it and edit the database again.",
    );
  });

  it("refuses when the name changed since the form opened", () => {
    expect(
      whyDatabaseEditIsStale(
        opened,
        { ...opened, DatabaseName: "tenant_acme_2" },
        same,
      ),
    ).toContain("now named 'tenant_acme_2'");
  });

  it("allows a description-only edit while moving, as the service does", () => {
    expect(
      whyDatabaseEditIsStale(opened, { ...opened, Status: "moving" }, same),
    ).toBeNull();
  });

  it("refuses a change of server or name while not active, in the service's words", () => {
    expect(
      whyDatabaseEditIsStale(
        opened,
        { ...opened, Status: "moving" },
        { ...same, DatabaseName: "renamed" },
      ),
    ).toBe(RELOCATION_REFUSED_MESSAGE);
  });

  it("refuses when the database no longer exists", () => {
    expect(whyDatabaseEditIsStale(opened, null, same)).toContain("no longer exists");
  });
});
