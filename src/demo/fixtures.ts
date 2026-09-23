/**
 * Demo-mode seed data.
 *
 * These fixtures populate the in-memory demo store at startup. They are
 * intentionally rich enough to make every page feel "alive" without the
 * real backend running:
 *   - 3 database servers across 2 regions
 *   - 6 customer databases mapped to CrystalPM IDs
 *   - 5 authorized users with mixed host restrictions and access maps
 *   - 4 static DB users (some present on multiple servers so the
 *     grouping logic in StaticUsersPage has interesting input)
 *   - A stream of recent event-log entries so the EventLog page renders
 *     non-empty
 *
 * All shapes mirror src/api/types.ts (PascalCase, matching the wire
 * format of the ASP.NET ClientRemoteDatabaseAccessAPI).
 */
import type {
  MigrationSessionItem,
  MigrationSessionProgressItem,
  AuthorizedUserInfoItem,
  DatabaseInfoItem,
  DatabasePrivileges,
  DatabaseServerInfoItem,
  EventLogEntry,
  GetStaticDatabaseUserResponse,
} from "@/api/types";

/**
 * "Now" for the seed, taken when this module loads. The demo store is built
 * from these seeds in the same load (a reload re-seeds), so every seeded time is
 * relative to the moment the demo started. A fixed date would put the seed in
 * the past by however long ago it was written: demo mode's sweeper and expiry,
 * which compare against the real clock, would then fail the live stream and
 * expire the pending key on first load.
 */
const NOW_ISO = new Date().toISOString();
const HOURS_AGO = (h: number) =>
  new Date(Date.parse(NOW_ISO) - h * 3_600_000).toISOString();
const DAYS_AGO = (d: number) => HOURS_AGO(d * 24);

export const seedServers: DatabaseServerInfoItem[] = [
  {
    Id: 1,
    Name: "us-east-prod-01",
    Description: "Primary US-East shard — high-volume tenants",
    LocalServerAddress: "10.0.0.10",
    RemoteServerAddress: "remotedb-1.crystalpm.net",
    ServerPort: 3306,
    AdminUserName: "cpmadmin",
    RootUserPassword: "demo-root-pw-1",
    Certificate: null,
    SecurityGroupId: "sg-0demo10000demo1",
  },
  {
    Id: 2,
    Name: "us-east-prod-02",
    Description: "Secondary US-East shard — overflow + new tenants",
    LocalServerAddress: "10.0.0.11",
    RemoteServerAddress: "remotedb-2.crystalpm.net",
    ServerPort: 3306,
    AdminUserName: "cpmadmin",
    RootUserPassword: "demo-root-pw-2",
    Certificate: null,
    SecurityGroupId: "sg-0demo20000demo2",
  },
  {
    Id: 3,
    Name: "us-west-prod-01",
    Description: "US-West region for west-coast practices",
    LocalServerAddress: "10.10.0.10",
    RemoteServerAddress: "remotedb-w1.crystalpm.net",
    ServerPort: 3306,
    AdminUserName: "cpmadmin",
    RootUserPassword: "demo-root-pw-3",
    Certificate: null,
    SecurityGroupId: "sg-0demo30000demo3",
  },
  {
    Id: 4,
    Name: "us-east-legacy-01",
    Description: "Being retired; takes no new customers",
    LocalServerAddress: "10.0.0.5",
    RemoteServerAddress: null,
    ServerPort: 3306,
    AdminUserName: "cpmadmin",
    RootUserPassword: "demo-root-pw-4",
    Certificate: null,
    SecurityGroupId: null,
  },
];

/**
 * Each server's recorded `status`. The server list does not carry it; the
 * service reports it on the capacity reading. Only `available` takes new
 * customers, so us-east-legacy-01 shows the refusal. A server created during
 * the demo is `available`, as the column defaults.
 */
export const seedServerStatuses: Record<number, string> = {
  1: "available",
  2: "available",
  3: "available",
  4: "retiring",
};

