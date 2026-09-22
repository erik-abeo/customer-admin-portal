/**
 * TypeScript mirrors of the C# DTOs in
 * cni.libs.ClientRemoteDatabaseAccessAPI and ASP.NET
 * ClientRemoteDatabaseAccessAPI.Models.SupertokensService.
 *
 * The ASP.NET service configures System.Text.Json with no naming policy, so
 * property names are PascalCase on the wire; the default would be camelCase.
 * Names below match the wire format exactly to avoid mapping bugs. Every
 * DateTime is sent as UTC ISO 8601 with a trailing `Z`, so `new Date(value)`
 * reads it correctly in any time zone.
 */

export interface DatabaseMapping {
  DatabaseServerId: number;
  DatabaseId: number;
}

// ---------- Database Servers ----------

export interface DatabaseServerInfoItem {
  Id: number;
  Name: string;
  Description: string | null;
  LocalServerAddress: string;
  RemoteServerAddress: string | null;
  ServerPort: number;
  /**
   * Administrative login for this server. Defaults to `root`, but must be
   * settable: AWS RDS reserves that name and will not create a master user
   * called it, so an RDS server is administered under whatever master username
   * it was given.
   */
  AdminUserName: string;
  /**
   * Password for {@link AdminUserName}. Named for the era when that login was
   * always `root`; the backend column has not been renamed.
   */
  RootUserPassword: string;
  Certificate: string | null;
  /** AWS security group whose ingress rules gate access to this server. */
  SecurityGroupId: string | null;
}

export interface CreateDatabaseServerInfoRequest {
  Name: string;
  Description: string | null;
  LocalServerAddress: string;
  RemoteServerAddress: string | null;
  ServerPort: number;
  AdminUserName: string;
  RootUserPassword: string;
  /**
   * The CA the server's TLS certificate is issued under. Required: the service
   * refuses to register a server without one, because it verifies the server
   * against it and hands it to the installer so the installer can too.
   */
  Certificate: string;
  SecurityGroupId: string | null;
}

export interface CreateDatabaseServerInfoResponse {
  Id: number;
  Message: string | null;
}

export type UpdateDatabaseServerInfoRequest = DatabaseServerInfoItem;

export interface UpdateDatabaseServerInfoResponse {
  Success: boolean;
  Message: string | null;
}

export interface GetAllDatabaseServerInfoResponse {
  Success: boolean;
  Message: string | null;
  DatabaseServerInfoList: DatabaseServerInfoItem[];
}

// GetDatabaseServerInfo on the server returns the bare DatabaseServerInfoItem
// shape (no envelope) — see GetDatabaseServerInfoResponse.cs.
export type GetDatabaseServerInfoResponse = DatabaseServerInfoItem;

// ---------- Database server probe ----------

/**
 * Asks the backend to connect to a candidate server and report what it is,
 * without saving anything. Read-only and safe to repeat, so it can run while
 * the operator is still editing the form.
 */
export interface ProbeDatabaseServerRequest {
  Host: string;
  /** Defaults to 3306 server-side when omitted. */
  Port: string | null;
  User: string;
  /** Never persisted by the probe. */
  Password: string;
  /** Defaults to `Required` server-side when omitted. */
  SslMode: string | null;
  /** Optional CA, for `VerifyCA` / `VerifyFull`. */
  CertificatePem: string | null;
}

/** One named pass/fail line from a probe, rendered as a checklist row. */
export interface DatabaseServerProbeCheck {
  /** Stable id, e.g. `connect`, `engine`, `version`, `tls`, `privileges.create-user`. */
  Name: string;
  Passed: boolean;
  Detail: string;
}

/**
 * What the backend found.
 *
 * Gate registration on {@link ProbeDatabaseServerResponse.IsSupported}, not on
 * `Success`: `Success` only means the probe ran to completion. An unreachable
 * or unsuitable server is reported in the body rather than as a non-2xx.
 */
