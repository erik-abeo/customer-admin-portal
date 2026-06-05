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
  RootUserPassword: string;
  Certificate: string | null;
}

export interface CreateDatabaseServerInfoRequest {
  Name: string;
  Description: string | null;
  LocalServerAddress: string;
  RemoteServerAddress: string | null;
  ServerPort: number;
  RootUserPassword: string;
  Certificate: string | null;
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
