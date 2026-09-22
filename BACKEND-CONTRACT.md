# Backend Contract

This document is the single source of truth for the API surface the
Customer Admin Portal expects from the **`ClientRemoteDatabaseAccessAPI`**
ASP.NET service. It covers:

1. The **endpoints that already exist** and the shapes the SPA depends on
   (so any change there triggers a coordinated UI update).
2. The **endpoints that are still pending** — the SPA already ships UI for
   these, gated behind feature flags. The "Pending" sections below are
   meant to be implemented exactly as specified so the UI lights up
   without further frontend changes.

All requests / responses use `application/json` with default
`System.Text.Json` serialization (PascalCase property names).

Authentication: every endpoint accepts the static `api-key` request
header (interim mechanism, validated server-side against
`appsettings.json → api-key`). When you adopt service-to-service tokens,
swap the SPA's `StaticApiKeyAuthStrategy` (`src/api/httpClient.ts`) for a
new strategy — no other UI code needs to change.

Optional response header `X-Admin-Role`: when present, the SPA reads the
caller's role from this header and gates write actions in the UI. Allowed
values are `admin` (full write access) and `viewer` / `readonly`
(read-only). The header is consumed by `src/api/httpClient.ts →
captureRoleHeader`. If the header is absent, the SPA falls back to the
default role configured by `VITE_FEATURE_RBAC`.

---

## 1. Existing endpoints (do not break)

The contract for each is the corresponding TypeScript DTO in
[`src/api/types.ts`](./src/api/types.ts). Below are URL → DTO crosswalks.

| Method | URL                                              | Request DTO                       | Response DTO                          |
| ------ | ------------------------------------------------ | --------------------------------- | ------------------------------------- |
| POST   | `/My/create-database-server-info`                | `CreateDatabaseServerInfoRequest` | `CreateDatabaseServerInfoResponse`    |
| PUT    | `/My/update-database-server-info`                | `UpdateDatabaseServerInfoRequest` | `UpdateDatabaseServerInfoResponse`    |
| GET    | `/My/get-database-server-info/{id}`              | —                                 | `GetDatabaseServerInfoResponse`       |
| GET    | `/My/get-all-database-server-info`               | —                                 | `GetAllDatabaseServerInfoResponse`    |
| POST   | `/My/create-database-info`                       | `CreateDatabaseInfoRequest`       | `CreateDatabaseInfoResponse`          |
| PUT    | `/My/update-database-info`                       | `UpdateDatabaseInfoRequest`       | `UpdateDatabaseInfoResponse`          |
| GET    | `/My/get-database-info/{id}`                     | —                                 | `GetDatabaseInfoResponse`             |
| GET    | `/My/get-all-database-info`                      | —                                 | `GetAllDatabaseInfoResponse`          |
| POST   | `/My/create-user`                                | `CreateUserRequest`               | `{ Success, Message, UserId }`        |
| PUT    | `/My/update-user`                                | `UpdateUserRequest`               | `{ Success, Message }`                |
| DELETE | `/My/delete-user/{userId}`                       | —                                 | `{ Success, Message }`                |
| GET    | `/My/get-user/{userId}`                          | —                                 | `GetAuthorizedUserResponse`           |
| GET    | `/My/get-users`                                  | —                                 | `GetAuthorizedUsersResponse`          |
| GET    | `/My/get-users/{databaseServerId}/{databaseId}`  | —                                 | `GetAuthorizedUsersResponse`          |
| POST   | `/My/create-static-database-user`                | `CreateStaticDatabaseUserRequest` | `CreateStaticDatabaseUserResponse`    |
| PUT    | `/My/update-static-database-user`                | `UpdateStaticDatabaseUserRequest` | `UpdateStaticDatabaseUserResponse`    |
| GET    | `/My/get-static-database-user/{id}`              | —                                 | `GetStaticDatabaseUserDetailResponse` |
| GET    | `/My/get-all-static-database-users`              | —                                 | `GetStaticDatabaseUserResponse[]`     |
| GET    | `/My/get-static-database-users-by-server/{id}`   | —                                 | `GetStaticDatabaseUserResponse[]`     |
| GET    | `/My/get-static-database-users-by-database/{id}` | —                                 | `GetStaticDatabaseUserResponse[]`     |
| POST   | `/My/probe-database-server`                      | `ProbeDatabaseServerRequest`      | `ProbeDatabaseServerResponse`         |