export interface ProbeDatabaseServerResponse {
  Success: boolean;
  Message: string | null;
  /** `MySql`, `MariaDb` or `Unknown`. Detected, never supplied by the caller. */
  Engine: string;
  EngineVersion: string | null;
  /** Unmodified `VERSION()`, kept for diagnostics. */
  RawVersion: string | null;
  /** Floor is MySQL 8.0 / MariaDB 10.6. */
  MeetsMinimumVersion: boolean;
  /** TLS actually negotiated, as opposed to merely requested. */
  TlsInUse: boolean;
  CanCreateDatabase: boolean;
  CanCreateUser: boolean;
  /**
   * Holds `GRANT OPTION`, without which the service cannot give a migration
   * login access to the schema it provisions.
   */
  CanGrant: boolean;
  /** Every gate passed, `CanGrant` included. */
  IsSupported: boolean;
  Checks: DatabaseServerProbeCheck[];
}

// ---------- Customer moves ----------

/**
 * `planned` -> `draining` -> `copying` -> `verifying` -> `flipped` ->
 * `settled`, plus `failed`, `cancelled` and `rolled_back`.
 *
 * `planned` and `draining` can be cancelled. `flipped` means the customer is on
 * the target and the source is retained. `settled` means the source has been
 * dropped, which is the point of no return.
 */
export type CustomerMoveStatus =
  | "planned"
  | "draining"
  | "copying"
  | "verifying"
  | "flipped"
  | "settled"
  | "failed"
  | "cancelled"
  | "rolled_back";

export interface CustomerMove {
  Id: number;
  DatabaseId: number;
  CrystalPmId: number;
  SourceDatabaseServerId: number;
  SourceDatabaseServerName: string | null;
  TargetDatabaseServerId: number;
  TargetDatabaseServerName: string | null;
  TargetDatabaseName: string | null;
  SourceDatabaseName: string | null;
  /** Nullable on the wire, like every string the service returns. */
  Status: CustomerMoveStatus | string | null;
  /** What the current phase is doing, in the operator's terms. */
  PhaseDetail: string | null;
  RequestedByAdmin: string | null;
  CreatedDateTimeUtc: string;
  QuiescedDateTimeUtc: string | null;
  CopyStartedDateTimeUtc: string | null;
  CopyCompletedDateTimeUtc: string | null;
  VerifiedDateTimeUtc: string | null;
  FlippedDateTimeUtc: string | null;
  SourceRetiredDateTimeUtc: string | null;
  /** Once set, the move can no longer be rolled back. */
  SourceDroppedDateTimeUtc: string | null;
  ErrorMessage: string | null;
}

export interface CustomerMoveVerification {
  Id: number;
  CustomerMoveId: number;
  TableName: string | null;
  SourceRowCount: number | null;
  TargetRowCount: number | null;
  SourceChecksum: number | null;
  TargetChecksum: number | null;
  /**
   * `checksum` or `row_count`, per table: a table whose checksum could not be
   * compared is recorded as `row_count`. Not equivalent, since matching row
   * counts say nothing about the values in them, so show which one each table
   * actually got.
   */
  VerificationMethod: string | null;
  Matched: boolean;
  CheckedDateTimeUtc: string;
}

export interface CreateCustomerMoveRequest {
  DatabaseId: number;
  TargetDatabaseServerId: number;
  /** Defaults to the source's name when omitted. */
  TargetDatabaseName: string | null;
  RequestedByAdmin: string | null;
}

export interface CustomerMoveResult {
  Success: boolean;
  Message: string | null;
  MoveId: number;
}

export interface GetCustomerMovesResponse {
  Success: boolean;
  Message: string | null;
  Moves: CustomerMove[];
}

export interface GetCustomerMoveResponse {
  Success: boolean;
  Message: string | null;
  Move: CustomerMove | null;
  Verification: CustomerMoveVerification[];
}

// ---------- Server capacity and placement ----------

/** Headroom, NearCapacity, Full or Unreachable. */
export type CapacityVerdict =
  | "Headroom"
  | "NearCapacity"
  | "Full"
  | "Unreachable"
  | "Unknown";

