# Backend Contract

This document is the single source of truth for the API surface the
Customer Admin Portal expects from the **`ClientRemoteDatabaseAccessAPI`**
ASP.NET service. It covers:

1. The **endpoints that already exist** and the shapes the SPA depends on
   (so any change there triggers a coordinated UI update).
2. The **endpoints that are still pending**: the SPA already ships UI for
   these, gated behind feature flags. The "Pending" sections below are
   meant to be implemented exactly as specified so the UI lights up
   without further frontend changes.

All requests and responses use `application/json` with **PascalCase** property
names.

That is configured, not the default. `AddControllers()` on its own uses
`JsonSerializerDefaults.Web`, whose naming policy is camelCase, and the service
did exactly that until it was corrected: responses went out as
`{"success":...}` while every DTO here read `Success`. Nothing in the SPA
transforms casing, so the symptom was empty pages rather than an error. If
anyone ever removes the `AddJsonOptions` call in `Program.cs`, this document and
the SPA both become wrong at once and silently. Request binding is
case-insensitive, so callers sending camelCase bodies still work.

Authentication: every management endpoint the SPA calls accepts the static
`api-key` request header (interim mechanism, validated server-side against
the `api-key` setting in `appsettings.json`). The other endpoints on the same
`/My` routes authenticate differently and are not for the SPA: the CrystalPM
client's authorization calls (`AuthorizeClient`, `AuthorizeClient2`,
`KeepAliveDatabaseUser`, `KillDatabaseUser`) take a SuperTokens JWT, and the
installer's `redeem-migration-key` and `migration-session/*` take the
migration key or the session token. When you adopt service-to-service tokens,
swap the SPA's `StaticApiKeyAuthStrategy` (`src/api/httpClient.ts`) for a new
strategy; no other UI code needs to change.

Optional response header `X-Admin-Role`, **not sent by the service today** (it
has no roles; the api-key grants full admin): when present, the SPA reads the
caller's role from this header and gates write actions in the UI. Allowed
values are `admin` (full write access) and `viewer`, `readonly` or
`read-only` (read-only), in any case. The header is consumed by `captureRoleHeader` in
`src/api/httpClient.ts`. `VITE_FEATURE_RBAC` is a boolean switch, not a role:
when it is off, every caller is treated as `admin`; when it is on and no
header has been seen yet, the SPA treats the caller as `viewer` until one
arrives.

---

## 1. Existing endpoints (do not break)

The contract for each is the corresponding TypeScript DTO in
[`src/api/types.ts`](./src/api/types.ts). Below are URL-to-DTO crosswalks.

| Method | URL                                              | Request DTO                       | Response DTO                          |
| ------ | ------------------------------------------------ | --------------------------------- | ------------------------------------- |
| POST   | `/My/create-database-server-info`                | `CreateDatabaseServerInfoRequest` | `CreateDatabaseServerInfoResponse`    |
| PUT    | `/My/update-database-server-info`                | `UpdateDatabaseServerInfoRequest` | `UpdateDatabaseServerInfoResponse`    |
| GET    | `/My/get-database-server-info/{id}`              | -                                 | `GetDatabaseServerInfoResponse`       |
| GET    | `/My/get-all-database-server-info`               | -                                 | `GetAllDatabaseServerInfoResponse`    |
| POST   | `/My/create-database-info`                       | `CreateDatabaseInfoRequest`       | `CreateDatabaseInfoResponse`          |
| PUT    | `/My/update-database-info`                       | `UpdateDatabaseInfoRequest`       | `UpdateDatabaseInfoResponse`          |
| GET    | `/My/get-database-info/{id}`                     | -                                 | `GetDatabaseInfoResponse`             |
| GET    | `/My/get-all-database-info`                      | -                                 | `GetAllDatabaseInfoResponse`          |
| POST   | `/My/create-user`                                | `CreateUserRequest`               | plain string (see below)              |
| PUT    | `/My/update-user`                                | `UpdateUserRequest`               | plain string (see below)              |
| DELETE | `/My/delete-user/{userId}`                       | -                                 | plain string (see below)              |
| GET    | `/My/get-user/{userId}`                          | -                                 | `GetAuthorizedUserResponse`           |
| GET    | `/My/get-users`                                  | -                                 | `GetAuthorizedUsersResponse`          |
| GET    | `/My/get-users/{databaseServerId}/{databaseId}`  | -                                 | `GetAuthorizedUsersResponse`          |
| POST   | `/My/create-static-database-user`                | `CreateStaticDatabaseUserRequest` | `CreateStaticDatabaseUserResponse`    |
| PUT    | `/My/update-static-database-user`                | `UpdateStaticDatabaseUserRequest` | `UpdateStaticDatabaseUserResponse`    |
| GET    | `/My/get-static-database-user/{id}`              | -                                 | `GetStaticDatabaseUserDetailResponse` |
| GET    | `/My/get-all-static-database-users`              | -                                 | `GetStaticDatabaseUserResponse[]`     |
| GET    | `/My/get-static-database-users-by-server/{id}`   | -                                 | `GetStaticDatabaseUserResponse[]`     |
| GET    | `/My/get-static-database-users-by-database/{id}` | -                                 | `GetStaticDatabaseUserResponse[]`     |
| POST   | `/My/probe-database-server`                      | `ProbeDatabaseServerRequest`      | `ProbeDatabaseServerResponse`         |

`create-user`, `update-user` and `delete-user` answer with a plain string on
success ("User created successfully" and so on) and a plain string or a
SuperTokens error object on a 400, not a `{ Success, Message }` object.
`update-user` and `delete-user` also answer **404** "User not found in the custom
database." for an unknown user, and all three answer **500** "Internal server
error" on an unexpected failure. The SPA does not read the success body;
failures surface through the HTTP status, and the error interceptor shows a
string body as the message.

