import { describe, expect, it } from "vitest";

import {
  type DatabaseInfoItem,
  type DatabaseServerInfoItem,
  emptyPrivileges,
} from "@/api/types";

import {
  GRANTABLE_PRIVILEGES,
  hasGrantablePrivilege,
  whyPrivilegesIncomplete,
  withoutGrantOption,
} from "./privileges";

const servers = [{ Id: 1, Name: "east-1" }] as DatabaseServerInfoItem[];
const databases = [
  { Id: 100, DatabaseName: "tenant_acme" },
  { Id: 101, DatabaseName: "tenant_globex" },
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
});
