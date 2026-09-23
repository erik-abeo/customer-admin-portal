import { describe, expect, it } from "vitest";

import type { DatabaseServerInfoItem, ProbeDatabaseServerResponse } from "@/api/types";

import {
  canSubmitServer,
  connectionChanged,
  effectiveConnection,
  probeSslMode,
  type ServerConnectionValues,
} from "./registration";

const probe = (IsSupported: boolean): ProbeDatabaseServerResponse =>
  ({ Success: true, IsSupported }) as ProbeDatabaseServerResponse;

const stored: DatabaseServerInfoItem = {
  Id: 1,
  Name: "us-east-prod-01",
  Description: null,
  LocalServerAddress: "db-1.internal",
  RemoteServerAddress: null,
  ServerPort: 3306,
  AdminUserName: "cpmadmin",
  RootUserPassword: "Stored-Pass-1!",
  Certificate: "-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----",
  SecurityGroupId: null,
};

// What the edit form starts with: everything stored, the password left blank.
const unchanged: ServerConnectionValues = {
  LocalServerAddress: "db-1.internal",
  ServerPort: 3306,
  AdminUserName: "cpmadmin",
  RootUserPassword: "",
  Certificate: stored.Certificate ?? "",
};

describe("canSubmitServer", () => {
  it("registers a new server only after a passing probe", () => {
    expect(canSubmitServer(false, true, null)).toBe(false);
    expect(canSubmitServer(false, true, probe(false))).toBe(false);
    expect(canSubmitServer(false, true, probe(true))).toBe(true);
  });

  it("does not gate an edit that leaves the connection alone", () => {
    expect(canSubmitServer(true, false, null)).toBe(true);
  });

  it("gates an edit that changes the connection like a new server", () => {
    expect(canSubmitServer(true, true, null)).toBe(false);
    expect(canSubmitServer(true, true, probe(false))).toBe(false);
    expect(canSubmitServer(true, true, probe(true))).toBe(true);
  });

  it("lets an operator save such an edit anyway, but never a new server", () => {
    expect(canSubmitServer(true, true, probe(false), true)).toBe(true);
    expect(canSubmitServer(true, true, null, true)).toBe(true);
    expect(canSubmitServer(false, true, probe(false), true)).toBe(false);
    expect(canSubmitServer(false, true, null, true)).toBe(false);
  });
});

describe("connectionChanged", () => {
  it("is false for the form as it opens, blank password included", () => {
    expect(connectionChanged(unchanged, stored)).toBe(false);
  });

  it("is false when the stored password is retyped", () => {
    expect(
      connectionChanged({ ...unchanged, RootUserPassword: "Stored-Pass-1!" }, stored),
    ).toBe(false);
  });

  it("is true for each connection field", () => {
    expect(
      connectionChanged({ ...unchanged, LocalServerAddress: "db-2.internal" }, stored),
    ).toBe(true);
    expect(connectionChanged({ ...unchanged, ServerPort: 3307 }, stored)).toBe(true);
    expect(connectionChanged({ ...unchanged, AdminUserName: "root" }, stored)).toBe(
      true,
    );
    expect(
      connectionChanged({ ...unchanged, RootUserPassword: "New-Pass-2!" }, stored),
    ).toBe(true);
    expect(
      connectionChanged(
        { ...unchanged, Certificate: "-----BEGIN CERTIFICATE-----\nBBB" },
        stored,
      ),
    ).toBe(true);
  });

  it("treats a blank certificate as keeping the stored one", () => {
    expect(connectionChanged({ ...unchanged, Certificate: "  " }, stored)).toBe(false);
  });
});

describe("effectiveConnection", () => {
  it("probes with the stored password and certificate when the fields are blank", () => {
    const connection = effectiveConnection({ ...unchanged, Certificate: "" }, stored);
    expect(connection.Password).toBe("Stored-Pass-1!");
    expect(connection.CertificatePem).toBe(stored.Certificate);
  });

  it("uses what was typed when there is nothing stored", () => {
    const connection = effectiveConnection({
      ...unchanged,
      RootUserPassword: "Typed-1!",
    });
    expect(connection.Password).toBe("Typed-1!");
  });
});

describe("probeSslMode", () => {
  it("verifies against the certificate when there is one", () => {
    expect(probeSslMode(effectiveConnection(unchanged, stored))).toBe("VerifyCA");
    expect(
      probeSslMode(
        effectiveConnection({ ...unchanged, Certificate: "", RootUserPassword: "x" }),
      ),
    ).toBe("Required");
  });
});
