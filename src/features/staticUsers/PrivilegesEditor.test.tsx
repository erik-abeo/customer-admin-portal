import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

  it("shows a held database now on another server by name, and removes it", () => {
    const onChange = vi.fn();
    render(
      <MantineProvider theme={theme}>
        <PrivilegesEditor
          servers={[...servers, { Id: 2, Name: "east-2" } as DatabaseServerInfoItem]}
          databases={[
            ...databases,
            {
              Id: 200,
              DatabaseServerId: 2,
              DatabaseName: "tenant_moved",
              Status: "active",
            } as DatabaseInfoItem,
          ]}
          value={[
            {
              ServerId: 1,
              Databases: [
                {
                  DatabaseId: 200,
                  Privileges: { ...emptyPrivileges(), SelectPrivilege: true },
                },
              ],
            },
          ]}
          onChange={onChange}
        />
      </MantineProvider>,
    );

    expect(screen.getByText(/is held here but is now on east-2/)).toBeInTheDocument();
    expect(screen.queryByText("#200")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove tenant_moved from east-1" }),
    );
    expect(onChange).toHaveBeenCalledWith([{ ServerId: 1, Databases: [] }]);
  });
});
