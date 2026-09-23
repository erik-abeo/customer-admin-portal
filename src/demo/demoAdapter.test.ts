import { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";

import type {
  CreateCustomerMoveRequest,
  CreateStaticDatabaseUserResponse,
  CustomerMove,
  UpdateStaticDatabaseUserResponse,
} from "@/api/types";

import { emptyPrivileges } from "@/api/types";

import { refusedOutright } from "@/features/staticUsers/outcome";

import { demoAdapter } from "./demoAdapter";
import { demoStore } from "./demoStore";

async function call(method: string, url: string, body?: unknown) {
  const config = {
    method,
    url: `/My${url}`,
    headers: new AxiosHeaders(),
    data: body === undefined ? undefined : JSON.stringify(body),
  } as InternalAxiosRequestConfig;
  return demoAdapter(config);
}

const move = (
  overrides: Partial<CreateCustomerMoveRequest>,
): CreateCustomerMoveRequest => ({
  DatabaseId: 101,
  TargetDatabaseServerId: 2,
  TargetDatabaseName: null,
  RequestedByAdmin: "demo",
  ...overrides,
});

const messageOf = (data: unknown) => (data as { Message: string }).Message;

describe("demo customer moves refuse what the service refuses", () => {
  it("refuses a database a static user holds privileges on", async () => {
    // tenant_acme (100) is granted to static user 1 in the fixtures.
    const res = await call("post", "/create-customer-move", move({ DatabaseId: 100 }));
    expect(res.status).toBe(400);
    expect(messageOf(res.data)).toContain(
      "static user privilege(s) are held on this database",
    );
  });

  it("refuses a target name the service would not accept", async () => {
    const res = await call(
      "post",
      "/create-customer-move",
      move({ TargetDatabaseName: "bad-name; drop" }),
    );
    expect(res.status).toBe(400);
    expect(messageOf(res.data)).toContain("is not a usable database name");
  });

  it("refuses a target name already taken on the target server", async () => {
    // tenant_umbrella (103) is on server 2.
    const res = await call(
      "post",
      "/create-customer-move",
      move({ TargetDatabaseName: "tenant_umbrella" }),
    );
    expect(res.status).toBe(400);
    expect(messageOf(res.data)).toContain(
      "already has a database named 'tenant_umbrella'",
    );
  });

  it("refuses a database a migration is streaming into", async () => {
    demoStore.migrationSessions.push({
      ...demoStore.migrationSessions[0],
      Id: 9901,
      DatabaseId: 101,
      Status: "streaming",
    });
    try {
      const res = await call("post", "/create-customer-move", move({}));
      expect(res.status).toBe(400);
      expect(messageOf(res.data)).toContain(
        "A migration is streaming into this database",
      );
    } finally {
      demoStore.migrationSessions = demoStore.migrationSessions.filter(
        (s) => s.Id !== 9901,
      );
    }
  });

  it("plans a move of the movable demo customer", async () => {
    const res = await call("post", "/create-customer-move", move({}));
    expect(res.status).toBe(200);
    expect((res.data as { Success: boolean }).Success).toBe(true);
    // Clean up: the database is marked moving by planning.
    demoStore.customerMoves = [];
    const db = demoStore.databases.find((d) => d.Id === 101);
    if (db) db.Status = "active";
  });

  it("finishes a source drop that was interrupted after the move settled", async () => {
    const interrupted = {
      Id: 9902,
      DatabaseId: 104,
      Status: "settled",
      SourceDatabaseName: "tenant_wayne",
      SourceDroppedDateTimeUtc: null,
    } as CustomerMove;
    demoStore.customerMoves = [interrupted];
    try {
      const res = await call("post", "/drop-customer-move-source/9902");
      expect((res.data as { Success: boolean }).Success).toBe(true);
      expect(demoStore.customerMoves[0].SourceDroppedDateTimeUtc).not.toBeNull();
    } finally {
      demoStore.customerMoves = [];
    }
  });
});

describe("demo static users answer in the service's shape", () => {
  it("returns the generated password as UserPassword on each server", async () => {
    const res = await call("post", "/create-static-database-user", {
      UserPassword: null,
      Description: "demo",
      Servers: [{ ServerId: 1, Databases: [] }],
    });
    const data = res.data as CreateStaticDatabaseUserResponse;
    expect(data.Message).toBe("Success");
    expect(data.Servers?.[0].UserPassword).toBeTruthy();
    expect(data.Servers?.[0].Errors).toEqual([]);
  });

  it("reports a server the user is not on as a failure, as the service does", async () => {
    const existing = demoStore.staticUsers[0];
    const res = await call("put", "/update-static-database-user", {
      Id: existing.Id,
      UserName: existing.UserName,
      GenerateNewPassword: false,
      NewDescription: null,
      Servers: [{ ServerId: 99999, Databases: [] }],
    });
    const data = res.data as UpdateStaticDatabaseUserResponse;
    expect(data.Message).toBe("Failure");
    expect(data.Servers?.[0].Errors?.length).toBeGreaterThan(0);
  });
});

describe("demo servers not taking new customers are refused as the service refuses them", () => {
  // us-east-legacy-01 (4) is seeded as retiring.
  const mint = (overrides: Record<string, unknown>) => ({
    DatabaseServerId: 4,
    DatabaseId: null,
    DatabaseName: "legacy_new",
    CrystalPmId: 4242,
    CreatedByAdmin: "demo",
    ExpiresInMinutes: 60,
    ...overrides,
  });

  it("reports the recorded status on the capacity reading", async () => {
    const res = await call("get", "/get-fleet-capacity");
    const servers = (
      res.data as { Servers: { DatabaseServerId: number; Status: string }[] }
    ).Servers;
    expect(servers.find((s) => s.DatabaseServerId === 4)?.Status).toBe("retiring");
    expect(servers.find((s) => s.DatabaseServerId === 1)?.Status).toBe("available");
  });

  it("refuses a move to a target that is missing or not available", async () => {
    const missing = await call(
      "post",
      "/create-customer-move",
      move({ DatabaseId: 102, TargetDatabaseServerId: 99 }),
    );
    expect(missing.status).toBe(400);
    expect(messageOf(missing.data)).toBe("Database server 99 does not exist.");

    const retiring = await call(
      "post",
      "/create-customer-move",
      move({ DatabaseId: 102, TargetDatabaseServerId: 4 }),
    );
    expect(retiring.status).toBe(400);
    expect(messageOf(retiring.data)).toBe(
      "The target server is marked 'retiring', so it is not taking new customers.",
    );
  });

  it("refuses a key for a missing server, or one provisioning on a server not available", async () => {
    const missing = await call(
      "post",
      "/create-migration-session",
      mint({ DatabaseServerId: 99 }),
    );
    expect(missing.status).toBe(400);
    expect(messageOf(missing.data)).toBe("Database server 99 does not exist.");

    const provision = await call("post", "/create-migration-session", mint({}));
    expect(provision.status).toBe(400);
    expect(messageOf(provision.data)).toBe(
      "That server is marked 'retiring', so it is not taking new customers.",
    );
  });

  it("still mints a key against a database already on a server not available", async () => {
    demoStore.databases.push({
      Id: 950,
      DatabaseServerId: 4,
      DatabaseName: "legacy_4242",
      Description: null,
      CrystalPmId: 4242,
      Status: "active",
    });
    const res = await call(
      "post",
      "/create-migration-session",
      mint({ DatabaseId: 950, DatabaseName: null }),
    );
    expect(res.status).toBe(200);
  });
});

describe("demo discard refuses a target that is not this migration's to drop", () => {
  // Session 503 failed after creating easyopti_0319 (202) on server 1.
  it("refuses while another session on the database has not failed", async () => {
    const retry = {
      ...demoStore.migrationSessions.find((m) => m.Id === 503)!,
      Id: 990,
    };
    retry.Status = "streaming";
    demoStore.migrationSessions.push(retry);
    try {
      const res = await call("post", "/discard-migration-target/503");
      expect(res.status).toBe(200);
      expect(messageOf(res.data)).toBe(
        "'easyopti_0319' is also the target of session 990 (streaming), so it is not this migration's to drop.",
      );
    } finally {
      demoStore.migrationSessions = demoStore.migrationSessions.filter(
        (m) => m.Id !== 990,
      );
    }
  });

  it("refuses while user mappings, static privileges or moves refer to it", async () => {
    const user = demoStore.authorizedUsers[0]!;
    const before = user.DatabaseMappings;
    user.DatabaseMappings = [
      ...(before ?? []),
      { DatabaseServerId: 1, DatabaseId: 202 },
    ];
    demoStore.staticUserPrivileges[1] = [
      ...(demoStore.staticUserPrivileges[1] ?? []),
      { DatabaseId: 202, Privileges: [] } as never,
    ];
    try {
      const res = await call("post", "/discard-migration-target/503");
      expect((res.data as { Success: boolean }).Success).toBe(false);
      expect(messageOf(res.data)).toBe(
        "'easyopti_0319' is in use: 1 user mapping(s), 1 static user privilege(s) refer to it. Remove those first if it really is disposable.",
      );
    } finally {
      user.DatabaseMappings = before;
      demoStore.staticUserPrivileges[1] = demoStore.staticUserPrivileges[1]!.filter(
        (p) => p.DatabaseId !== 202,
      );
    }
  });
});

describe("demo discard refuses a target whose registration was repointed", () => {
  it("answers 409 while the registration names something else, and drops it once it does not", async () => {
    // Session 503 failed after creating easyopti_0319 (202) on server 1.
    const registration = demoStore.databases.find((d) => d.Id === 202);
    expect(registration).toBeDefined();
    registration!.DatabaseName = "easyopti_0319_renamed";

    const repointed = await call("post", "/discard-migration-target/503");
    expect(repointed.status).toBe(409);
    expect(messageOf(repointed.data)).toContain(
      "is no longer this migration's to drop",
    );
    expect(demoStore.databases.some((d) => d.Id === 202)).toBe(true);

    registration!.DatabaseName = "easyopti_0319";
    const discarded = await call("post", "/discard-migration-target/503");
    expect(discarded.status).toBe(200);
    expect(demoStore.databases.some((d) => d.Id === 202)).toBe(false);
  });
});

describe("demo probe", () => {
  it("rejects a login without PROCESS and names the check", async () => {
    const res = await call("post", "/probe-database-server", {
      Host: "noprocess.demo",
      Port: "3306",
      User: "cpmadmin",
      Password: "x",
    });
    const body = res.data as {
      IsSupported: boolean;
      CanSeeConnections: boolean;
      Message: string;
      Checks: { Name: string; Passed: boolean }[];
    };
    expect(body.IsSupported).toBe(false);
    expect(body.CanSeeConnections).toBe(false);
    expect(body.Message).toContain("(PROCESS)");
    expect(body.Checks.find((c) => c.Name === "privileges.process")?.Passed).toBe(
      false,
    );
  });
});

describe("demo server registration", () => {
  it("stores blank optional fields as null, as the service does", async () => {
    const res = await call("post", "/create-database-server-info", {
      Name: "blank-fields",
      Description: "  ",
      LocalServerAddress: "10.9.9.9",
      RemoteServerAddress: "",
      ServerPort: 3306,
      AdminUserName: "cpmadmin",
      RootUserPassword: "pw",
      Certificate: null,
      SecurityGroupId: "",
    });
    const id = (res.data as { Id: number }).Id;
    const stored = demoStore.servers.find((s) => s.Id === id);
    expect(stored?.Description).toBeNull();
    expect(stored?.RemoteServerAddress).toBeNull();
    expect(stored?.SecurityGroupId).toBeNull();
  });
});

describe("demo static user updates, as the service applies them", () => {
  const privs = (id: number) =>
    (demoStore.staticUserPrivileges[id] ?? []).map((p) => p.DatabaseId);

  it("revokes per server: a server's grid replaces what the user held there", async () => {
    // static_initech_replica is row 2 on server 1 (102) and row 3 on server 2 (103).
    const before = structuredClone(demoStore.staticUserPrivileges);
    const kept = demoStore.staticUserPrivileges[2]![0]!;
    try {
      const res = await call("put", "/update-static-database-user", {
        Id: 2,
        UserName: "static_initech_replica",
        GenerateNewPassword: false,
        NewDescription: null,
        Servers: [
          { ServerId: 1, Databases: [kept] },
          { ServerId: 2, Databases: [] },
        ],
      });
      expect((res.data as UpdateStaticDatabaseUserResponse).Message).toBe("Success");
      expect(privs(2)).toEqual([102]);
      // Edited through row 2, and still revoked on the other server.
      expect(privs(3)).toEqual([]);
    } finally {
      demoStore.staticUserPrivileges = before;
    }
  });

  it("refuses the whole update when any database is not active, and changes nothing", async () => {
    // static_wayne_reports (4) holds 104 and tenant_stark (105), which is suspended.
    const before = structuredClone(demoStore.staticUserPrivileges);
    try {
      const res = await call("put", "/update-static-database-user", {
        Id: 4,
        UserName: "static_wayne_reports",
        GenerateNewPassword: false,
        NewDescription: null,
        // Drops 104's grant and asks again for 105: neither may happen.
        Servers: [{ ServerId: 3, Databases: [demoStore.staticUserPrivileges[4]![1]] }],
      });
      const data = res.data as UpdateStaticDatabaseUserResponse;
      expect(data.Message).toBe("Refused");
      expect(data.Servers![0]!.Databases).toEqual([
        expect.objectContaining({
          DatabaseId: 105,
          Errors: [
            "'tenant_stark' is suspended, so static users cannot be granted it until it is active again.",
          ],
        }),
      ]);
      expect(privs(4)).toEqual([104, 105]);
    } finally {
      demoStore.staticUserPrivileges = before;
    }
  });

  it("refuses a database with no grantable privilege, or listed under the wrong server", async () => {
    const res = await call("put", "/update-static-database-user", {
      Id: 2,
      UserName: "static_initech_replica",
      GenerateNewPassword: false,
      NewDescription: null,
      Servers: [
        // tenant_initech (102) with only GRANT ticked, which is never applied.
        {
          ServerId: 1,
          Databases: [
            {
              DatabaseId: 102,
              Privileges: { ...emptyPrivileges(), GrantPrivilege: true },
            },
          ],
        },
        // tenant_umbrella (103) is on server 2, listed here under server 1's row.
        {
          ServerId: 2,
          Databases: [
            {
              DatabaseId: 100,
              Privileges: { ...emptyPrivileges(), SelectPrivilege: true },
            },
          ],
        },
      ],
    });
    const data = res.data as UpdateStaticDatabaseUserResponse;
    expect(data.Message).toBe("Refused");
    expect(data.Servers![0]!.Databases![0]!.Errors).toEqual([
      "No privilege is selected for 'tenant_initech'. Select at least one, or remove the database.",
    ]);
    expect(data.Servers![1]!.Databases![0]!.Errors).toEqual([
      "'tenant_acme' is not on server 2. Re-pick it under the server it is on.",
    ]);
    expect(privs(2)).toEqual([102]);
  });

  it("creates nothing when any requested database cannot be granted", async () => {
    const users = demoStore.staticUsers.length;
    const res = await call("post", "/create-static-database-user", {
      UserPassword: null,
      Description: null,
      Servers: [
        {
          ServerId: 1,
          Databases: [
            {
              DatabaseId: 101,
              Privileges: { ...emptyPrivileges(), SelectPrivilege: true },
            },
            {
              DatabaseId: 999,
              Privileges: { ...emptyPrivileges(), SelectPrivilege: true },
            },
          ],
        },
      ],
    });
    const data = res.data as CreateStaticDatabaseUserResponse;
    expect(data.Message).toBe("Refused");
    expect(data.UserName).toBe("");
    expect(data.Servers![0]!.Databases).toEqual([
      expect.objectContaining({
        DatabaseId: 999,
        Errors: ["Database ID 999 does not exist."],
      }),
    ]);
    expect(demoStore.staticUsers.length).toBe(users);
  });
});

describe("demo capacity verdicts", () => {
  it("marks a server that is not available as Full, with the service's reason", async () => {
    const res = await call("get", "/get-fleet-capacity");
    const legacy = (
      res.data as {
        Servers: {
          DatabaseServerId: number;
          Verdict: string;
          VerdictReasons: string[];
        }[];
      }
    ).Servers.find((s) => s.DatabaseServerId === 4)!;
    expect(legacy.Verdict).toBe("Full");
    expect(legacy.VerdictReasons[0]).toBe(
      "The server is marked 'retiring', so it is not accepting customers.",
    );
  });
});

describe("demo database updates, as the service applies them", () => {
  it("refuses a change of server or name while the database is not active, and nothing is saved", async () => {
    // tenant_stark (105) is suspended.
    const res = await call("put", "/update-database-info", {
      Id: 105,
      DatabaseServerId: 3,
      DatabaseName: "tenant_stark_renamed",
      Description: null,
      CrystalPmId: 66666,
    });
    expect(res.data).toEqual({
      Success: false,
      Message:
        "This database's server or name cannot be changed while it is not active or while a move of it can still be rolled back or drop its source. Nothing was saved; reload it and try again.",
    });
    expect(demoStore.databases.find((d) => d.Id === 105)?.DatabaseName).toBe(
      "tenant_stark",
    );
  });

  it("still saves a description-only edit of a database that is not active", async () => {
    const stark = demoStore.databases.find((d) => d.Id === 105)!;
    const before = stark.Description;
    try {
      const res = await call("put", "/update-database-info", {
        Id: 105,
        DatabaseServerId: 3,
        DatabaseName: "tenant_stark",
        Description: "Stark, suspended",
        CrystalPmId: 66666,
      });
      expect((res.data as { Success: boolean }).Success).toBe(true);
      expect(demoStore.databases.find((d) => d.Id === 105)?.Description).toBe(
        "Stark, suspended",
      );
    } finally {
      demoStore.databases.find((d) => d.Id === 105)!.Description = before;
    }
  });
});

describe("demo per-database user read", () => {
  it("returns only the mapping asked about, as the service does", async () => {
    const res = await call("get", "/get-users/1/100");
    const users = (
      res.data as { AuthorizedUserInfoList: { DatabaseMappings: unknown[] }[] }
    ).AuthorizedUserInfoList;
    expect(users.length).toBeGreaterThan(0);
    for (const u of users)
      expect(u.DatabaseMappings).toEqual([{ DatabaseServerId: 1, DatabaseId: 100 }]);
  });
});

describe("demo deletes follow the contract's spec for the pending endpoints", () => {
  it("refuses a server that still has databases, and keeps both", async () => {
    const res = await call("delete", "/delete-database-server-info/1");
    expect(res.status).toBe(409);
    expect(messageOf(res.data)).toContain("still registered on this server");
    expect(demoStore.servers.some((s) => s.Id === 1)).toBe(true);
    expect(demoStore.databases.some((d) => d.DatabaseServerId === 1)).toBe(true);
  });

  it("refuses a database that users are still mapped to", async () => {
    // tenant_acme (100) is mapped to authorized users and granted to static user 1.
    const res = await call("delete", "/delete-database-info/100");
    expect(res.status).toBe(409);
    expect(messageOf(res.data)).toContain("still in use");
    expect(demoStore.databases.some((d) => d.Id === 100)).toBe(true);
  });
});

describe("demo mint refuses a second live key on a database", () => {
  it("refuses while another key on it is streaming, in the service's words", async () => {
    // Session 502 is streaming into database 201; register 201 for the check.
    demoStore.databases.push({
      Id: 201,
      DatabaseServerId: 2,
      DatabaseName: "easyopti_0887",
      Description: null,
      CrystalPmId: 887,
      Status: "active",
    });
    try {
      const res = await call("post", "/create-migration-session", {
        DatabaseServerId: 2,
        DatabaseId: 201,
        DatabaseName: null,
        CrystalPmId: 887,
        CreatedByAdmin: "demo",
        ExpiresInMinutes: 60,
      });
      expect(res.status).toBe(400);
      expect(messageOf(res.data)).toBe(
        "The selected database already has a live migration key (session 502, streaming). Revoke it first, or wait for it to finish.",
      );
    } finally {
      demoStore.databases = demoStore.databases.filter((d) => d.Id !== 201);
    }
  });
});

describe("demo static user refusals read as refusals", () => {
  it("answers a refused create and update in the shape the portal detects", async () => {
    const create = await call("post", "/create-static-database-user", {
      UserPassword: null,
      Description: null,
      Servers: [
        {
          ServerId: 3,
          Databases: [
            {
              DatabaseId: 105,
              Privileges: { ...emptyPrivileges(), SelectPrivilege: true },
            },
          ],
        },
      ],
    });
    expect(refusedOutright(create.data as CreateStaticDatabaseUserResponse)).toEqual([
      "'tenant_stark' is suspended, so static users cannot be granted it until it is active again.",
    ]);

    const update = await call("put", "/update-static-database-user", {
      Id: 4,
      UserName: "static_wayne_reports",
      GenerateNewPassword: true,
      NewDescription: null,
      Servers: [{ ServerId: 3, Databases: demoStore.staticUserPrivileges[4] }],
    });
    const data = update.data as UpdateStaticDatabaseUserResponse;
    expect(refusedOutright(data)).toHaveLength(1);
    // Refused outright, so not even the rotation happened.
    expect(data.NewPassword).toBeNull();
  });
});
