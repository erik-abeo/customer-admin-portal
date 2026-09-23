import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { databaseServersApi } from "@/api/databaseServers";
import type { DatabaseServerInfoItem, ProbeDatabaseServerResponse } from "@/api/types";
import { theme } from "@/theme";

import { DatabaseServerForm } from "./DatabaseServerForm";

vi.mock("@/api/databaseServers", () => ({
  databaseServersApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    probe: vi.fn(),
  },
}));

const PEM = "-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----";

const stored: DatabaseServerInfoItem = {
  Id: 1,
  Name: "us-east-prod-01",
  Description: null,
  LocalServerAddress: "db-1.internal",
  RemoteServerAddress: null,
  ServerPort: 3306,
  AdminUserName: "cpmadmin",
  RootUserPassword: "Stored-Pass-1!",
  Certificate: PEM,
  SecurityGroupId: null,
};

const passing = {
  Success: true,
  IsSupported: true,
  Message: "ok",
  Checks: [],
} as unknown as ProbeDatabaseServerResponse;

function renderForm(initial?: DatabaseServerInfoItem) {
  const onSubmit = vi.fn();
  render(
    <MantineProvider theme={theme}>
      <QueryClientProvider client={new QueryClient()}>
        <DatabaseServerForm
          initial={initial}
          submitLabel={initial ? "Save changes" : "Register"}
          onCancel={() => undefined}
          onSubmit={onSubmit}
        />
      </QueryClientProvider>
    </MantineProvider>,
  );
  return { onSubmit };
}

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submitButton = (name: string) => screen.getByRole("button", { name });

describe("DatabaseServerForm", () => {
  beforeEach(() => {
    vi.mocked(databaseServersApi.probe).mockReset();
  });

  it("registers a new server only after a probe of exactly its connection passes", async () => {
    vi.mocked(databaseServersApi.probe).mockResolvedValue(passing);
    renderForm();

    type(/^Name/, "db-east-1");
    type(/^Local server address/, "db-east-1.internal");
    type(/^Administrator password/, "Str0ng-Passw0rd!");
    type(/^Certificate \(PEM\)/, PEM);
    expect(submitButton("Register")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Test connection/ }));

    await waitFor(() => expect(submitButton("Register")).toBeEnabled());
    // With a certificate the probe verifies against it, as the installer will.
    expect(databaseServersApi.probe).toHaveBeenCalledWith(
      expect.objectContaining({ SslMode: "VerifyCA", CertificatePem: PEM }),
    );

    // A different address is a different server: the pass no longer applies.
    type(/^Local server address/, "db-east-2.internal");
    expect(submitButton("Register")).toBeDisabled();
  });

  it("keeps a server whose login lacks PROCESS unregistrable and says why", async () => {
    const processDetail =
      "Login lacks PROCESS, so it cannot see or end other logins' connections.";
    vi.mocked(databaseServersApi.probe).mockResolvedValue({
      ...passing,
      IsSupported: false,
      CanSeeConnections: false,
      Message:
        "This server cannot be registered: the login cannot see other logins' connections (PROCESS).",
      Checks: [
        {
          Name: "privileges.grant-option",
          Passed: true,
          Detail: "Login holds GRANT OPTION.",
        },
        { Name: "privileges.process", Passed: false, Detail: processDetail },
      ],
    });
    renderForm();

    type(/^Name/, "db-east-1");
    type(/^Local server address/, "db-east-1.internal");
    type(/^Administrator password/, "Str0ng-Passw0rd!");
    fireEvent.click(screen.getByRole("button", { name: /Test connection/ }));

    expect(await screen.findByText(processDetail)).toBeInTheDocument();
    expect(
      screen.getByText(/cannot see other logins' connections \(PROCESS\)/),
    ).toBeInTheDocument();
    expect(submitButton("Register")).toBeDisabled();
  });

  it("does not gate an edit that leaves the connection alone", () => {
    renderForm(stored);

    type(/^Name/, "renamed");

    expect(submitButton("Save changes")).toBeEnabled();
    expect(
      screen.queryByLabelText(/Save without a passing probe/),
    ).not.toBeInTheDocument();
  });

  it("gates an edit that changes the connection, unless the operator saves anyway", () => {
    renderForm(stored);

    type(/^Local server address/, "db-2.internal");
    expect(submitButton("Save changes")).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/Save without a passing probe/));
    expect(submitButton("Save changes")).toBeEnabled();

    // The acknowledgement was for that connection; changing it again withdraws it.
    type(/^Local server address/, "db-3.internal");
    expect(submitButton("Save changes")).toBeDisabled();
  });

  it("probes an edit with the stored password when the field is left blank", async () => {
    vi.mocked(databaseServersApi.probe).mockResolvedValue(passing);
    renderForm(stored);

    type(/^Local server address/, "db-2.internal");
    fireEvent.click(screen.getByRole("button", { name: /Test connection/ }));

    await waitFor(() => expect(databaseServersApi.probe).toHaveBeenCalled());
    expect(databaseServersApi.probe).toHaveBeenCalledWith(
      expect.objectContaining({
        Host: "db-2.internal",
        Password: "Stored-Pass-1!",
        SslMode: "VerifyCA",
      }),
    );
  });
});
