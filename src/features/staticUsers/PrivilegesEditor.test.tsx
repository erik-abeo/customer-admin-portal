import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  type DatabaseInfoItem,
  type DatabaseServerInfoItem,
  emptyPrivileges,
} from "@/api/types";
import { theme } from "@/theme";

import { PrivilegesEditor } from "./PrivilegesEditor";

const servers = [{ Id: 1, Name: "east-1" }] as DatabaseServerInfoItem[];
const databases = [
  { Id: 100, DatabaseServerId: 1, DatabaseName: "tenant_acme", Status: "active" },
  { Id: 101, DatabaseServerId: 1, DatabaseName: "tenant_globex", Status: "suspended" },
  { Id: 102, DatabaseServerId: 1, DatabaseName: "tenant_initech", Status: "moving" },
] as DatabaseInfoItem[];

describe("PrivilegesEditor", () => {
  it("offers only active databases, and keeps a held one that went inactive untickable", () => {
    render(
      <MantineProvider theme={theme}>
        <PrivilegesEditor
          servers={servers}
          databases={databases}
          value={[
            {
              ServerId: 1,
              Databases: [
                {
                  DatabaseId: 102,
                  Privileges: { ...emptyPrivileges(), SelectPrivilege: true },
                },
              ],
            },
          ]}
          onChange={() => undefined}
        />
      </MantineProvider>,
    );

    expect(screen.getByRole("checkbox", { name: "tenant_acme" })).toBeEnabled();
    // Not held and not active: cannot be picked, and says why.
    const globex = screen.getByRole("checkbox", { name: /^tenant_globex/ });
    expect(globex).toBeDisabled();
    expect(screen.getByText(/unavailable: suspended/)).toBeInTheDocument();
    // Held but gone moving: still enabled, so it can be unticked.
    expect(screen.getByRole("checkbox", { name: /^tenant_initech/ })).toBeEnabled();
    expect(screen.queryByRole("checkbox", { name: /^GRANT on/ })).toBeNull();
  });
});
