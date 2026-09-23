import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { emptyPrivileges, type GetStaticDatabaseUserDetailResponse } from "@/api/types";
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

  it("refuses a ticked database with no privilege, and shows why", async () => {
    const onSubmit = vi.fn();
    render(
      <MantineProvider theme={theme}>
        <StaticUserForm
          servers={[{ Id: 1, Name: "east-1" } as never]}
          databases={[
            { Id: 100, DatabaseServerId: 1, DatabaseName: "tenant_acme" } as never,
          ]}
          initial={initial}
          initialServers={[
            {
              ServerId: 1,
              Databases: [{ DatabaseId: 100, Privileges: emptyPrivileges() }],
            },
          ]}
          submitLabel="Save changes"
          onCancel={() => undefined}
          onSubmit={onSubmit}
        />
      </MantineProvider>,
    );

    expect(screen.queryByRole("checkbox", { name: /^GRANT on/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pick at least one privilege for tenant_acme on east-1, or untick it.",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("StaticUserForm refusal", () => {
  it("shows why the service refused the last submit, keeping the form", () => {
    render(
      <MantineProvider theme={theme}>
        <StaticUserForm
          servers={[]}
          databases={[]}
          initial={initial}
          initialServers={[{ ServerId: 1, Databases: [] }]}
          submitLabel="Save changes"
          onCancel={() => undefined}
          onSubmit={vi.fn()}
          refusal={{
            title: "Nothing was changed",
            reasons: [
              "'tenant_stark' is suspended, so static users cannot be granted it until it is active again.",
            ],
          }}
        />
      </MantineProvider>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Nothing was changed");
    expect(alert).toHaveTextContent("'tenant_stark' is suspended");
    expect(screen.getByLabelText("Description")).toHaveValue("Read-only ETL");
  });
});