export const seedDatabases: DatabaseInfoItem[] = [
  {
    Id: 100,
    DatabaseServerId: 1,
    DatabaseName: "tenant_acme",
    Description: "Acme Eyecare — 4 locations",
    CrystalPmId: 11111,
    Status: "active",
  },
  {
    Id: 101,
    DatabaseServerId: 1,
    DatabaseName: "tenant_globex",
    Description: "Globex Optical — single location",
    CrystalPmId: 22222,
    Status: "active",
  },
  {
    Id: 102,
    DatabaseServerId: 1,
    DatabaseName: "tenant_initech",
    Description: "Initech Vision Group",
    CrystalPmId: 33333,
    Status: "active",
  },
  {
    Id: 103,
    DatabaseServerId: 2,
    DatabaseName: "tenant_umbrella",
    Description: "Umbrella Eyecare — newly onboarded",
    CrystalPmId: 44444,
    Status: "active",
  },
  {
    Id: 104,
    DatabaseServerId: 3,
    DatabaseName: "tenant_wayne",
    Description: "Wayne Optical — multi-doctor practice",
    CrystalPmId: 55555,
    Status: "active",
  },
  {
    Id: 105,
    DatabaseServerId: 3,
    DatabaseName: "tenant_stark",
    Description: "Stark Vision Center — suspended for non-payment",
    CrystalPmId: 66666,
    Status: "suspended",
  },
  {
    // The existing database migration 502 is streaming into.
    Id: 201,
    DatabaseServerId: 2,
    DatabaseName: "easyopti_0887",
    Description: null,
    CrystalPmId: 887,
    Status: "active",
  },
  {
    // Provisioned by migration 503, which failed. Left registered, as the
    // service leaves it, so its target can be discarded.
    Id: 202,
    DatabaseServerId: 1,
    DatabaseName: "easyopti_0319",
    Description: null,
    CrystalPmId: 319,
    Status: "active",
  },
];

export const seedAuthorizedUsers: AuthorizedUserInfoItem[] = [
  {
    Id: 1001,
    Email: "alice.morris@acme-eyecare.com",
    UseStaticHost: true,
    StaticHost: "203.0.113.10",
    MaxLoginInstances: 1,
    DatabaseMappings: [{ DatabaseServerId: 1, DatabaseId: 100 }],
  },
  {
    Id: 1002,
    Email: "bob.chen@globex-optical.com",
    UseStaticHost: false,
    StaticHost: null,
    MaxLoginInstances: 1,
    DatabaseMappings: [{ DatabaseServerId: 1, DatabaseId: 101 }],
  },
  {
    Id: 1003,
    Email: "carol.diaz@initech-vision.com",
    UseStaticHost: true,
    StaticHost: "203.0.113.42",
    MaxLoginInstances: 3,
    DatabaseMappings: [
      { DatabaseServerId: 1, DatabaseId: 102 },
      { DatabaseServerId: 2, DatabaseId: 103 },
    ],
  },
  {
    Id: 1004,
    Email: "dan.evans@wayne-optical.com",
    UseStaticHost: false,
    StaticHost: null,
    MaxLoginInstances: 1,
    DatabaseMappings: [{ DatabaseServerId: 3, DatabaseId: 104 }],
  },
  {
    Id: 1005,
    Email: "eve.fischer@stark-vision.com",
    UseStaticHost: true,
    StaticHost: "198.51.100.7",
    MaxLoginInstances: 1,
    DatabaseMappings: [{ DatabaseServerId: 3, DatabaseId: 105 }],
  },
];

/**
 * Static DB users — one row per (server, user_name) tuple. The portal
 * groups these client-side, so we ship the same user across two servers
 * to exercise the grouping path.
 */
export const seedStaticUsers: GetStaticDatabaseUserResponse[] = [
  {
    Id: 1,
    DatabaseServerId: 1,
    UserName: "static_acme_etl",
    Description: "Acme Eyecare — read-only ETL service",
    CreatedDateTimeUtc: DAYS_AGO(45),
    LastModifiedDateTimeUtc: DAYS_AGO(2),
  },
  {
    Id: 2,
    DatabaseServerId: 1,
    UserName: "static_initech_replica",
    Description: "Initech Vision — replication reader",
    CreatedDateTimeUtc: DAYS_AGO(30),
    LastModifiedDateTimeUtc: DAYS_AGO(30),
  },
  {
    Id: 3,
    DatabaseServerId: 2,
    UserName: "static_initech_replica",
    Description: "Initech Vision — replication reader (DR site)",
    CreatedDateTimeUtc: DAYS_AGO(30),
    LastModifiedDateTimeUtc: DAYS_AGO(30),
  },
  {
    Id: 4,
    DatabaseServerId: 3,
    UserName: "static_wayne_reports",
    Description: "Wayne Optical — nightly report job",
    CreatedDateTimeUtc: DAYS_AGO(7),
    LastModifiedDateTimeUtc: DAYS_AGO(1),
  },
];

/**
 * Privilege grids per static-user id. Returned by /get-static-database-user/{id}.
 * Realistic mix of full-access, RO, and RW patterns.
 */
