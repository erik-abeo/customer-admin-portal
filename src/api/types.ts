/**
 * TypeScript mirrors of the C# DTOs in
 * cni.libs.ClientRemoteDatabaseAccessAPI and ASP.NET
 * ClientRemoteDatabaseAccessAPI.Models.SupertokensService.
 *
 * The ASP.NET service uses default System.Text.Json serialization, which
 * preserves PascalCase property names by default for these projects. Property
 * names below match the wire format exactly to avoid mapping bugs.
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
  Certificate: string | null;
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
  IsSupported: boolean;
  Checks: DatabaseServerProbeCheck[];
}

// ---------- Databases ----------

export interface DatabaseInfoItem {
  Id: number;
  DatabaseServerId: number;
  DatabaseName: string;
  Description: string | null;
  CrystalPmId: number;
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