/** One customer's footprint on a server. */
export interface CustomerDatabaseCapacity {
  DatabaseId: number;
  DatabaseName: string | null;
  CrystalPmId: number;
  DataBytes: number;
  IndexBytes: number;
  /** InnoDB's sampled estimate. Fine for comparing customers, not for anything exact. */
  ApproxRowCount: number;
  AuthorizedUserCount: number;
  /**
   * Authorizations over the last 30 days. A proxy for how busy an office is:
   * how often people sat down to use CrystalPM, which is what scales when
   * another customer is added beside them.
   */
  AuthorizationsLast30Days: number;
  /** Registered but absent from the server, or present but not registered. */
  IsOrphaned: boolean;
}

/**
 * How full a server is, and whether another customer should go on it.
 *
 * `VerdictReasons` is always populated, including for `Headroom`. A verdict on
 * its own is a number somebody has to take on faith, and an operator choosing
 * where a customer's records live should not be taking anything on faith.
 */
export interface ServerCapacity {
  DatabaseServerId: number;
  Name: string | null;
  Engine: string | null;
  EngineVersion: string | null;
  Status: string | null;
  CustomerDatabaseCount: number;
  /** Soft placement cap. Null means no stated limit to compare against. */
  MaxCustomerDatabases: number | null;
  AuthorizedUserCount: number;
  DataBytes: number;
  IndexBytes: number;
  ApproxRowCount: number;
  ThreadsConnected: number | null;
  MaxConnections: number | null;
  Verdict: CapacityVerdict;
  VerdictReasons: string[];
  /** Why the server could not be measured, when the verdict is `Unreachable`. */
  UnreachableReason: string | null;
  Databases: CustomerDatabaseCapacity[];
}

export interface GetServerCapacityResponse {
  Success: boolean;
  Message: string | null;
  Server: ServerCapacity | null;
}

export interface GetFleetCapacityResponse {
  Success: boolean;
  Message: string | null;
  Servers: ServerCapacity[];
}

/**
 * One recorded measurement of a server, taken by the service's collector.
 * Every figure is nullable: a column added after a snapshot was taken has no
 * value for it.
 */
export interface ServerMetricsPoint {
  /** UTC, ISO 8601 with a trailing `Z`. */
  UtcTimestamp: string;
  CustomerDatabaseCount: number | null;
  AuthorizedUserCount: number | null;
  DataBytes: number | null;
  IndexBytes: number | null;
  ApproxRowCount: number | null;
  DatabaseConnections: number | null;
}

export interface GetServerCapacityHistoryResponse {
  Success: boolean;
  Message: string | null;
  DatabaseServerId: number;
  /** The window actually returned, after the service clamps it to 1..400. */
  Days: number;
  /** Oldest first. Unreachable servers are not recorded, so gaps are real. */
  Points: ServerMetricsPoint[];
}

// ---------- Migration sessions ----------

/**
 * Mints a migration key for one customer's move.
 *
 * Supply exactly one of `DatabaseId` (an existing database) or `DatabaseName`
 * (one to provision). Both or neither is a 400: the two readings do different
 * things to a customer's data, so the backend will not guess.
 */
export interface CreateMigrationSessionRequest {
  DatabaseServerId: number;
  DatabaseId: number | null;
  DatabaseName: string | null;
  CrystalPmId: number;
  CreatedByAdmin: string | null;
  /** Clamped to 5..1440 server-side. Defaults to 120. */
  ExpiresInMinutes: number | null;
}

export interface CreateMigrationSessionResponse {
  Success: boolean;
  Message: string | null;
  SessionId: number;
  /**
   * Shown once and never retrievable: only its hash is stored. Losing it means
   * revoking this session and minting another.
   */
  MigrationKey: string | null;
  /**
   * Leading group of the key, safe to show in a list afterwards. Keys look like
   * `CPM-7K4D-9QX2-8M3T-4HZW`, so this is `7K4D`: 20 of the key's 80 bits,
   * leaving 60 secret.
   */
  MigrationKeyPrefix: string | null;
  ExpiresUtc: string;
  /**
   * The destination in words, for the confirmation step. Appends a warning when
   * the customer already has a database on a different server.
   */
  TargetSummary: string | null;
}

