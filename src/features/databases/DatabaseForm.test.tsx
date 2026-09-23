import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { databasesApi } from "@/api/databases";
import type { DatabaseInfoItem, DatabaseServerInfoItem } from "@/api/types";
import { theme } from "@/theme";

import { DatabaseEditButton } from "./DatabaseEditButton";
import { DatabaseForm } from "./DatabaseForm";

vi.mock("@/api/databases", () => ({
  databasesApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

const servers = [
  { Id: 1, Name: "east-1", LocalServerAddress: "10.0.0.1", ServerPort: 3306 },
  { Id: 2, Name: "east-2", LocalServerAddress: "10.0.0.2", ServerPort: 3306 },
] as DatabaseServerInfoItem[];

const opened: DatabaseInfoItem = {
  Id: 7,
  DatabaseServerId: 1,
  DatabaseName: "tenant_acme",
  Description: "Acme",
  CrystalPmId: 11111,
  Status: "active",
};

const renderForm = () => {
  const onSubmit = vi.fn();
  render(
    <MantineProvider theme={theme}>
      <DatabaseForm
        servers={servers}
        initial={opened}
        submitLabel="Save changes"
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />
    </MantineProvider>,
  );
  return onSubmit;
};

describe("DatabaseForm edit", () => {
  beforeEach(() => vi.mocked(databasesApi.get).mockReset());

  it("refuses to save when the database moved server since the form opened", async () => {
    vi.mocked(databasesApi.get).mockResolvedValue({
      Success: true,
      Message: null,
      DatabaseInfo: { ...opened, DatabaseServerId: 2 },
    });
    const onSubmit = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "has moved to another server since this form was opened",
    );
    expect(databasesApi.get).toHaveBeenCalledWith(7);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("saves when the database is as it was", async () => {
    vi.mocked(databasesApi.get).mockResolvedValue({
      Success: true,
      Message: null,
      DatabaseInfo: opened,
    });
    const onSubmit = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          Id: 7,
          DatabaseServerId: 1,
          DatabaseName: "tenant_acme",
        }),
      ),
    );
  });
});

describe("DatabaseEditButton", () => {
  it("stays available while the database is moving, since its description can be edited", () => {
    render(
      <MantineProvider theme={theme}>
        <DatabaseEditButton
          database={{ ...opened, Status: "moving" }}
          onEdit={() => undefined}
        />
      </MantineProvider>,
    );
    expect(screen.getByRole("button", { name: "Edit tenant_acme" })).toBeEnabled();
  });
});

describe("DatabaseForm on a database that is not active", () => {
  it("locks the server and name, and still saves a description change", async () => {
    const moving = { ...opened, Status: "moving" };
    vi.mocked(databasesApi.get).mockResolvedValue({
      Success: true,
      Message: null,
      DatabaseInfo: moving,
    });
    const onSubmit = vi.fn();
    render(
      <MantineProvider theme={theme}>
        <DatabaseForm
          servers={servers}
          initial={moving}
          submitLabel="Save changes"
          onCancel={() => undefined}
          onSubmit={onSubmit}
        />
      </MantineProvider>,
    );
    expect(screen.getByLabelText(/^Database name/)).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Acme, moving" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ Description: "Acme, moving" }),
      ),
    );
  });
});