**Known issue, pending confirmation of what is deployed: the user endpoints do
not work against the repository's SuperTokens backend.** `SupertokensService`
calls six routes on the backend at `Supertokens:ApiUrl`: `create-user`,
`update-user`, `delete-user`, `user-by-id`, `user-by-email` and `users`. It
sends no session and no `Authorization` header. The backend in this repository
(`remote-database-system/GatewayServer/SupertokensFrontendAndBackend/backend/userRoutes.ts`)
puts all six behind `verifySession()`, so against it every call answers 401 and
`HandleResponse` throws. Then:

- **Reads fail.** `get-users`, `get-users/{server}/{db}` and `get-user` catch
  the failure and answer 200 with `Success: false`, so the portal's Authorized
  users page shows an error rather than the list.
- **Writes fail and change nothing.** `create-user`, `update-user` and
  `delete-user` answer 500 "Internal server error", with nothing changed in
  SuperTokens or locally.
- **If the deployed backend accepts the calls** (no `verifySession()`, or a
  session the service does send), a second problem follows for update and
  delete. The backend answers them with 200 `{"message": ...}` and no `status`
  field, and `UserManagementController` treats any answer whose `Status` is not
  `OK` as a refusal. It then returns 400 after SuperTokens has already applied
  the change, and skips its own step: an update's local record (static host,
  mappings, concurrent sessions) is not written, and a delete's local record is
  not removed. Create is not affected by this part: `create-user` returns the
  SuperTokens sign-up response, which does carry `status`.

Nothing in the test suites exercises this. The live suite points the service's
`Supertokens:ApiUrl` at `http://127.0.0.1:9`, where nothing listens, and does
not use the Authorized users page. Both problems predate this branch. The
portal's behaviour is unchanged: it shows these failures as failures. After a
400 that is misleading, since the email, password or SuperTokens user has
already changed or gone.

### 1.1 Database server probe

`POST /My/probe-database-server` connects to a candidate server and reports what
it is, without saving anything. It is read-only and safe to call repeatedly, so
the UI can run it on demand while an operator is still editing the form.

The system supports both MySQL and MariaDB on AWS RDS and **detects which one a
server is rather than being told**, so there is no engine field for the operator
to fill in and no engine dropdown to build. Engine identity comes from the
server itself: it is MariaDB when the Aria storage engine is present **or** the
version banner names MariaDB, and MySQL otherwise. The version number is parsed
from the banner, with MariaDB's `5.5.5-` compatibility prefix stripped first.

```jsonc
// ProbeDatabaseServerRequest
{
  "Host": "customer-a.abc123.us-east-1.rds.amazonaws.com",
  "Port": "3306",              // optional, defaults to 3306
  "User": "cpmadmin",
  "Password": "...",           // never persisted by the probe
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
  "CanGrant": true,            // holds GRANT OPTION; required
  "CanSeeConnections": true,   // holds PROCESS; required
  "IsSupported": true,         // gate registration on THIS, not on Success
  "Checks": [
    { "Name": "connect", "Passed": true, "Detail": "Connected to ...:3306." },
    { "Name": "engine", "Passed": true, "Detail": "Detected MySql from the server itself." },
    { "Name": "version", "Passed": true, "Detail": "MySql 8.4.3 meets the 8.0 minimum." },
    { "Name": "tls", "Passed": true, "Detail": "TLS negotiated (TLS_AES_256_GCM_SHA384)." },
    { "Name": "privileges.create-database", "Passed": true, "Detail": "Login can create databases." },
    { "Name": "privileges.create-user", "Passed": true, "Detail": "Login can create users." },
    { "Name": "privileges.grant-option", "Passed": true, "Detail": "Login holds GRANT OPTION." },
    { "Name": "privileges.process", "Passed": true, "Detail": "Login can see other logins' connections." },
  ],
}
```

`IsSupported` requires every privilege and version gate, and an identified
engine; `TlsInUse` is reported but is not one of them. `CanGrant` is a gate:
without `GRANT OPTION`
the service cannot give a migration login access to the schema it provisions,
so a server whose login lacks it is refused at registration rather than at the
first redemption. `CanSeeConnections` is a gate too: without `PROCESS` the login
sees only its own connections in the process list, so revoking a migration,
ending a CrystalPM session and draining a move would all report success having
done nothing. Its check is `privileges.process`, and a rejection names it in
`Message` ("the login cannot see other logins' connections (PROCESS)").

`Success: false` means the probe did not finish, typically an unreachable host
or a bad password. `Checks` then holds whatever ran before the failure, ending
with a failed `connect` entry whose `Detail` is the error: on its own when the
connection itself failed, after a passed `connect` and any later checks when
something failed once connected.
An unreachable or unsuitable server is reported in the body, not as a non-2xx.

Render `Checks` in order as a checklist. A rejected server then says which gate
it failed rather than only that it was rejected.

The portal will not submit a new server until a probe of exactly the address,
port, login, password and certificate being registered has returned
`IsSupported: true`. Changing any of them clears the result. An edit that
changes any of those five from what is stored is held to the same probe, but
the operator may save it without a passing one by ticking "Save without a
passing probe". There are legitimate edits a probe fails, such as a new CA
staged before the server's certificate is rotated to it. The acknowledgement
belongs to the connection it was given for, so changing a connection field again
withdraws it. A new server has no such option. An edit that changes only the
name, description or security group is not gated. The service does not probe
again on create or update, so all of this is the portal's rule rather than the
API's.

