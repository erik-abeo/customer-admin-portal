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

### 2.2 Dumps (gated by `VITE_FEATURE_DUMPS`)

DTOs: see `DumpInfoItem`, `GetAllDumpsResponse`, `CreateDumpRequest`,
`CreateDumpResponse`, `UpdateDumpRequest`, `UpdateDumpResponse`,
`ImportDumpRequest`, `ImportDumpResponse` in `src/api/types.ts`.

| Method | URL                    | Body / Params                                                                                                                                                                                                                                       | Response               |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| GET    | `/My/get-all-dumps`    | Query: `?databaseServerId=<int>&databaseId=<int>` (both optional, AND-combined).                                                                                                                                                                    | `GetAllDumpsResponse`  |
| POST   | `/My/create-dump`      | `CreateDumpRequest` — registers an existing dump file already present on disk at `FilePath`.                                                                                                                                                        | `CreateDumpResponse`   |
| PUT    | `/My/update-dump`      | `UpdateDumpRequest` — partial; only patch fields supplied.                                                                                                                                                                                          | `UpdateDumpResponse`   |
| DELETE | `/My/delete-dump/{id}` | Should also delete the underlying file if owned by the service. Provide `?keepFile=true` to detach metadata only.                                                                                                                                   | `{ Success, Message }` |
| POST   | `/My/import-dump`      | `ImportDumpRequest` — runs the dump against the target database. When `Replace=true`, drop & recreate before import. `JobId` in the response should be a stable, opaque identifier for future status polling (`/My/dump-jobs/{JobId}` is reserved). | `ImportDumpResponse`   |
| POST   | `/My/upload-dump`      | `multipart/form-data` with fields `file` (required), `databaseServerId` (int, required), `databaseId` (int, required), `description` (string, optional). Server stores the file and creates the metadata row in one transaction.                    | `CreateDumpResponse`   |

Notes:

- `SizeBytes` may be `null` in `DumpInfoItem` when the file is missing or
  inaccessible — the UI renders "—" in that case.
- `CreatedDateTimeUtc` and `LastModifiedDateTimeUtc` are ISO-8601 UTC
  strings (e.g. `"2026-04-21T18:43:02Z"`).

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