/** `pending` → `redeemed` → `streaming` → `completed` | `failed`, plus `expired` and `revoked`. */
export type MigrationSessionStatus =
  | "pending"
  | "redeemed"
  | "streaming"
  | "completed"
  | "failed"
  | "expired"
  | "revoked";

export interface MigrationSessionItem {
  Id: number;
  MigrationKeyPrefix: string | null;
  DatabaseServerId: number;
  DatabaseServerName: string | null;
  DatabaseId: number | null;
  DatabaseName: string | null;
  /** Schema name the key will create, for a key minted against a new database. */
  ProvisionDatabaseName: string | null;
  /**
   * The session created `DatabaseId` itself, as opposed to streaming into one
   * that already existed. Only a database this session created can be
   * discarded.
   */
  DatabaseCreated: boolean;
  CrystalPmId: number;
  /** Nullable on the wire, like every string the service returns. */
  Status: MigrationSessionStatus | string | null;
  Phase: string | null;
  CreatedByAdmin: string | null;
  CreatedDateTimeUtc: string;
  ExpiresDateTimeUtc: string;
  RedeemedDateTimeUtc: string | null;
  CompletedDateTimeUtc: string | null;
  ClientPublicIp: string | null;
  ClientMachineId: string | null;
  MigrationUserName: string | null;
  MigrationUserHost: string | null;
  LastHeartbeatUtc: string | null;
  ErrorMessage: string | null;
}

export interface MigrationSessionProgressItem {
  Id: number;
  UtcTimestamp: string;
  Phase: string | null;
  TableName: string | null;
  RowsDone: number | null;
  RowsTotal: number | null;
  BytesDone: number | null;
  Message: string | null;
  IsError: boolean;
}

export interface GetMigrationSessionsResponse {
  Success: boolean;
  Message: string | null;
  Sessions: MigrationSessionItem[];
}

export interface GetMigrationSessionResponse {
  Success: boolean;
  Message: string | null;
  Session: MigrationSessionItem | null;
  /** Oldest first. A migration that died partway says where it got to. */
  Progress: MigrationSessionProgressItem[];
}

// ---------- Databases ----------

export interface DatabaseInfoItem {
  Id: number;
  DatabaseServerId: number;
  DatabaseName: string;
  Description: string | null;
  CrystalPmId: number;
  /**
   * `active`, `moving`, `suspended` or `retired`. Only an active database can
   * be migrated into or moved; the service refuses the rest. Null only
   * defensively: the service always sends one.
   */
  Status: string | null;
}

export interface CreateDatabaseInfoRequest {
  DatabaseServerId: number;
  DatabaseName: string;
  Description: string | null;
  CrystalPmId: number;
}

export interface CreateDatabaseInfoResponse {
  Success: boolean;
  Message: string | null;
  Id: number;
}

export interface UpdateDatabaseInfoRequest {
  Id: number;
  DatabaseServerId?: number | null;
  DatabaseName?: string | null;
  Description?: string | null;
  CrystalPmId?: number | null;
}

export interface UpdateDatabaseInfoResponse {
  Success: boolean;
  Message: string | null;
}

export interface GetDatabaseInfoResponse {
  Success: boolean;
  Message: string | null;
  DatabaseInfo: DatabaseInfoItem | null;
}

export interface GetAllDatabaseInfoResponse {
  Success: boolean;
  Message: string | null;
  DatabaseInfoList: DatabaseInfoItem[];
}

// ---------- Authorized Users (Supertokens + DB mappings) ----------

export interface AuthorizedUserInfoItem {
  Id: number;
  Email: string;
  UseStaticHost: boolean;
  StaticHost: string | null;
  DatabaseMappings: DatabaseMapping[];
}

