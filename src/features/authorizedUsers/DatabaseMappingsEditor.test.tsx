import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DatabaseInfoItem, DatabaseServerInfoItem } from "@/api/types";
import { theme } from "@/theme";

import { DatabaseMappingsEditor } from "./DatabaseMappingsEditor";

const servers = [
  { Id: 1, Name: "east-1", LocalServerAddress: "10.0.0.1", ServerPort: 3306 },
  { Id: 2, Name: "east-2", LocalServerAddress: "10.0.0.2", ServerPort: 3306 },
] as DatabaseServerInfoItem[];
// tenant_acme has moved from east-1 to east-2.
const databases = [
  { Id: 100, DatabaseServerId: 2, DatabaseName: "tenant_acme", CrystalPmId: 11111 },
] as DatabaseInfoItem[];

describe("DatabaseMappingsEditor", () => {
  it("shows a held pair that matches no checkbox by name, and removes it", () => {
    const onChange = vi.fn();
    render(
      <MantineProvider theme={theme}>
        <DatabaseMappingsEditor
          servers={servers}
          databases={databases}
          value={[{ DatabaseServerId: 1, DatabaseId: 100 }]}
          onChange={onChange}
        />
      </MantineProvider>,
    );

    expect(
      screen.getByText(/is mapped under east-1 but is now on east-2/),
    ).toBeInTheDocument();
    // Its checkbox under its real server is not ticked: the pair is stale.
    expect(screen.getByRole("checkbox", { name: /tenant_acme/ })).not.toBeChecked();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove mapping to tenant_acme" }),
    );
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
