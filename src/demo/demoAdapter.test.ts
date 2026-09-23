import { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";

import type {
  CreateCustomerMoveRequest,
  CreateStaticDatabaseUserResponse,
  CustomerMove,
  UpdateStaticDatabaseUserResponse,
} from "@/api/types";

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
