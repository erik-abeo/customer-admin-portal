import { describe, expect, it } from "vitest";

import type {
  CreateStaticDatabaseUserResponse,
  ServerAccessInfo,
  UpdateStaticDatabaseUserResponse,
} from "@/api/types";

import { generatedPassword, hasFailures, serverOutcomes } from "./outcome";

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
