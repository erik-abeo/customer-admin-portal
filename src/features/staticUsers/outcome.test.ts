import { describe, expect, it } from "vitest";

import type {
  CreateStaticDatabaseUserResponse,
  ServerAccessInfo,
  UpdateStaticDatabaseUserResponse,
} from "@/api/types";

import {
  generatedPassword,
  hasFailures,
  refusedOutright,
  serverOutcomes,
} from "./outcome";

const server = (overrides: Partial<ServerAccessInfo>): ServerAccessInfo => ({
  ServerId: 1,
  ServerName: "db-1",
  LocalServerAddress: "10.0.0.10",
  RemoteServerAddress: null,
  ServerPort: "3306",
  UserPassword: "Gen3rated!",
  Certificate: null,
  Databases: [],
  Errors: [],
  ...overrides,
});

const created = (
  servers: ServerAccessInfo[],
  message = "Success",
): CreateStaticDatabaseUserResponse => ({
  UserName: "static_user_2",
  Message: message,
  Servers: servers,
});

describe("static user outcomes", () => {
  it("reads the generated password from where the service sends it", () => {
    expect(generatedPassword(created([server({})]))).toBe("Gen3rated!");
    expect(generatedPassword(created([server({ UserPassword: null })]))).toBeNull();
  });

  it("counts a database's errors against its server", () => {
    const response = created(
      [
        server({ ServerId: 1 }),
        server({
          ServerId: 2,
          Databases: [
            {
              DatabaseId: 7,
              DatabaseName: "acme",
              Description: null,
              Privileges: null,
              Errors: ["Failed to grant privileges for database ID: 7"],
            },
          ],
        }),
      ],
      "Failure",
    );
    expect(serverOutcomes(response)).toEqual([
      { ServerId: 1, Failed: false, Errors: [] },
      {
        ServerId: 2,
        Failed: true,
        Errors: ["Failed to grant privileges for database ID: 7"],
      },
    ]);
    expect(hasFailures(response)).toBe(true);
  });

  it("treats a top-level Failure as failed even without detail", () => {
    const update: UpdateStaticDatabaseUserResponse = {
      UserName: "static_user_2",
      Message: "Failure",
      NewPassword: null,
      Servers: [{ ServerId: 1, Databases: null, Errors: null }],
    };
    expect(hasFailures(update)).toBe(true);
    expect(hasFailures({ ...update, Message: "Success" })).toBe(false);
  });

  it("copes with a response that lists no servers", () => {
    expect(serverOutcomes(created([]))).toEqual([]);
    expect(hasFailures({ UserName: "x", Message: "Success", Servers: null })).toBe(
      false,
    );
  });
});

describe("refusedOutright", () => {
  const refusal =
    "'tenant_stark' is suspended, so static users cannot be granted it until it is active again.";

  it("reads a refusal from Message Refused, for create and update alike", () => {
    const create = {
      UserName: "",
      Message: "Refused",
      Servers: [
        server({
          Databases: [
            {
              DatabaseId: 105,
              DatabaseName: null,
              Description: null,
              Privileges: null,
              Errors: [refusal],
            },
          ],
        }),
      ],
    } as unknown as CreateStaticDatabaseUserResponse;
    expect(refusedOutright(create)).toEqual([refusal]);

    const update = {
      UserName: "static_wayne_reports",
      Message: "Refused",
      NewPassword: null,
      Servers: [
        {
          ServerId: 3,
          Errors: [],
          Databases: [
            {
              DatabaseId: 105,
              DatabaseName: null,
              Privileges: null,
              Errors: [refusal],
            },
          ],
        },
      ],
    } as unknown as UpdateStaticDatabaseUserResponse;
    expect(refusedOutright(update)).toEqual([refusal]);
  });

  it("treats Success and any other value as having gone ahead, an older Failure as partial", () => {
    const partial = {
      UserName: "static_wayne_reports",
      Message: "Failure",
      NewPassword: null,
      Servers: [
        {
          ServerId: 3,
          Errors: [],
          Databases: [
            {
              DatabaseId: 105,
              DatabaseName: null,
              Privileges: null,
              Errors: ["Failed to update privileges for database ID: 105"],
            },
          ],
        },
      ],
    } as unknown as UpdateStaticDatabaseUserResponse;
    expect(refusedOutright(partial)).toBeNull();
    expect(hasFailures(partial)).toBe(true);

    const done = {
      ...partial,
      Message: "Success",
      Servers: [{ ServerId: 3, Errors: [], Databases: [] }],
    };
    expect(refusedOutright(done)).toBeNull();
    expect(hasFailures(done)).toBe(false);
    // Not "OK": only "Success" counts as everything applied.
    expect(hasFailures({ ...done, Message: "OK" })).toBe(true);
  });
});