On edit, a blank password or certificate field means "keep the stored one", and
the probe uses the stored value in its place. That works because
`get-database-server-info/{id}` and `get-all-database-server-info` return the
**decrypted** `RootUserPassword` and `Certificate`, which predates this branch.
The portal keeps them out of its cache: the server list and every server read
other than the edit form's are stripped of both before they are cached (only a
`HasCertificate` flag is kept). Only the edit form reads the decrypted values,
through its own query with `gcTime` 0, so they are dropped as soon as the form
closes; the mutations that carry a password are reset on close too. The password
is never displayed, and the cache is cleared on sign-out.

The probe is sent with `SslMode` `VerifyCA` whenever a certificate is present,
since that is what the installer is handed at redemption, and `Required`
otherwise. The service honours both, writing the certificate to a temporary CA
file for the length of the probe.

### 1.2 Database servers carry an admin login, which is not always `root`

On update, the service skips any string field that is null, empty or
whitespace, so those fields cannot be cleared through the API: `Name`,
`Description`, `LocalServerAddress`, `RemoteServerAddress`, `RootUserPassword`,
`Certificate` and `AdminUserName`. `SecurityGroupId` is the exception: null
leaves it alone and an empty string clears it, so the portal sends `""` when the
field is emptied. `UpdateDatabaseServerInfoResponse.Success` can be false on a
200, and the portal checks it before reporting success.

On create, blank optional fields (`Description`, `RemoteServerAddress`,
`SecurityGroupId`) are stored as NULL, so "not set" has one meaning for
everything that reads them. The portal sends null for them already.

`RemoteServerAddress` is optional. When it is blank, the address handed to
clients falls back to `LocalServerAddress`: in the CrystalPM client's
authorization response, in a new static user's connection details, and in the
credentials a migration key redeems for. Leave it blank only when clients reach
the server on its local address.

`database_server_info` records an **`AdminUserName`** per server, and it appears
on `CreateDatabaseServerInfoRequest`, `UpdateDatabaseServerInfoRequest`,
`DatabaseServerInfoItem` and `GetDatabaseServerInfoResponse`. It defaults to
`root` when omitted, so nothing that predates it changes behaviour.

`DatabaseServerInfoItem` and `GetDatabaseServerInfoResponse` also carry the
server's **`Status`** (`available` when the column has none). Only an
`available` server takes new customers; see the migration and move refusals
below.

It has to be settable. AWS RDS **reserves `root`** and will not create a master
user with that name, so an RDS server is administered under whatever master
username it was given. The service previously hardcoded `root`, which meant it
could not administer an RDS server at all.

The register-a-server form therefore needs an admin username field alongside the
password, defaulting to `root`, and the value it collects is what
`/My/probe-database-server` should be given as `User`.

`Certificate` is **required** on `CreateDatabaseServerInfoRequest`: the service
verifies the server against it and hands it to the installer with a migration
key's credentials. On update it is optional, and blank keeps the stored one.

### 1.3 Database mappings must name the right server

`CreateUserRequest.DatabaseMappings` and `UpdateUserRequest.DatabaseMappings`
still carry `DatabaseServerId` alongside `DatabaseId`, and the backend no longer
stores it: a database's server is recorded on the database itself. The pair is
**validated rather than ignored**. If any mapping names a server the database is
not on, or a database that does not exist, the whole request is rejected with
**400** and a message naming every offending pair (`databaseId=N with
databaseServerId=M`). The check runs before SuperTokens is touched, on create
and on update alike, so a refused request changes nothing: no identity is
created, and no email or password is changed.

The SPA already derives `DatabaseServerId` from the selected database's own
record, so this should never fire in normal use. It exists so that a caller
holding a stale idea of where a customer lives finds out immediately instead of
silently creating a user who cannot reach their database.

### 1.4 Databases carry a status

`DatabaseInfoItem` has a **`Status`**: `active`, `moving`, `suspended` or
`retired`. It is returned by `get-all-database-info` and
`get-database-info/{id}`, and is set by the service rather than by
`create-database-info` or `update-database-info`. `moving` is set by the
service when a customer move starts draining the database, not when it is
planned: a planned move leaves the database `active` until the executor picks
it up. No endpoint sets `suspended`
or `retired`: both are set by hand in `database_info.status`, `suspended` by an
operator and `retired` once a database is out of service.

What each status means to the CrystalPM client, which authorizes through
`AuthorizeClient` and `AuthorizeClient2` (the portal calls neither):

- `moving` answers **503** "Your database is temporarily unavailable. Please try
  again shortly." with `Retry-After: 15`. The client waits it out, reusing its
  access token. A moving database is still offered in the selection list, so a
  user with several databases is asked which one they want rather than being
  sent to another; picking the moving one then gets the 503.
- `suspended` and `retired` answer **403** "This database is not available.
  Please contact CrystalPM support." with no `Retry-After`: the credentials are
  fine, and neither signing in again nor waiting will help. Both are left out of
  the selection list, and if only suspended or retired databases remain for a
  user, the first call answers the 403.

`AuthorizeClient2`, the call after a database is picked, resolves the server
from the chosen database's own registration, not from the `databaseServerId`
the client sends. A database the user is not mapped to, or that does not exist,
answers 401 "You are not authorized for the selected database.", one answer for
all three so a caller cannot map out which ids exist. `KeepAliveDatabaseUser` on
a session that has already ended is refused with 500 "Failed to authorize"
rather than quietly succeeding.

Suspending or retiring a database does not revoke static users' existing
grants on it; it only stops new grants, which are refused for any database that
is not `active`. Revoke them by editing the static user if they should stop
too.

Only an `active` database can be migrated into or moved. The service refuses the
rest, with a `Message` naming the status. The UI shows the status wherever a
database is listed, and offers the others in the migration and move pickers
disabled, with the reason, so an operator sees why before submitting. The
migration picker also disables a database belonging to a customer other than
the one entered, and the move picker one whose earlier move has cut over and
not been settled or rolled back. The
refusal stays the backstop for a status that changed after the list was loaded.