### 1.1 Database server probe

`POST /My/probe-database-server` connects to a candidate server and reports what
it is, without saving anything. It is read-only and safe to call repeatedly, so
the UI can run it on demand while an operator is still editing the form.

The system supports both MySQL and MariaDB on AWS RDS and **detects which one a
server is rather than being told**, so there is no engine field for the operator
to fill in and no engine dropdown to build. Engine identity comes from the
server itself; the version banner is only used for the version number.

```jsonc
// ProbeDatabaseServerRequest
{
  "Host": "customer-a.abc123.us-east-1.rds.amazonaws.com",
  "Port": "3306",              // optional, defaults to 3306
  "User": "cpmadmin",
  "Password": "…",             // never persisted by the probe
  "SslMode": "Required",       // optional, defaults to Required
  "CertificatePem": null,      // optional, for VerifyCA / VerifyFull
}

// ProbeDatabaseServerResponse
{
  "Success": true,             // the probe ran; NOT that the server is usable
  "Message": "MySql 8.4.3 is supported and this login can provision.",
  "Engine": "MySql",           // "MySql" | "MariaDb" | "Unknown"
  "EngineVersion": "8.4.3",
  "RawVersion": "8.4.3",       // unmodified VERSION(), for diagnostics
  "MeetsMinimumVersion": true, // floor: MySQL 8.0, MariaDB 10.6
  "TlsInUse": true,            // TLS actually negotiated, not merely requested
  "CanCreateDatabase": true,
  "CanCreateUser": true,
  "IsSupported": true,         // gate registration on THIS, not on Success
  "Checks": [
    { "Name": "connect", "Passed": true, "Detail": "Connected to …:3306." },
    { "Name": "engine", "Passed": true, "Detail": "Detected MySql from the server itself." },
    { "Name": "version", "Passed": true, "Detail": "MySql 8.4.3 meets the 8.0 minimum." },
    { "Name": "tls", "Passed": true, "Detail": "TLS negotiated (TLS_AES_256_GCM_SHA384)." },
    { "Name": "privileges.create-database", "Passed": true, "Detail": "Login can create databases." },
    { "Name": "privileges.create-user", "Passed": true, "Detail": "Login can create users." },
    { "Name": "privileges.grant-option", "Passed": true, "Detail": "Login holds GRANT OPTION." },
  ],
}
```

`Success: false` means the probe could not run at all, typically an unreachable
host or a bad password, and `Checks` will hold a single failed `connect` entry.
An unreachable or unsuitable server is reported in the body, not as a non-2xx.

Render `Checks` in order as a checklist. A rejected server then says which gate
it failed rather than only that it was rejected.

### 1.2 Database servers carry an admin login, which is not always `root`

`database_server_info` records an **`AdminUserName`** per server, and it appears
on `CreateDatabaseServerInfoRequest`, `UpdateDatabaseServerInfoRequest`,
`DatabaseServerInfoItem` and `GetDatabaseServerInfoResponse`. It defaults to
`root` when omitted, so nothing that predates it changes behaviour.

It has to be settable. AWS RDS **reserves `root`** and will not create a master
user with that name, so an RDS server is administered under whatever master
username it was given. The service previously hardcoded `root`, which meant it
could not administer an RDS server at all.

The register-a-server form therefore needs an admin username field alongside the
password, defaulting to `root`, and the value it collects is what
`/My/probe-database-server` should be given as `User`.

> **Known drift:** the TypeScript `DatabaseServerInfoItem` in
> [`src/api/types.ts`](./src/api/types.ts) is missing both `AdminUserName` and
> `SecurityGroupId`, which the backend has returned for some time. Both need
> adding when the server form is next touched.