export interface CreateUserRequest {
  Email: string;
  Password: string;
  UseStaticHost: boolean;
  StaticHost: string | null;
  DatabaseMappings: DatabaseMapping[];
}

export interface UpdateUserRequest {
  UserId: string;
  Email: string;
  Password?: string | null;
  UseStaticHost: boolean;
  StaticHost: string | null;
  DatabaseMappings: DatabaseMapping[];
}

export interface GetAuthorizedUserResponse {
  Success: boolean;
  Message: string | null;
  UserInfo: AuthorizedUserInfoItem | null;
}

export interface GetAuthorizedUsersResponse {
  Success: boolean;
  Message: string | null;
  AuthorizedUserInfoList: AuthorizedUserInfoItem[];
}

// ---------- Static Database Users ----------

export interface DatabasePrivileges {
  AllPrivileges: boolean;
  SelectPrivilege: boolean;
  InsertPrivilege: boolean;
  UpdatePrivilege: boolean;
  DeletePrivilege: boolean;
  CreatePrivilege: boolean;
  DropPrivilege: boolean;
  GrantPrivilege: boolean;
}

export const emptyPrivileges = (): DatabasePrivileges => ({
  AllPrivileges: false,
  SelectPrivilege: false,
  InsertPrivilege: false,
  UpdatePrivilege: false,
  DeletePrivilege: false,
  CreatePrivilege: false,
  DropPrivilege: false,
  GrantPrivilege: false,
});

export interface DatabasePrivilegeInfo {
  DatabaseId: number;
  Privileges: DatabasePrivileges;
}

export interface DatabaseServerPrivilegeInfo {
  ServerId: number;
  Databases: DatabasePrivilegeInfo[];
}

export interface CreateStaticDatabaseUserRequest {
  UserPassword: string;
  Description: string | null;
  Servers: DatabaseServerPrivilegeInfo[];
}

export interface ServerAccessInfo {
  ServerId: number;
  ServerName?: string | null;
  HostAddress?: string | null;
  Port?: number | null;
  UserName?: string | null;
  Password?: string | null;
  Message?: string | null;
}

export interface CreateStaticDatabaseUserResponse {
  UserName: string;
  Message: string | null;
  Servers: ServerAccessInfo[];
}

export interface UpdateStaticDatabaseUserRequest {
  Id: number;
  UserName: string;
  GenerateNewPassword: boolean;
  NewDescription: string | null;
  Servers: DatabaseServerPrivilegeInfo[];
}

export interface ServerUpdateInfo {
  ServerId: number;
  Message?: string | null;
}

export interface UpdateStaticDatabaseUserResponse {
  UserName: string;
  Message: string | null;
  NewPassword: string | null;
  Servers: ServerUpdateInfo[];
}

export interface GetStaticDatabaseUserResponse {
  Id: number;
  DatabaseServerId: number;
  UserName: string;
  Description: string | null;
  CreatedDateTimeUtc: string;
  LastModifiedDateTimeUtc: string;
}

export interface GetStaticDatabaseUserDetailResponse extends GetStaticDatabaseUserResponse {
  DatabasePrivileges: DatabasePrivilegeInfo[];
}

// ---------- Event Log (PENDING BACKEND, see BACKEND-CONTRACT.md) ----------

export interface EventLogEntry {
  Id: number;
  TimestampUtc: string;
  UserEmail: string | null;
  IpAddress: string | null;
  DatabaseServerId: number | null;
  DatabaseId: number | null;
  EventType: string;
  Message: string | null;
  Details: string | null;
}

export interface EventLogQueryParams {
  userEmail?: string;
  ipAddress?: string;
  databaseServerId?: number;
  databaseId?: number;
  fromUtc?: string;
  toUtc?: string;
  eventType?: string;
  page?: number;
  pageSize?: number;
}

export interface EventLogQueryResponse {
  Items: EventLogEntry[];
  TotalCount: number;
  Page: number;
  PageSize: number;
}
