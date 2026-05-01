# Customer Admin Portal

Internal web portal for managing the **Remote MariaDB Authentication System**
that backs CrystalPM's remote-database feature. Replaces the customer-facing
parts of the legacy Employee Utility with a browser-based UI suitable for AWS
hosting (S3 + CloudFront, ECS, EC2 + Nginx, container behind ALB, etc.).

The portal is a Vite + React 18 + TypeScript SPA that talks to the
`ClientRemoteDatabaseAccessAPI` ASP.NET Web Service running on the gateway
server (typically reverse-proxied by Nginx behind
`https://remotedb.crystalpm.net`).

## Features

| Section          | Capabilities                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login            | Runtime API-key entry (never embedded in the JS bundle). Probes the API to validate the key before unlocking the app. Auto sign-out on `401` (any in-flight request returning 401 force-signs the user out). Cross-tab sync.                                                                                                                                                                               |
| Dashboard        | Live totals (servers / databases / authorized users / static users) from the `get-all-*` endpoints, plus a personalized greeting, API-health badge, and a recent-activity feed sourced from the in-memory audit log.                                                                                                                                                                                       |
| Database servers | List, create, edit (root password, SSL CA, ports), detail view of associated databases. Optional delete (feature-flagged + RBAC).                                                                                                                                                                                                                                                                          |
| Databases        | List, create, edit, filter by server. Drill-down detail view shows authorized users for the database. Optional delete (feature-flagged + RBAC).                                                                                                                                                                                                                                                            |
| Authorized users | List, create, edit, delete, CSV export. Search by email; filter by host restriction (any vs static-only) and by whether the user has any mappings. Inline picker for which databases each Supertokens user can access. URL-driven email filter so deep links from the database detail page survive a refresh.                                                                                              |
| Static DB users  | List (grouped by username across servers), create, edit, password rotation, per-server / per-database privilege matrix (SELECT/INSERT/UPDATE/DELETE/CREATE/DROP/GRANT/ALL), one-time secret-reveal modal for new passwords. Optional delete (feature-flagged + RBAC).                                                                                                                                      |
| Dumps            | Full UI when `VITE_FEATURE_DUMPS=true`: register an existing dump, upload a new dump file (multipart with progress + an explicit target-database confirmation modal), trigger import with a "drop & recreate" toggle, edit metadata, delete. When the flag is off the page renders a documented placeholder. See [BACKEND-CONTRACT.md](./BACKEND-CONTRACT.md#22-dumps-gated-by-vite_feature_dumps).        |
| Event log        | Full UI when `VITE_FEATURE_EVENT_LOG=true`: filter by user / IP / server / database / date range / event type, paginated query with `keepPreviousData` for smooth navigation, expandable row details, CSV export with client-side fallback. When the flag is off the page renders a documented placeholder. See [BACKEND-CONTRACT.md](./BACKEND-CONTRACT.md#23-event-log-gated-by-vite_feature_event_log). |
| RBAC             | Optional, gated by `VITE_FEATURE_RBAC`. The portal reads the `X-Admin-Role` response header on every API call (`admin` or `viewer` / `readonly`) and gates write actions accordingly. When the flag is off, all callers are treated as admins.                                                                                                                                                             |
| Observability    | Opt-in Sentry (`VITE_SENTRY_DSN`) with `api-key` header scrubbing. Opt-in audit-log POST sink (`VITE_FEATURE_AUDIT_SINK` + `VITE_AUDIT_SINK_URL`) that mirrors the in-memory ring buffer to a backend endpoint of your choice.                                                                                                                                                                             |
| Theming & UX     | CrystalPM-branded header, login, favicon, and loading splash. Light/dark color scheme toggle. Glass-morphism login + header. Mobile-responsive `AppShell`. Code-split routes. Cmd/Ctrl+K command palette. Initial loading splash rendered before React mounts.                                                                                                                                             |

## Tech stack

- **Vite 6** + **React 18** + **TypeScript 5** (strict)
- **Mantine v7** (UI), **@mantine/form**, **@mantine/modals**,
  **@mantine/notifications**
- **TanStack Query v5** for server state
- **React Router v6** for client-side routing (lazy routes via `React.lazy` with per-route `<Suspense>` boundaries)
- **Axios** for HTTP, with a swappable auth interceptor and global response
  observer (used by the audit log shim)
- **Vitest 3** + **happy-dom** + **Testing Library** for unit tests
- **ESLint 9** (flat config, `typescript-eslint`, `react-hooks`,
  `react-refresh`) + **Prettier 3** + **EditorConfig**

## Prerequisites

- **Node.js 22.13+** (pinned in `.nvmrc`). The Dockerfile uses Node 22.
- Network access to the ASP.NET service (default base URL
  `https://remotedb.crystalpm.net`).

## Local development

```bash
npm install
cp .env.example .env.local   # then edit .env.local
npm run dev
```

Open <http://localhost:5173>. You will be sent to the login screen on first
load — enter your admin name and the API key (the value of the `api-key`
setting in `ClientRemoteDatabaseAccessAPI`'s `appsettings.json`).

### Demo mode (no backend required)

For walkthroughs, screen-recordings, and design reviews where the ASP.NET
backend is unavailable, the portal ships an in-memory adapter that serves
realistic fixture data for every endpoint. Mutations (create / edit /
delete) persist for the lifetime of the tab and reset on reload.

```bash
npm install
npm run demo            # vite dev server on http://127.0.0.1:5173
# or, to demo the production build:
npm run demo:preview    # builds with --mode demo and serves on :4173
```

In demo mode any non-empty admin name and any non-empty API key will sign
you in. A persistent banner at the bottom of every page makes the demo
state unmistakable; click **Reset data** in the banner to re-seed the
fixtures. Implementation lives in [`src/demo/`](./src/demo/) — start at
`installDemo.ts`.

### Build-time environment variables

| Variable                     | Required | Description                                                                                                                                                                                             |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`          | yes      | Origin of the ASP.NET service (no trailing slash). E.g. `https://remotedb.crystalpm.net` for production, `https://localhost:5001` for local IIS Express, `/api` when proxying through this app's nginx. |
| `VITE_API_CONTROLLER_PREFIX` | no       | Defaults to `/My` to match `MyController` in `ClientRemoteDatabaseAccessAPI`.                                                                                                                           |
| `VITE_APP_NAME`              | no       | Branding / window title. Defaults to `Customer Admin Portal`.                                                                                                                                           |

The API key is **not** a build-time variable — see below.

## Authentication & security model

### Today (interim — static API key, runtime-supplied)

All management endpoints on `ClientRemoteDatabaseAccessAPI` are currently
protected by a static `api-key` HTTP header (see
`APIKeyAuthenticationMiddleware`).

The portal handles this without baking the key into the bundle:

1. The first request after a fresh load lands on `/login`.
2. The operator enters their admin name and the API key.
3. The portal probes `GET /My/get-all-database-server-info` with that key. A
   `2xx` validates the key; `401`/`403` shows an actionable error.
4. The key is stored only in the browser tab's `sessionStorage` (key
   `cap.auth.v1`). It is removed on sign-out, on tab close, and on any
   `401` from a subsequent API call.
5. Every outgoing request gets the `api-key` header plus an `X-Admin-User`
   header carrying the operator's admin name (so the future audit endpoint
   can attribute writes).

> The auth layer is intentionally isolated behind the `AuthStrategy`
> interface in `src/api/httpClient.ts`. When real per-user tokens become
> available (Supertokens-issued JWT, OAuth, mTLS), only that file and
> `src/auth/AuthContext.tsx` need to change.

### Defense in depth

Even with the runtime-supplied key, treat the portal as an admin tool and
restrict who can reach it:

- AWS ALB + Cognito/SSO listener rule, or
- private CloudFront distribution restricted by WAF + IP allowlist, or
- private S3 bucket fronted by API Gateway with IAM auth, or
- VPN-only ingress.

### Audit log shim

`src/lib/auditLog.ts` registers a response observer that records every
`POST`/`PUT`/`PATCH`/`DELETE` along with the admin name, URL, status, and
duration. Today it logs to the dev console and keeps a 200-entry ring
buffer. When the backend ships an `admin_audit_log` table + endpoint, the
single `record` function in that file is the only place to wire in a POST.

## Project layout

```
src/
  api/                      # Typed API client (axios + interfaces matching ASP.NET DTOs)
    httpClient.ts           #   axios instance, AuthStrategy, ApiError, response observer
    authorizedUsers.ts      #   per-domain API modules
    databases.ts
    databaseServers.ts
    staticUsers.ts
    types.ts
  auth/                     # Runtime auth (API key in sessionStorage)
    AuthContext.tsx         #   AuthProvider, sessionStorage glue
    authContextValue.ts     #   Context + useAuth hook (split for fast-refresh)
    ProtectedRoute.tsx
  components/
    common/                 # QueryStatus, PageFallback (Suspense fallback)
    layout/                 # AppLayout (AppShell + nav), ErrorBoundary, RootErrorBoundary
  config/env.ts             # Vite env access with fail-fast validation (no secrets)
  features/
    databaseServers/        # Queries + form for database server CRUD
    databases/              # Queries + form for database CRUD
    authorizedUsers/        # Queries + form + database-mapping editor
    staticUsers/            # Queries + form + privileges-matrix editor
  lib/
    auditLog.ts             # Response observer that records admin writes
    csv.ts                  # RFC-4180-ish CSV builder + downloadCsv helper
    notify.ts               # Notification helpers (success/error)
  demo/                     # Demo-mode adapter (loaded only when VITE_DEMO_MODE=true)
    fixtures.ts             #   Realistic seed data
    demoStore.ts            #   In-memory mutable store
    demoAdapter.ts          #   Axios adapter routing requests to handlers
    installDemo.ts          #   One-call entry point
    DemoBanner.tsx          #   Persistent "Demo mode" banner
  pages/                    # Route-level components, lazy-loaded by App.tsx
  App.tsx                   # Providers + router (lazy routes)
  main.tsx                  # Entry
  test/setup.ts             # Vitest setup (jest-dom matchers)
deploy/
  nginx.conf                # Production server config (security headers, gzip, SPA fallback)
public/
  crystalpm-logo.png        # CrystalPM brand mark (used on login + splash)
  crystalpm-logo-side.png   # Horizontal CrystalPM logo (used in the header)
  favicon.ico               # CrystalPM favicon
  favicon.svg               # SVG fallback favicon
  robots.txt                # noindex (private admin tool)
Dockerfile                  # Multi-stage build → nginx-unprivileged
.github/workflows/ci.yml    # format check + lint + typecheck + test + build + Docker
.editorconfig               # Whitespace / charset baseline for all editors
.nvmrc                      # Pinned Node version
LICENSE                     # Proprietary, internal-use-only license
```

## API surface used

All endpoints live on `MyController` in the
`erik/remote-database-access-authorization-b1-supertokens` branch of
`crystalpm`, under `src/RemoteDatabaseAccessAuthorization/ClientRemoteDatabaseAccessAPI`.

| Area             | Methods                                                                                                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database servers | `GET /My/get-all-database-server-info`, `GET /My/get-database-server-info/{id}`, `POST /My/create-database-server-info`, `PUT /My/update-database-server-info`                                                                                                                    |
| Databases        | `GET /My/get-all-database-info`, `GET /My/get-database-info/{id}`, `POST /My/create-database-info`, `PUT /My/update-database-info`                                                                                                                                                |
| Authorized users | `GET /My/get-users`, `GET /My/get-users/{serverId}/{dbId}`, `GET /My/get-user/{userId}`, `POST /My/create-user`, `PUT /My/update-user`, `DELETE /My/delete-user/{userId}`                                                                                                         |
| Static DB users  | `GET /My/get-all-static-database-users`, `GET /My/get-static-database-users-by-server/{serverId}`, `GET /My/get-static-database-users-by-database/{dbId}`, `GET /My/get-static-database-user/{id}`, `POST /My/create-static-database-user`, `PUT /My/update-static-database-user` |

> Server, database, and static-user **delete** endpoints do not yet exist on
> the backend. The portal ships full delete UI gated behind
> `VITE_FEATURE_DELETES`. See [BACKEND-CONTRACT.md](./BACKEND-CONTRACT.md) for
> the canonical specification of every pending endpoint and its expected
> shape.

## Backend gap

The following Phase 1 spec items cannot be delivered from the SPA alone —
they require new endpoints on `ClientRemoteDatabaseAccessAPI`. The
corresponding pages or controls are scaffolded behind feature flags. See
[BACKEND-CONTRACT.md](./BACKEND-CONTRACT.md) for the authoritative API
contract.

| Spec item                                      | Required endpoint(s)                                                                                                                                                               | Notes                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Delete database server                         | `DELETE /My/delete-database-server-info/{id}`                                                                                                                                      | Should also reject when databases are still attached.                               |
| Delete database                                | `DELETE /My/delete-database-info/{id}`                                                                                                                                             |                                                                                     |
| Delete static DB user                          | `DELETE /My/delete-static-database-user/{id}` (or `{serverId}/{userId}`)                                                                                                           | Should also `DROP USER` on each MariaDB server it was provisioned on.               |
| Active sessions metric / list / kill from UI   | `GET /My/database-user-cache?onlyInUse=true` returning `{userName, databaseServerId, databaseId, since}`; pair with the existing `KillDatabaseUser` for an admin kill action.      | `database_user_cache.in_use` already tracks this — only a list endpoint is missing. |
| Recent events metric on dashboard              | `GET /My/event-log/recent?limit=10`                                                                                                                                                | Returns most recent events across all customers.                                    |
| Database Dumps page (CRUD + import + upload)   | `GET /My/get-all-dumps`, `POST /My/create-dump`, `PUT /My/update-dump`, `DELETE /My/delete-dump/{id}`, `POST /My/import-dump`, `POST /My/upload-dump` (multipart or pre-signed S3) | `database_dumps` table already exists in `remote_maria_db_auth`.                    |
| Event Log Viewer (filter / paginate / export)  | `GET /My/event-log` with `userEmail`, `ipAddress`, `databaseServerId`, `databaseId`, `fromUtc`, `toUtc`, `page`, `pageSize`. Optional `GET /My/event-log/export.csv`.              | `EventLogService` already populates the table.                                      |
| Role-based access control (Admin vs Read-only) | Issue a role claim from Supertokens; enforce via `[Authorize(Roles=...)]` on management endpoints and a `/My/whoami` endpoint the SPA can call to hide write controls.             | Belongs in the same auth migration that replaces the static API key.                |
| Per-action audit trail of admin actions        | `POST /My/admin-audit-log` accepting the entries currently buffered by `src/lib/auditLog.ts`. Alternatively, have each write endpoint emit its own `event_log` row.                | `X-Admin-User` is already attached on every request the SPA makes.                  |

When any of those endpoints land, the corresponding page or control already
has its types, form, and TanStack Query hook plumbing in place — flipping
them on is a small, isolated change.

## Scripts

| Script                  | Purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `npm run dev`           | Vite dev server with HMR.                                          |
| `npm run build`         | Type-check the project then produce a production build in `dist/`. |
| `npm run preview`       | Serve the production build locally for smoke testing.              |
| `npm run typecheck`     | TypeScript only, no emit.                                          |
| `npm run lint`          | ESLint (`--max-warnings=0`).                                       |
| `npm run lint:fix`      | ESLint with autofix.                                               |
| `npm run format`        | Prettier write.                                                    |
| `npm run format:check`  | Prettier check (used by CI).                                       |
| `npm test`              | Run the Vitest suite once.                                         |
| `npm run test:watch`    | Vitest watch mode.                                                 |
| `npm run test:coverage` | Vitest with V8 coverage (HTML + text reports under `coverage/`).   |

## Deploying with Docker

The included `Dockerfile` produces a multi-stage build that ends at
`nginxinc/nginx-unprivileged:1.27-alpine` listening on port `8080`.

```bash
# Build for the gateway server's public hostname
docker build \
  --build-arg VITE_API_BASE_URL=https://remotedb.crystalpm.net \
  --build-arg VITE_APP_NAME="CrystalPM Admin Portal" \
  -t customer-admin-portal:latest .

# Run locally; visit http://localhost:8080
docker run --rm -p 8080:8080 customer-admin-portal:latest
```

When the SPA is configured with `VITE_API_BASE_URL=/api`, the included
`deploy/nginx.conf` proxies `/api/*` to the ASP.NET service. This avoids
CORS entirely and lets you serve everything from a single origin. Edit the
`proxy_pass` line to point at your gateway server.

`deploy/nginx.conf` also ships:

- HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, and a strict
  `Content-Security-Policy` (no inline scripts; `connect-src` set to the
  gateway origin).
- Long-lived caching for hashed assets, `no-store` for `index.html` and
  `config.json`.
- gzip for text-y content types.

## Deploying to AWS (suggested)

Two flavors:

### Container (recommended)

1. Build and push the Docker image to ECR.
2. Run on ECS Fargate (or EC2) behind an internal ALB.
3. Use an ALB authentication action (Cognito user pool or OIDC IdP) so a
   browser can't reach the SPA without first authenticating to your IdP.
4. The container's `/api/*` proxy reaches the gateway server over your VPC.

### Static (S3 + CloudFront)

1. `npm run build`.
2. Upload `dist/` to a private S3 bucket.
3. Front it with CloudFront, set up an SPA fallback (return `index.html` for
   404s) so React Router routes resolve.
4. Restrict access via WAF (IP allowlist), CloudFront signed cookies, or an
   ALB / API Gateway in front.
5. Set `VITE_API_BASE_URL` to the public URL of the gateway server (e.g.
   `https://remotedb.crystalpm.net`) at build time. CORS must be enabled on
   the gateway in this layout.

For environment-specific builds, copy `.env.example` to `.env.production`
(or `.env.staging`) and run `npm run build -- --mode production`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and PR with three quality
jobs that must all pass before the Docker image is built:

| Job          | What it runs                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build`      | `format:check` → `lint` (`--max-warnings=0`) → `typecheck` → `npm test` → `npm run build`. Uploads `dist/` as an artifact.                                                                                                                                                                                                                                 |
| `e2e`        | Installs Chromium and runs `npm run test:e2e` against the production bundle (built in test mode). Uploads the HTML report on every run; on failure also uploads `test-results/` (traces, screenshots, videos).                                                                                                                                             |
| `lighthouse` | Runs `npx lhci autorun` against `http://127.0.0.1:4173/login` three times and asserts the budget in [`lighthouserc.json`](./lighthouserc.json): Performance ≥ 0.9, Accessibility ≥ 0.95, Best-practices ≥ 0.9, CLS ≤ 0.1, plus per-metric warnings on FCP/LCP/TBT/Speed Index/TTI. Median report URL appears in the job log; full reports are an artifact. |
| `docker`     | On `main` only, builds the runtime image. Waits on **all three** quality jobs above. No push by default — wire up an ECR `docker/login-action` step when you're ready.                                                                                                                                                                                     |

## Roadmap (post-v1)

- Switch management auth from static key to Supertokens-issued tokens (one
  change in `src/api/httpClient.ts` + `src/auth/AuthContext.tsx`).
- Ship the Dumps and Event Log endpoints documented in
  [BACKEND-CONTRACT.md](./BACKEND-CONTRACT.md) and flip the corresponding
  feature flags on (`VITE_FEATURE_DUMPS`, `VITE_FEATURE_EVENT_LOG`).
- Ship a `/My/admin-audit-log` POST and have `src/lib/auditLog.ts` mirror
  entries to it.
- Ad-hoc query utility per server/database.
- Company settings (write `license_type`, `remote_database_server_id`,
  `remote_database_id` on `PatientPortal.companies`).