**Updating a database** (`update-database-info`) skips blank strings, as the
server update does, so `Description` cannot be cleared through it. A change of
`DatabaseServerId` or `DatabaseName` is written only when it is no change, or
when nothing is tied to where the database is now. The check is part of the
same `UPDATE`, so a move cutting over at that moment cannot slip past it. A
refusal is **200** with `Success: false`, nothing saved, and one `Message`,
the first that applies in this order:

1. The database is not `active`, or a move of it can still roll back or drop
   its source (planned through flipped, or settled with the source drop
   unfinished):

   > This database's server or name cannot be changed while it is not active or
   > while a move of it can still be rolled back or drop its source. Nothing was
   > saved; reload it and try again.

2. Static users hold privileges on it, and their grants are on its current
   server:

   > This database's server or name cannot be changed while static users hold
   > privileges on it, because their grants are on its current server. Remove
   > those static user grants first, then try again. Nothing was saved.

3. A migration is streaming into it (a session `redeemed` or `streaming`):

   > This database's server or name cannot be changed while a migration is
   > streaming into it, because the installer is writing to its current server.
   > Wait for the migration to finish, or revoke it, then try again. Nothing was
   > saved.

4. CrystalPM sessions are open on it:

   > This database's server or name cannot be changed while CrystalPM sessions
   > are open on it, because they are writing to its current server. Wait for
   > them to end: a session ends when CrystalPM closes, or by itself within an
   > hour of starting if the client stopped without closing. Nothing was saved.

The portal shows whichever `Message` comes back rather than matching its text.
Demo mode mirrors the first three; it has no CrystalPM sessions to refuse on.

An edit that changes only the description or customer id is still written in
any status, including while the database is moving. The portal locks the server
and name fields of a database that is not active, re-reads the database before
saving and refuses if its server or name changed since the form was opened, and
shows the service's `Message` for any refusal.

### 1.4a Static user updates