const fullPrivs: DatabasePrivileges = {
  AllPrivileges: true,
  SelectPrivilege: true,
  InsertPrivilege: true,
  UpdatePrivilege: true,
  DeletePrivilege: true,
  CreatePrivilege: true,
  DropPrivilege: true,
  GrantPrivilege: false,
};
const readOnlyPrivs: DatabasePrivileges = {
  AllPrivileges: false,
  SelectPrivilege: true,
  InsertPrivilege: false,
  UpdatePrivilege: false,
  DeletePrivilege: false,
  CreatePrivilege: false,
  DropPrivilege: false,
  GrantPrivilege: false,
};
const readWritePrivs: DatabasePrivileges = {
  AllPrivileges: false,
  SelectPrivilege: true,
  InsertPrivilege: true,
  UpdatePrivilege: true,
  DeletePrivilege: false,
  CreatePrivilege: false,
  DropPrivilege: false,
  GrantPrivilege: false,
};

export const seedStaticUserPrivileges: Record<
  number,
  Array<{ DatabaseId: number; Privileges: DatabasePrivileges }>
> = {
  // tenant_globex (101) is deliberately left without static-user privileges: the
  // service refuses to move a database a static user can reach, so it is the
  // demo's movable customer.
  1: [{ DatabaseId: 100, Privileges: readOnlyPrivs }],
  2: [{ DatabaseId: 102, Privileges: readWritePrivs }],
  3: [{ DatabaseId: 103, Privileges: readWritePrivs }],
  4: [
    { DatabaseId: 104, Privileges: fullPrivs },
    { DatabaseId: 105, Privileges: readOnlyPrivs },
  ],
};

export const seedEventLog: EventLogEntry[] = [
  {
    Id: 9001,
    TimestampUtc: HOURS_AGO(0.5),
    UserEmail: "alice.morris@acme-eyecare.com",
    IpAddress: "203.0.113.10",
    DatabaseServerId: 1,
    DatabaseId: 100,
    EventType: "Login",
    Message: "Successful authentication",
    Details: null,
  },
  {
    Id: 9002,
    TimestampUtc: HOURS_AGO(1.2),
    UserEmail: "bob.chen@globex-optical.com",
    IpAddress: "198.51.100.45",
    DatabaseServerId: 1,
    DatabaseId: 101,
    EventType: "Login",
    Message: "Successful authentication",
    Details: null,
  },
  {
    Id: 9003,
    TimestampUtc: HOURS_AGO(1.8),
    UserEmail: "carol.diaz@initech-vision.com",
    IpAddress: "203.0.113.42",
    DatabaseServerId: 1,
    DatabaseId: 102,
    EventType: "DatabaseSwitch",
    Message: "Switched primary database from tenant_initech to tenant_umbrella",
    Details: null,
  },
  {
    Id: 9004,
    TimestampUtc: HOURS_AGO(3.1),
    UserEmail: "dan.evans@wayne-optical.com",
    IpAddress: "192.0.2.118",
    DatabaseServerId: 3,
    DatabaseId: 104,
    EventType: "Login",
    Message: "Successful authentication",
    Details: null,
  },
  {
    Id: 9005,
    TimestampUtc: HOURS_AGO(4.5),
    UserEmail: "alice.morris@acme-eyecare.com",
    IpAddress: "198.51.100.66",
    DatabaseServerId: 1,
    DatabaseId: 100,
    EventType: "LoginFailure",
    Message: "Static-host check failed",
    Details: "Expected 203.0.113.10 but request originated from 198.51.100.66",
  },
  {
    Id: 9007,
    TimestampUtc: HOURS_AGO(8.2),
    UserEmail: "eve.fischer@stark-vision.com",
    IpAddress: "198.51.100.7",
    DatabaseServerId: 3,
    DatabaseId: 105,
    EventType: "Login",
    Message: "Successful authentication",
    Details: null,
  },
  {
    Id: 9008,
    TimestampUtc: HOURS_AGO(12.0),
    UserEmail: "bob.chen@globex-optical.com",
    IpAddress: "198.51.100.45",
    DatabaseServerId: 1,
    DatabaseId: 101,
    EventType: "Logout",
    Message: "Session ended",
    Details: null,
  },
  {
    Id: 9009,
    TimestampUtc: DAYS_AGO(1),
    UserEmail: null,
    IpAddress: null,
    DatabaseServerId: 1,
    DatabaseId: null,
    EventType: "AdminAction",
    Message: "Created authorized user carol.diaz@initech-vision.com",
    Details: "DatabaseMappings count: 2",
  },
  {
    Id: 9010,
    TimestampUtc: DAYS_AGO(2),
    UserEmail: null,
    IpAddress: null,
    DatabaseServerId: 2,
    DatabaseId: 103,
    EventType: "AdminAction",
    Message: "Imported initial seed for tenant_umbrella",
    Details: null,
  },
];

/**
 * Seed migrations covering the states the page renders differently: one still
 * waiting to be redeemed, one mid-stream, and one that failed partway so the
 * timeline has an error entry to show.
 */
