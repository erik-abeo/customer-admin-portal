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
  AuthorizedUserInfoItem,
  DatabaseInfoItem,
  DatabasePrivileges,
  DatabaseServerInfoItem,
  EventLogEntry,
  GetStaticDatabaseUserResponse,
} from "@/api/types";

const NOW_ISO = "2026-04-30T18:00:00Z";
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
];

export const seedDatabases: DatabaseInfoItem[] = [
  {
    Id: 100,
    DatabaseServerId: 1,
    DatabaseName: "tenant_acme",
    Description: "Acme Eyecare — 4 locations",
    CrystalPmId: 11111,
  },
  {
    Id: 101,
    DatabaseServerId: 1,
    DatabaseName: "tenant_globex",
    Description: "Globex Optical — single location",
    CrystalPmId: 22222,
  },
  {
    Id: 102,
    DatabaseServerId: 1,
    DatabaseName: "tenant_initech",
    Description: "Initech Vision Group",
    CrystalPmId: 33333,
  },
  {
    Id: 103,
    DatabaseServerId: 2,
    DatabaseName: "tenant_umbrella",
    Description: "Umbrella Eyecare — newly onboarded",
    CrystalPmId: 44444,
  },
  {
    Id: 104,
    DatabaseServerId: 3,
    DatabaseName: "tenant_wayne",
    Description: "Wayne Optical — multi-doctor practice",
    CrystalPmId: 55555,
  },
  {
    Id: 105,
    DatabaseServerId: 3,
    DatabaseName: "tenant_stark",
    Description: "Stark Vision Center",
    CrystalPmId: 66666,
  },
];

export const seedAuthorizedUsers: AuthorizedUserInfoItem[] = [
  {
    Id: 1001,
    Email: "alice.morris@acme-eyecare.com",
    UseStaticHost: true,
    StaticHost: "203.0.113.10",
    DatabaseMappings: [{ DatabaseServerId: 1, DatabaseId: 100 }],
  },
  {
    Id: 1002,
    Email: "bob.chen@globex-optical.com",
    UseStaticHost: false,
    StaticHost: null,
    DatabaseMappings: [{ DatabaseServerId: 1, DatabaseId: 101 }],
  },
  {
    Id: 1003,
    Email: "carol.diaz@initech-vision.com",
    UseStaticHost: true,
    StaticHost: "203.0.113.42",
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
    DatabaseMappings: [{ DatabaseServerId: 3, DatabaseId: 104 }],
  },
  {
    Id: 1005,
    Email: "eve.fischer@stark-vision.com",
    UseStaticHost: true,
    StaticHost: "198.51.100.7",
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
  1: [
    { DatabaseId: 100, Privileges: readOnlyPrivs },
    { DatabaseId: 101, Privileges: readOnlyPrivs },
  ],
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
