import { describe, expect, it } from "vitest";

import {
  type DatabaseInfoItem,
  type DatabaseServerInfoItem,
  emptyPrivileges,
} from "@/api/types";

import {
  GRANTABLE_PRIVILEGES,
  hasGrantablePrivilege,
  whyNotGrantableStatus,
  whyPrivilegesIncomplete,
  withoutGrantOption,
} from "./privileges";

const servers = [{ Id: 1, Name: "east-1" }] as DatabaseServerInfoItem[];
const databases = [
  { Id: 100, DatabaseServerId: 1, DatabaseName: "tenant_acme" },
  { Id: 101, DatabaseServerId: 1, DatabaseName: "tenant_globex" },
] as DatabaseInfoItem[];

describe("static user privileges", () => {
  it("does not offer GRANT, which the service never applies", () => {
    expect(GRANTABLE_PRIVILEGES.map((p) => p.label)).not.toContain("GRANT");
  });

  it("counts GRANT alone as no privilege", () => {
    expect(hasGrantablePrivilege({ ...emptyPrivileges(), GrantPrivilege: true })).toBe(
      false,
    );
    expect(hasGrantablePrivilege({ ...emptyPrivileges(), SelectPrivilege: true })).toBe(
      true,
    );
  });

  it("names every ticked database with no privilege", () => {
    expect(
      whyPrivilegesIncomplete(
        [
          {
            ServerId: 1,
            Databases: [
              { DatabaseId: 100, Privileges: emptyPrivileges() },
              {
                DatabaseId: 101,
                Privileges: { ...emptyPrivileges(), SelectPrivilege: true },
              },
            ],
          },
        ],
        servers,
        databases,
      ),
    ).toBe("Pick at least one privilege for tenant_acme on east-1, or untick it.");
  });

  it("always sends GrantPrivilege false", () => {
    const [grid] = withoutGrantOption([
      {
        ServerId: 1,
        Databases: [
          {
            DatabaseId: 100,
            Privileges: {
              ...emptyPrivileges(),
              SelectPrivilege: true,
              GrantPrivilege: true,
            },
          },
        ],
      },
    ]);
    expect(grid!.Databases[0]!.Privileges.GrantPrivilege).toBe(false);
    expect(grid!.Databases[0]!.Privileges.SelectPrivilege).toBe(true);
  });

  it("flags a ticked database that is no longer active, and says to untick it", () => {
    const moving = [
      { Id: 100, DatabaseServerId: 1, DatabaseName: "tenant_acme", Status: "moving" },
    ] as DatabaseInfoItem[];
    expect(
      whyPrivilegesIncomplete(
        [
          {
            ServerId: 1,
            Databases: [
              {
                DatabaseId: 100,
                Privileges: { ...emptyPrivileges(), SelectPrivilege: true },
              },
            ],
          },
        ],
        servers,
        moving,
      ),
    ).toBe(
      "Untick tenant_acme on east-1 (a customer move is in progress): static users can only be granted an active database, and the service refuses the whole change otherwise.",
    );
  });

  it("does not hold a missing status against a database", () => {
    expect(whyNotGrantableStatus(undefined)).toBeNull();
    expect(whyNotGrantableStatus("active")).toBeNull();
    expect(whyNotGrantableStatus("suspended")).toBe("suspended");
  });

  it("flags a held database that a move put on another server, in the service's words", () => {
    const moved = [
      { Id: 100, DatabaseServerId: 2, DatabaseName: "tenant_acme", Status: "active" },
    ] as DatabaseInfoItem[];
    expect(
      whyPrivilegesIncomplete(
        [
          {
            ServerId: 1,
            Databases: [
              {
                DatabaseId: 100,
                Privileges: { ...emptyPrivileges(), SelectPrivilege: true },
              },
            ],
          },
        ],
        servers,
        moved,
      ),
    ).toBe(
      "'tenant_acme' is not on server 1. Re-pick it under the server it is on. Remove it from this server.",
    );
  });
});