`update-static-database-user` takes one row's `Id` and the `UserName`, which
must match, plus a `Servers` list with the full privilege grid for each server.
Two refusals reject the whole request with **400** and a plain string, before
anything changes: a missing `Id`, `UserName` or `Servers` ("Invalid request.
Id, UserName, and Server information are required."), and an `Id` and
`UserName` that do not name the same row ("Invalid user Id or UserName.").
A static user has one row per server, all sharing the name, and the update
applies to all of them: current privileges are loaded by user name across every
server, keyed by `(database_server_id, user_name)`, and on each server in the
request the grid replaces what the user held there. A database left out of a
server's grid is revoked on that server; a server whose grid is empty loses all
its grants. The wire format is unchanged.

**Every requested database is checked before anything changes**, on create
and on update. A database is refused when it does not exist ("Database ID N does
not exist."), is not on the server it is listed under ("'name' is not on server
N. Re-pick it under the server it is on."), is not `active` ("'name' is status,
so static users cannot be granted it until it is active again."), has an
unsettled move, flipped included ("'name' has a customer move that is still in
progress or can still be rolled back. Let it finish or cancel it, or once it has
cut over, settle it by dropping the source or roll it back, then try again."),
since a grant made on a cut-over target would be left there by a rollback, or
has no
grantable privilege ticked ("No privilege is selected for 'name'. Select at
least one, or remove the database."). If any is refused, the whole request is:
the answer is 200 with `Message` `Refused` and `Servers` listing only the
refused databases, each with its error, and nothing is created, granted or
revoked. A refused create has an empty `UserName`. The portal checks the
no-privilege and not-active cases itself before sending.

`Message` on create and update is therefore one of three values:

- `Success`: everything applied. Only this value means that; not `OK`.
- `Refused`: the up-front checks failed and nothing was created or changed.
  The portal says "Nothing was created" or "Nothing was changed", lists the
  refused databases, keeps the form open and shows no password.
- `Failure`: the request went ahead and part of it failed; the per-server and
  per-database `Errors` say which. The portal treats any value other than
  `Success` and `Refused` as partial, so an older service's `Failure` for a
  refusal is still reported as a failure.

`GrantPrivilege` is unused. It stays on the wire for compatibility, but the
service never grants `WITH GRANT OPTION`, always stores it as false and always
returns it as false, so a database with only GRANT ticked has no privilege. The
portal does not offer it and always sends false.

A server in the request that the user is not on is reported as a failure in
that server's `Errors`. `NewDescription` is skipped when blank, so a description
cannot be cleared.

### 1.5 Server capacity and placement

| Method | URL                                            | Response                           |
| ------ | ---------------------------------------------- | ---------------------------------- |
| GET    | `/My/get-fleet-capacity`                       | `GetFleetCapacityResponse`         |
| GET    | `/My/get-server-capacity/{id}`                 | `GetServerCapacityResponse`        |
| GET    | `/My/get-server-capacity-history/{id}?days=90` | `GetServerCapacityHistoryResponse` |

Measured live on each call rather than served from a cache. Three sources: the
authorization database for who is registered where, the server's own
`information_schema` for what is actually on disk, and `event_log` for how much
anybody is using it.

`Verdict` is `Headroom`, `NearCapacity`, `Full` or `Unreachable`, and
**`VerdictReasons` is always populated, including for `Headroom`**. Render them.
A verdict on its own is a number somebody has to take on faith, and an operator
choosing where a customer's records live should not be taking anything on faith.

Two things the UI must not flatten:

**`Unreachable` is a result, not an error.** One server nobody can reach must
not stop the rest of the fleet being shown, and it is itself worth knowing: a
server that cannot be queried is not one to place a customer on. It ranks
_below_ `Full`, because a full server is a known quantity with no room while an
unreachable one has unknown contents.

**`IsOrphaned` on a database means it is registered here but absent from the
server.** That is a customer the system believes it can reach and cannot. Show
it; rendering zero bytes instead makes it look merely empty.

`MaxCustomerDatabases` may be null, meaning no stated limit. That is not the
same as unlimited room, and a server without one should not win a comparison
against a server that has thought about its limits.

A background collector writes these into `server_metrics_snapshot` hourly and
keeps 400 days. `get-server-capacity-history` serves the server-level rows:
`days` is clamped to 1..400 and defaults to 90, and the response carries the
window actually used as `Days` plus `Points`, oldest first. Each point has
`UtcTimestamp`, `CustomerDatabaseCount`, `AuthorizedUserCount`, `DataBytes`,
`IndexBytes`, `ApproxRowCount` and `DatabaseConnections`, every figure nullable.
An unreachable server is not recorded, so a gap in the points is a real gap and
must not be drawn as zero. Unlike the calls above it reads stored rows rather
than measuring, so it is cheap. An id that is not a server answers **404** with
`Success: false` and a `Message`, as `get-server-capacity/{id}` does; a server
that exists but has no snapshots in the window answers 200 with an empty
`Points`.

### 1.6 Customer moves

Moving a customer's database from one server to another.

| Method | URL                                  | Request                     | Response                   |
| ------ | ------------------------------------ | --------------------------- | -------------------------- |
| POST   | `/My/create-customer-move`           | `CreateCustomerMoveRequest` | `CustomerMoveResult`       |
| GET    | `/My/get-customer-moves`             | -                           | `GetCustomerMovesResponse` |
| GET    | `/My/get-customer-move/{id}`         | -                           | `GetCustomerMoveResponse`  |
| POST   | `/My/cancel-customer-move/{id}`      | -                           | `CustomerMoveResult`       |
| POST   | `/My/roll-back-customer-move/{id}`   | -                           | `CustomerMoveResult`       |
| POST   | `/My/drop-customer-move-source/{id}` | -                           | `CustomerMoveResult`       |

These record intent. The work runs in a background executor, so the portal plans
a move and then watches it: `planned` to `draining` to `copying` to `verifying`
to `flipped`, plus `failed`, `cancelled` and `rolled_back`, and `settled` once
the source is dropped. `CreateCustomerMoveRequest` is `DatabaseId`,
`TargetDatabaseServerId`, `TargetDatabaseName` (null keeps the source's name)
and `RequestedByAdmin`; there is no disconnect option.

The target schema is created with the source schema's default character set and
collation, read from `information_schema.SCHEMATA`, rather than the target
server's default. Each table's DDL carries its own collation across, but the
schema default decides what a table created after cutover gets, and a mismatch
would make CrystalPM's first new table refuse to join with the copied ones.

**The customer cannot start new sessions from `draining` until the move
finishes, and is offline outright during `copying` and `verifying`.** Planning
only records the move. Within moments the executor reserves the target name and
starts draining, which is when the database is marked `moving`; draining then
waits for open sessions to end on their own. Until then a planned move's
database still reads `active`, so the portal's pickers check the moves
themselves, not only the status. Surface that in the list, not only in a
detail view. A move in `copying` means a practice cannot open CrystalPM, and
whoever is looking at the page should not have to click to find that out.

**Cancelling** is for `planned` and `draining` only, the way out of a drain that
never finishes. It puts the database back to `active` and releases the reserved
target name. Any later status answers `Success: false` with the reason: a move
that is copying or verifying either cuts over or fails by itself, and either way
the customer is put back online.

Two cancel outcomes need work by hand, and say so. If the empty target it
reserved cannot be dropped, the cancel still succeeds, and the message ends
"...could not be removed and needs dropping by hand." (nothing retries it, and
the name stays taken on the target until then). If putting the database back to
`active` fails, the answer is `Success: false`: "The move was cancelled, but the
customer could not be put back online. Set the database's status back to active
by hand." The portal shows both as a warning that stays until dismissed.

Rolling back also answers 200 with `Success: false`, nothing changed, when:

- static users hold privileges on the database: "This move cannot be rolled
  back while static users hold privileges on the database, because their grants
  are on the target server and would be left behind. Remove those static user
  grants first, then try again. Nothing was changed."
- a migration is streaming into it: "This move cannot be rolled back while a
  migration is streaming into the database, because it is writing to the target
  server and those rows would be left behind. Wait for it to finish, or revoke
  it, then try again. Nothing was changed."

The portal shows whichever `Message` comes back. Its migration picker and the
static user editor treat a database with an unsettled move as unavailable, with
that reason, and demo mode refuses all of the above in the service's words.

`flipped` means cut over **with the source retained**. Rolling back is a single
row update while that is true, which is why dropping the source is a separate
action and the only irreversible one. Offer `roll-back` only for `flipped` with
`SourceDroppedDateTimeUtc` null and `SourceDatabaseName` recorded; the service
refuses a move with no recorded source name.

`drop-source` is offered for the same `flipped` moves, and also for a `settled`
move with `SourceDroppedDateTimeUtc` still null. The service claims a move by
settling it before it drops the source, so a drop interrupted after that claim,
by a crash or a restart, leaves the move settled with no drop recorded. Calling
`drop-source` again finishes it; the portal labels that "Finish dropping
source".

`drop-source` answers 404 for an unknown move, 200 with `Success: true` and
"The source has already been dropped." for a second call, and 200 with
`Success: false`, nothing changed, when:

- another request is dropping the same source at that moment ("Refresh in a
  moment.");
- the move is not `flipped` or unfinished `settled` ("Only a move that cut over
  cleanly has a source to retire.");
- no source name was recorded, so it cannot be dropped safely;
- the move changed while the request was checking it ("Refresh and try
  again.");
- the source is in use: a database is registered under that name on the source
  server, or another unsettled move is moving a customer into it ("'name' was
  not dropped: ... Nothing was changed."). A settled move cannot be rolled back, so there is nothing left to
  protect by keeping the source. Rolling back points the
  customer at the source as it was at cutover: anything written on the target
  since then stays on the target and is not carried back, and the UI should say
  so before the operator confirms.

`Verification` on the detail response is per table and carries
`VerificationMethod`, either `checksum` or `row_count`, recorded per table:
`checksum` only where the checksums were actually compared. **These are not
equivalent** and the UI should say which one each table got: matching row
counts say nothing about the values in them. A mismatch fails the move before
anything cuts over, and the customer is put back on the source.

**Moves between engines are refused.** MySQL to MariaDB, or the reverse, is a
schema conversion, which is what a migration key and the installer are for. The
executor checks both servers before it quiesces anyone and fails the move with
the customer still online. `row_count` is still recorded in two cases: for any
table whose row counts already differ, since checksums are skipped then and the
table fails on the count, and between different engines, which is only reachable
if a server is replaced under a move already in flight.

`create-customer-move` answers 400 with a `Message` for:

- a database that does not exist;
- a target server that does not exist, or is not marked `available`;
- a database that is not `active`, for example suspended or already moving;
- a database that static database users hold privileges on, since moves do not
  carry static users yet;
- a migration that is still streaming into the database (`redeemed` or
  `streaming`), since quiescing does not stop the installer's login;
- a database that already has a move in flight, one that has cut over and not
  been settled or rolled back, or one whose source drop never finished. The check
  is per database, not per customer: the message says "customer", but a customer
  with a second database on another server can move that one;
- a target server the customer is already on;
- a target database name that is already registered on the target server, for
  any customer;
- a customer that already has a registration on the target server, since the
  flip would collide with it;
- a target name that is not a usable identifier (letters, digits and
  underscores, starting with a letter);
- a database with no recorded name, so there is nothing to copy from. With no
  `TargetDatabaseName` the target name falls back to that missing source name,
  and the identifier check runs first, so the message is then the "is not a
  usable database name" one.

It answers 409 when another move for the same database was planned at the same
moment and won; refresh to see it. The message says "customer", but the guard is
per database, the same as the in-flight check.

Planning then checks the live target as well, and fails the move without
quiescing anyone if a schema of that name already exists there, registered or
not. The copy replaces tables by name, so a schema it did not make is never its
to fill. Once the checks pass it creates the target schema empty, which is the
reservation, before anyone is quiesced. The flip is conditional on the
database's registration still naming the source, so a move whose customer was
repointed by hand while it ran fails rather than overwriting that change.

`SourceDatabaseName` is recorded when the move is planned and does not change.
Before, it was read through `database_info`, which the flip rewrites, so after a
flip it reported the target's name; rollback and drop-source now use the
recorded name.

### 1.7 Migration sessions

The streaming-migration flow. The portal mints a key for one customer's move and
shows it once; the operator pastes it into the MariaDB installer, which redeems
it for credentials scoped to that one schema and streams the database in.

| Method | URL                                 | Request                         | Response                         |
| ------ | ----------------------------------- | ------------------------------- | -------------------------------- |
| POST   | `/My/create-migration-session`      | `CreateMigrationSessionRequest` | `CreateMigrationSessionResponse` |
| GET    | `/My/get-migration-sessions`        | -                               | `GetMigrationSessionsResponse`   |
| GET    | `/My/get-migration-session/{id}`    | -                               | `GetMigrationSessionResponse`    |
| POST   | `/My/revoke-migration-session/{id}` | -                               | `{ Success, Message }`           |
| POST   | `/My/discard-migration-target/{id}` | -                               | `{ Success, Message }`           |

Three further endpoints exist for the installer and are **not for the portal**:
`redeem-migration-key`, `migration-session/heartbeat` and
`migration-session/complete`. They authenticate with the migration key and the
session token rather than the `api-key` header, because they are called from a
machine on an office network which has no business holding the admin key.

**Minting.** Supply exactly one of `DatabaseId` (an existing database) or
`DatabaseName` (one to provision). Both or neither is a 400: the two readings do
different things to a customer's data. An existing database must be on the named
server and must already belong to the named customer.

A `DatabaseServerId` that does not exist is a 400 ("Database server N does not
exist."). A name to provision is refused with a 400 when the server's recorded
status is anything but `available`, the same rule capacity applies to new
customers. A key against an existing database on such a server is still
allowed, since it is a retry for a customer already there. The status comes
with the server list (`DatabaseServerInfoItem.Status`), and the portal reads it
from there to disable those servers in its pickers, with the reason, for a key
that provisions and for a move's target.

A missing body, a `DatabaseServerId` below 1 ("A database server must be
selected.") and a `CrystalPmId` below 1 ("A CrystalPM customer id is required.")
are 400s, and so is a name to provision that is not a usable identifier ("'name'
is not a usable database name. Use letters, digits and underscores, starting
with a letter.").

A name to provision is also a 400 when this customer already has any database on
that server (select it as the existing database instead), when the name is
already registered on that server, and when any unfinished move (`planned`,
`draining`, `copying` or `verifying`) targets a database of that name there;
once such a move has flipped, its target is registered and the previous check
catches it. Provisioning only ever creates: it never adopts a
database that already exists, because a failed migration's target may later be
discarded, and that is only safe for one the migration made. Every CrystalPM
source database has the same name, so the default is taken on any server that
already has a customer: propose something unique, such as the name plus the
CrystalPM id.

An existing database is also a 400 when it is not `active`, has an unsettled
customer move (in progress, cut over and still able to roll back, or settled
with its source drop unfinished: "The selected database has a customer move
that is still in progress or can still be rolled back. Let it finish or cancel
it, or once it has cut over, settle it by dropping the source or roll it back,
then try again."), or already has a live migration key: another session on it
that is `redeemed`, `streaming`, or `pending` and not yet expired ("The selected
database already has a live migration key (session N, status). Revoke it first,
or wait for it to finish."). The portal shows the service's message. Redemption checks both again, along with the server and the
owner, since minting may have been hours earlier.

**The key as typed.** Redemption accepts the key with or without its `CPM-`
label, in any case, with dashes, spaces or nothing between the groups, and with
`I`, `L` and `O` read as `1`, `1` and `0`. Show it as `CPM-XXXX-XXXX-XXXX-XXXX`:
four groups of Crockford base32, 80 bits. `MigrationKeyPrefix` is the first
group, 20 of those bits, and is safe to list afterwards; describe it as the key
_starting_ with it. The operator does not need to be told any of this.

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
  "MigrationKey": "CPM-7K4D-9QX2-8M3T-4HZW",   // SHOWN ONCE. Never retrievable again.
  "MigrationKeyPrefix": "7K4D",
  "ExpiresUtc": "2026-09-22T19:04:11Z",
  "TargetSummary": "Customer 1042 into 'easyopti_1042' on server 3.",
}
```

Two things the UI must get right:

**`MigrationKey` is shown once.** Only its hash is stored, so it cannot be read
back. Reuse the reveal-once pattern from `StaticUsersPage.tsx` with a copy
button, and do not let the modal close without the operator having had a chance
to copy it: no close button, no Escape, no click outside. Losing it means
minting another and revoking this one. Record the signed-in operator as
`CreatedByAdmin`.

**`TargetSummary` describes what was minted.** It names the customer and
destination, and appends a warning when that customer already has a database on
a different server. That is legal, since `crystalpm_id` is unique per server rather
than globally, and also exactly what a customer being split across two servers
looks like. It only comes back from `create-migration-session`, so it can only
be shown after minting, alongside the key. The confirm step before minting
states the destination from the portal's own selection instead.

**Statuses**: `pending`, then `redeemed`, then `streaming`, then `completed` | `failed`,
plus `expired` and `revoked`. `get-migration-sessions` sweeps expiries before
returning, so the list does not show dead keys as pending.

Each session carries `DatabaseCreated`: true once redemption has created the
database this session streams into, as opposed to one that already existed.

`get-migration-session/{id}` returns the session plus a `Progress` array
(`Phase`, `TableName`, `RowsDone`, `RowsTotal`, `BytesDone`, `Message`,
`IsError`, `UtcTimestamp`), oldest first. A migration that dies partway reports
where it got to; surface the last non-null `Phase` and `TableName` rather than
only that it failed.

**Revoking** is how a key minted for the wrong customer is undone. For a key
already redeemed it also drops the installer's database login and ends its
connections, so a running stream stops there and then. What it had already
written depends on the target: in a database the migration created
(`DatabaseCreated` true), it stays until the target is discarded; in an
existing database the key was minted against, it stays for good as far as the
portal goes, since that database is not this migration's to discard, and
cleaning it up is a manual job. The revoke dialog says which. A session that already finished
returns `Success: false` with a message rather than being rewritten, and an
unknown id is a 404.

If the installer's login cannot be dropped, revoke answers **500** with
`Success: false`, but the key **is** revoked: the message says the login may
still be streaming, and the service's sweeper retries the drop, and ends its
connections, every few minutes until it succeeds. Drop the login by hand on the
server if it cannot wait. Any other unexpected failure is a 500 "Internal server
error".

**Discarding a failed target** is `POST /My/discard-migration-target/{id}`. A
failed migration leaves its destination exactly as it was, half imported, on
purpose: dropping it automatically would destroy the evidence of what went wrong
at the moment somebody most needs it.

Only a session that finished unsuccessfully can discard: any other status
answers `Success: false`. A session that did not create its database, because it
was minted against an existing one or its key was never redeemed, answers 200
with `Success: true` and "Nothing to discard", since nothing of this
migration's exists to drop; so does a second discard of one already dropped. A
migration aimed at a database that already existed can never drop it. The UI should only surface the action when `DatabaseCreated` is
true, `DatabaseId` is not null and the status is `failed`, `revoked` or
`expired`, so the destructive button is absent rather than present-and-refused.

It also refuses, with `Success: false` and a message naming why, when:

- any other session on the same database has not failed, been revoked or
  expired. That includes a retry key that is still `pending`: a retry is minted
  against the first attempt's database as an existing one, and once it is
  minted, running or done, the database may be the customer's;
- any authorized user is mapped to the database, any static user holds
  privileges on it, or any move refers to it.

It answers **409** with a `Message` when the database's registration has been
repointed since the session created it: another schema name, or the same name
on another server. Dropping it then would drop something this session never
made. The portal shows the `Message` as it does for every other 409.

The schema is dropped inside the transaction that deletes the database's
registration, after the delete and before its commit. A foreign key refusing the
delete stops it before the schema is touched, and a drop that fails rolls the
delete back, so the registration is still there and a retry of the discard
finishes the job.

Dropping detaches the sessions that pointed at the database rather than deleting
them, so the history survives. A second discard of the same session answers
`Success: true` with "already been dropped".

**Redemption can answer 409.** A good key whose destination is no longer
usable is refused with 409 and a `Message` saying what is in the way: a schema of
that name appeared on the server after minting; the existing database it was
minted against has since moved, changed owner, stopped being `active` or gained
an unsettled move ("The database this key was minted for has a customer move
that is still in progress or can still be rolled back...", with the same
advice); another session on that database is `redeemed` or `streaming`
("Another migration is already streaming into this database (...)"); or, for a
key that provisions, its server has stopped being `available` since minting
("... so it is not taking new customers. Nothing was created; the key can be
used once the server is available again."). The key stays `pending` and redeems normally once the conflict is
cleared. A `ClientPublicIpAddress` that is not exactly one IPv4 or IPv6 address
is a 400 saying so, and an unexpected failure is a 500. Every other refusal is
401 with one deliberately uninformative message.

**Redemption returns the server's CA.** When the server was registered with a
certificate, the credentials carry it as `CertificatePem` with `SslMode`
`VerifyCA`, and the installer verifies the server against it; otherwise
`SslMode` is `Required`. This is the installer's concern, but it is why the
certificate is required at registration. The temporary migration login is
created with `REQUIRE SSL`, so the server refuses it over a plaintext
connection whatever the installer asks for.

**Abandoned sessions close themselves.** The service sweeps every five minutes
and fails any session that has not reported for fifteen, dropping the temporary
user it held. The installer sends a keep-alive every minute, so a long step
still counts as alive; only a machine that has genuinely gone away goes quiet.
A session may therefore move to `failed` without the portal doing anything.

The UI's behavior on errors. Every failed request becomes an `ApiError` whose
message is the body's `Message` when present (`src/api/httpClient.ts`). A failed
page load renders it through `QueryStatus` with a title chosen by status and the
message as detail; a failed action shows a red notification from `notifyError`
with the message and `(status N)`. Queries are not retried on 4xx.
`Retry-After` is not read.

The three user reads (`get-users`, `get-users/{server}/{db}` and `get-user`)
answer **200** with `Success: false` when the service could not read users, and
`get-users/{server}/{db}` carries only the requested mapping for each user.
`src/api/authorizedUsers.ts` turns `Success: false` into an `ApiError` with the
service's `Message` (status 200), so a failed read shows as an error rather than
as an empty list.

| Status   | Failed page load (`QueryStatus`)                                                 | Failed action (`notifyError`) |
| -------- | -------------------------------------------------------------------------------- | ----------------------------- |
| 0        | "Cannot reach the API", with retry                                               | message                       |
| 401      | Every 401 signs the operator out, clears the query cache and returns to `/login` | same                          |
| 403      | "You don't have access to this"                                                  | message (status 403)          |
| 404      | "Not found", with retry                                                          | message (status 404)          |
| 400, 422 | "Validation failed"                                                              | message (status 400 or 422)   |
| 409      | "This record changed somewhere else"                                             | message (status 409)          |
| 429      | "Too many requests"                                                              | message (status 429)          |
| 5xx      | "The server hit a problem", with retry                                           | message (status 5xx)          |

A refusal the service answers as 200 with `Success: false` is not an error to
the client; each action checks `Success` and shows the `Message` itself.

---

## 2. Pending endpoints

These are wired in the SPA today behind feature flags. Implementing them
without changing names / DTOs is enough to ship the corresponding UI.

### 2.1 Delete endpoints (gated by `VITE_FEATURE_DELETES`)

| Method | URL                                    | Notes                                                                                                                                                         | Response                           |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| DELETE | `/My/delete-database-server-info/{id}` | Reject (HTTP 409) when any database still references the server. Body should describe the dependency.                                                         | `{ Success: bool, Message: str? }` |
| DELETE | `/My/delete-database-info/{id}`        | Reject (409) when any authorized user or static user is still mapped to the database.                                                                         | `{ Success: bool, Message: str? }` |
| DELETE | `/My/delete-static-database-user/{id}` | The SPA sends one DELETE per `(server, user)` row; backend may treat each as independent. Optionally also accept `?cascade=true` to drop all rows for a user. | `{ Success: bool, Message: str? }` |

The service exposes none of these yet; the only DELETE it has is
`delete-user/{userId}`. The URLs above are the ones the SPA calls, named after
the existing `create-`, `update-` and `get-...-info` routes, so implement them at
exactly these paths. The SPA's `useDelete*` mutations live in
`src/features/*/queries.ts` and already invalidate the relevant list queries on
success.

### 2.3 Event log (gated by `VITE_FEATURE_EVENT_LOG`)

DTOs: see `EventLogEntry`, `EventLogQueryParams`, `EventLogQueryResponse`
in `src/api/types.ts`.

| Method | URL                        | Body / Params                                                                                                                                                                          | Response                |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| GET    | `/My/event-log`            | Query: `userEmail`, `ipAddress`, `databaseServerId`, `databaseId`, `fromUtc`, `toUtc`, `eventType`, `page` (1-based), `pageSize` (at most 500).                                        | `EventLogQueryResponse` |
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
service's perspective: `VITE_AUDIT_SINK_URL` points the SPA wherever
you want the entries to land. The body for each `POST` is a single
`AuditEntry`, exactly as `src/lib/auditLog.ts` records it:

```jsonc
{
  "timestamp": "2026-04-21T18:43:02.123Z", // when the response arrived
  "admin": "erik.griffin", // the signed-in admin name, or null
  "method": "POST", // only writes: POST, PUT, PATCH, DELETE
  "url": "/create-database-server-info", // as the SPA requested it, without the base URL or /My
  "status": 200, // 0 when no response arrived
  "ok": true,
  "durationMs": 142,
  "errorMessage": "...", // only on a failed request
}
```

Each entry is sent once. Failures are silent (the sink is best-effort and must
never block the UI).

**The sink receives the admin API key.** Each POST carries the same auth
headers as an API call, which today means the `api-key` header. Whoever runs the
sink URL can therefore call every management endpoint as an admin, so it must be
trusted exactly like the API itself: never point it at a third-party service.

---

## 3. Versioning & change management

- Endpoints below `/My/` are considered v1 and stable. Breaking shape
  changes require a parallel `/v2/` route, and the SPA will switch over in a
  coordinated release.
- Adding new optional fields to existing DTOs is non-breaking; the SPA's
  type definitions accept and ignore unknown properties.
- Renaming, removing, or changing the type of an existing field is
  breaking. Coordinate via this document and a release note in the
  associated PR.