### 1.3 Database mappings must name the right server

`CreateUserRequest.DatabaseMappings` and `UpdateUserRequest.DatabaseMappings`
still carry `DatabaseServerId` alongside `DatabaseId`, and the backend no longer
stores it: a database's server is recorded on the database itself. The pair is
**validated rather than ignored**. If any mapping names a server the database is
not on, or a database that does not exist, the whole request is rejected with
**400** and a message naming every offending pair.

The SPA already derives `DatabaseServerId` from the selected database's own
record, so this should never fire in normal use. It exists so that a caller
holding a stale idea of where a customer lives finds out immediately instead of
silently creating a user who cannot reach their database.

### 1.4 Migration sessions

The streaming-migration flow. The portal mints a key for one customer's move and
shows it once; the operator pastes it into the MariaDB installer, which redeems
it for credentials scoped to that one schema and streams the database in.

| Method | URL | Request | Response |
| ------ | --- | ------- | -------- |
| POST | `/My/create-migration-session` | `CreateMigrationSessionRequest` | `CreateMigrationSessionResponse` |
| GET | `/My/get-migration-sessions` | — | `GetMigrationSessionsResponse` |
| GET | `/My/get-migration-session/{id}` | — | `GetMigrationSessionResponse` |
| POST | `/My/revoke-migration-session/{id}` | — | `{ Success, Message }` |

Three further endpoints exist for the installer and are **not for the portal**:
`redeem-migration-key`, `migration-session/heartbeat` and
`migration-session/complete`. They authenticate with the migration key and the
session token rather than the `api-key` header, because they are called from a
machine on an office network which has no business holding the admin key.

**Minting.** Supply exactly one of `DatabaseId` (an existing database) or
`DatabaseName` (one to provision). Both or neither is a 400: the two readings do
different things to a customer's data. An existing database must be on the named
server and must already belong to the named customer.

```jsonc
// CreateMigrationSessionRequest
{
  "DatabaseServerId": 3,
  "DatabaseId": null,            // XOR with DatabaseName
  "DatabaseName": "easyopti_1042",
  "CrystalPmId": 1042,
  "CreatedByAdmin": "erik.griffin",
  "ExpiresInMinutes": 120,       // optional; clamped to 5..1440, defaults 120
}

// CreateMigrationSessionResponse
{
  "Success": true,
  "SessionId": 17,
  "MigrationKey": "CPM-7K4D-9QX2-8M3T",   // SHOWN ONCE. Never retrievable again.
  "MigrationKeyPrefix": "7K4D",
  "ExpiresUtc": "2026-09-22T19:04:11Z",
  "TargetSummary": "Customer 1042 into 'easyopti_1042' on server 3.",
}
```

Two things the UI must get right:

**`MigrationKey` is shown once.** Only its hash is stored, so it cannot be read
back. Reuse the reveal-once pattern from `StaticUsersPage.tsx` with a copy
button, and do not let the modal close without the operator having had a chance
to copy it. Losing it means minting another and revoking this one.

**`TargetSummary` is the confirmation text.** It names the customer and
destination, and appends a warning when that customer already has a database on
a different server — legal, since `crystalpm_id` is unique per server rather
than globally, and also exactly what a customer being split across two servers
looks like. Show it in the confirm step, not after.

**Statuses**: `pending` → `redeemed` → `streaming` → `completed` | `failed`,
plus `expired` and `revoked`. `get-migration-sessions` sweeps expiries before
returning, so the list does not show dead keys as pending.

`get-migration-session/{id}` returns the session plus a `Progress` array
(`Phase`, `TableName`, `RowsDone`, `RowsTotal`, `BytesDone`, `Message`,
`IsError`, `UtcTimestamp`), oldest first. A migration that dies partway reports
where it got to; surface the last non-null `Phase` and `TableName` rather than
only that it failed.

**Revoking** is how a key minted for the wrong customer is undone. A session that
already finished returns `Success: false` with a message rather than being
rewritten.

The UI's behavior on common error codes:

| Status | UI behavior                                                                                 |
| ------ | ------------------------------------------------------------------------------------------- |
| 401    | Global handler clears credentials and routes the user back to `/login`.                     |
| 403    | Notification: "Forbidden — your account does not have access".                              |
| 404    | Page-level empty state where applicable; otherwise a contextual error toast.                |
| 409    | Notification with the body's `Message` when present.                                        |
| 5xx    | Notification: "Service error — please try again", with `Retry-After` honored where present. |

---

## 2. Pending endpoints

These are wired in the SPA today behind feature flags. Implementing them
without changing names / DTOs is enough to ship the corresponding UI.

### 2.1 Delete endpoints (gated by `VITE_FEATURE_DELETES`)

| Method | URL                                    | Notes                                                                                                                                                         | Response                           |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| DELETE | `/My/delete-database-server/{id}`      | Reject (HTTP 409) when any database still references the server. Body should describe the dependency.                                                         | `{ Success: bool, Message: str? }` |
| DELETE | `/My/delete-database/{id}`             | Reject (409) when any authorized user or static user is still mapped to the database.                                                                         | `{ Success: bool, Message: str? }` |
| DELETE | `/My/delete-static-database-user/{id}` | The SPA sends one DELETE per `(server, user)` row; backend may treat each as independent. Optionally also accept `?cascade=true` to drop all rows for a user. | `{ Success: bool, Message: str? }` |

The SPA's `useDelete*` mutations live in `src/features/*/queries.ts` and
already invalidate the relevant list queries on success.

### 2.3 Event log (gated by `VITE_FEATURE_EVENT_LOG`)

DTOs: see `EventLogEntry`, `EventLogQueryParams`, `EventLogQueryResponse`
in `src/api/types.ts`.

| Method | URL                        | Body / Params                                                                                                                                                                          | Response                |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| GET    | `/My/event-log`            | Query: `userEmail`, `ipAddress`, `databaseServerId`, `databaseId`, `fromUtc`, `toUtc`, `eventType`, `page` (1-based), `pageSize` (≤500).                                               | `EventLogQueryResponse` |
| GET    | `/My/event-log/export.csv` | Same query parameters as `/event-log`. Returns `text/csv; charset=utf-8` with header row: `Id,TimestampUtc,UserEmail,IpAddress,DatabaseServerId,DatabaseId,EventType,Message,Details`. | CSV blob                |

Notes:

- The SPA gracefully falls back to a client-side CSV export when the
  server-side `export.csv` endpoint returns 404, so backend can ship the
  query endpoint first and add export later.
- Sort order is descending by `TimestampUtc`; the UI does not currently
  expose a sort parameter.
- `TotalCount` is required for pagination; if the table is too large to
  count exactly, an upper-bound is acceptable as long as it monotonically
  reflects the filtered set.

### 2.4 Optional audit-sink endpoint (`VITE_FEATURE_AUDIT_SINK`)

The SPA can mirror its in-memory audit-log buffer to a backend endpoint
that you control. There is no required URL or shape from the API
service's perspective — `VITE_AUDIT_SINK_URL` points the SPA wherever
you want the entries to land. The body for each `POST` is a single
`AuditEntry`:

```jsonc
{
  "timestamp": "2026-04-21T18:43:02.123Z",
  "method": "POST",
  "path": "/My/create-database-server-info",
  "status": 200,
  "durationMs": 142,
  "adminName": "erik.griffin",
  "summary": "create database server",
  "requestId": "5b1f…",
}
```

Failures are silent (sink is best-effort and must never block the UI).
Authentication uses whichever auth strategy is currently installed on
the SPA's `httpClient`.

---

## 3. Versioning & change management

- Endpoints below `/My/` are considered v1 and stable. Breaking shape
  changes require a parallel `/v2/` route — the SPA will switch over in a
  coordinated release.
- Adding new optional fields to existing DTOs is non-breaking; the SPA's
  type definitions accept and ignore unknown properties.
- Renaming, removing, or changing the type of an existing field is
  breaking. Coordinate via this document and a release note in the
  associated PR.