export const seedMigrationSessions: MigrationSessionItem[] = [
  {
    Id: 501,
    MigrationKeyPrefix: "7K4D",
    DatabaseServerId: 1,
    DatabaseServerName: "us-east-prod-01",
    DatabaseId: null,
    DatabaseName: null,
    ProvisionDatabaseName: "easyopti_1042",
    DatabaseCreated: false,
    CrystalPmId: 1042,
    Status: "pending",
    Phase: null,
    CreatedByAdmin: "demo.admin",
    CreatedDateTimeUtc: HOURS_AGO(1),
    ExpiresDateTimeUtc: new Date(Date.parse(NOW_ISO) + 3_600_000).toISOString(),
    RedeemedDateTimeUtc: null,
    CompletedDateTimeUtc: null,
    ClientPublicIp: null,
    ClientMachineId: null,
    MigrationUserName: null,
    MigrationUserHost: null,
    LastHeartbeatUtc: null,
    ErrorMessage: null,
  },
  {
    Id: 502,
    MigrationKeyPrefix: "9QX2",
    DatabaseServerId: 2,
    DatabaseServerName: "us-east-prod-02",
    DatabaseId: 201,
    DatabaseName: "easyopti_0887",
    ProvisionDatabaseName: null,
    DatabaseCreated: false,
    CrystalPmId: 887,
    Status: "streaming",
    Phase: "Migrate all tables",
    CreatedByAdmin: "demo.admin",
    CreatedDateTimeUtc: HOURS_AGO(3),
    ExpiresDateTimeUtc: new Date(Date.parse(NOW_ISO) + 1_800_000).toISOString(),
    RedeemedDateTimeUtc: HOURS_AGO(2),
    CompletedDateTimeUtc: null,
    ClientPublicIp: "203.0.113.42",
    ClientMachineId: "WS-OPTI-07",
    MigrationUserName: "cpmmig_502_a1b2c3d4",
    MigrationUserHost: "203.0.113.42",
    LastHeartbeatUtc: HOURS_AGO(0.01),
    ErrorMessage: null,
  },
  {
    Id: 503,
    MigrationKeyPrefix: "8M3T",
    DatabaseServerId: 1,
    DatabaseServerName: "us-east-prod-01",
    DatabaseId: 202,
    DatabaseName: "easyopti_0319",
    ProvisionDatabaseName: "easyopti_0319",
    DatabaseCreated: true,
    CrystalPmId: 319,
    Status: "failed",
    Phase: "Migrate all tables",
    CreatedByAdmin: "demo.admin",
    CreatedDateTimeUtc: DAYS_AGO(1),
    ExpiresDateTimeUtc: HOURS_AGO(20),
    RedeemedDateTimeUtc: DAYS_AGO(1),
    CompletedDateTimeUtc: HOURS_AGO(22),
    ClientPublicIp: "198.51.100.8",
    ClientMachineId: "WS-OPTI-02",
    MigrationUserName: "cpmmig_503_e5f6g7h8",
    MigrationUserHost: "198.51.100.8",
    LastHeartbeatUtc: HOURS_AGO(22),
    ErrorMessage: "Lost connection to the destination while importing 'audit_log'.",
  },
];

export const seedMigrationProgress: Record<number, MigrationSessionProgressItem[]> = {
  502: [
    {
      Id: 9001,
      UtcTimestamp: HOURS_AGO(2),
      Phase: "Check Requirements",
      TableName: null,
      RowsDone: null,
      RowsTotal: null,
      BytesDone: null,
      Message: "Source verified, 4.2 GB estimated.",
      IsError: false,
    },
    {
      Id: 9002,
      UtcTimestamp: HOURS_AGO(1.2),
      Phase: "Migrate all tables",
      TableName: "patients",
      RowsDone: 184_233,
      RowsTotal: 184_233,
      BytesDone: 1_120_000_000,
      Message: null,
      IsError: false,
    },
    {
      Id: 9003,
      UtcTimestamp: HOURS_AGO(0.01),
      Phase: "Migrate all tables",
      TableName: "audit_log",
      RowsDone: 402_115,
      RowsTotal: 1_288_400,
      BytesDone: 2_640_000_000,
      Message: null,
      IsError: false,
    },
  ],
  503: [
    {
      Id: 9101,
      UtcTimestamp: DAYS_AGO(1),
      Phase: "Migrate all tables",
      TableName: "audit_log",
      RowsDone: 51_002,
      RowsTotal: 980_400,
      BytesDone: 310_000_000,
      Message: null,
      IsError: false,
    },
    {
      Id: 9102,
      UtcTimestamp: HOURS_AGO(22),
      Phase: "Migrate all tables",
      TableName: "audit_log",
      RowsDone: null,
      RowsTotal: null,
      BytesDone: null,
      Message: "Lost connection to the destination while importing 'audit_log'.",
      IsError: true,
    },
  ],
};
