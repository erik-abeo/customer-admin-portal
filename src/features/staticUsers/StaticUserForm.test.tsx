import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GetStaticDatabaseUserDetailResponse } from "@/api/types";
import { theme } from "@/theme";

import { StaticUserForm } from "./StaticUserForm";

const initial = {
  Id: 1,
  DatabaseServerId: 1,
  UserName: "static_acme_etl",
  Description: "Read-only ETL",
  CreatedDateTimeUtc: "2026-09-01T00:00:00Z",
  LastModifiedDateTimeUtc: "2026-09-01T00:00:00Z",
  DatabasePrivileges: [],
} as GetStaticDatabaseUserDetailResponse;

describe("StaticUserForm edit", () => {
  it("refuses to clear a stored description, which the service would keep", async () => {
    const onSubmit = vi.fn();
    render(
      <MantineProvider theme={theme}>
        <StaticUserForm
          servers={[]}
          databases={[]}
          initial={initial}
          initialServers={[{ ServerId: 1, Databases: [] }]}
          submitLabel="Save changes"
          onCancel={() => undefined}
          onSubmit={onSubmit}
        />
      </MantineProvider>,
    );

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText(/Description cannot be cleared once set/),
    ).toBeInTheDocument();
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });
});
