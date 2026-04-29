# Changelog

All notable changes to the Customer Admin Portal are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Operational hardening.** Hardened the shipped `nginx.conf` with a
  dedicated `/healthz` liveness endpoint, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`, `X-XSS-Protection: 0`, expanded CSP
  (`object-src 'none'`, `upgrade-insecure-requests`, Sentry ingest in
  `connect-src`). Container `HEALTHCHECK` now hits `/healthz`.
- **AWS deployment artifacts** (`deploy/`):
  - `ecs-task-definition.json` — ready-to-edit Fargate task definition
    with CloudWatch logs, secrets injection (Sentry DSN, audit-sink
    URL), `/healthz` health check, rootless `uid 101` container.
  - `terraform/` skeleton — ECR + log group + IAM + task definition +
    ALB target group + ECS service. Reusable on top of an existing
    VPC / ALB / ECS cluster.
  - `deploy/README.md` — image build, runtime config, secret rotation,
    full security-headers reference.
- **Playwright E2E harness** (`e2e/`):
  - `playwright.config.ts` — runs against `vite preview` of the
    production bundle, mocks all network with `page.route()`.
  - `helpers/mockApi.ts` — typed responses that mirror the C# DTOs in
    `src/api/types.ts` and fail loudly on un-mocked endpoints.
  - `auth.e2e.ts` and `navigation.e2e.ts` — login, sign-out redirect,
    primary navigation, mocked list rendering, empty-state CTA.
  - New scripts: `npm run test:e2e`, `npm run test:e2e:install`,
    `npm run e2e:serve`.
- **`BACKEND-CONTRACT.md`** — single source of truth for the API
  surface: existing endpoints (DTO crosswalks + error semantics) and
  pending endpoints (deletes, dumps, event log, audit sink) with full
  URL, query, body, and response specifications.

### Fixed

- **Progress-bar coordination.** `MutationProgress` and `PageFallback`
  both drove `@mantine/nprogress` independently, so a finishing
  mutation could prematurely hide the bar mid route-load (and vice
  versa). Both consumers now route through a refcounted
  `progressBar` wrapper (`src/lib/progressBar.ts`) so the bar only
  hides when **every** in-flight consumer has completed. Covered by
  `src/lib/progressBar.test.ts` (5 new tests).
- **Login page Caps-Lock detector.** The `onKeyDown` / `onKeyUp` /
  `onClick` / `onBlur` handlers were placed _before_
  `{...form.getInputProps("apiKey")}`, so the Mantine Form spread
  could silently overwrite them in future configurations (e.g. when
  enabling `validateInputOnBlur`). Handlers now come after the spread
  so they always win.
- **Cosmetic:** removed two double-space typos from user-visible
  labels (command-palette tooltip in `AppLayout` and the Spotlight
  search placeholder).

### Changed

- **Visual identity overhaul.** Introduced a custom CrystalPM Mantine
  theme with a dedicated `crystal` brand color, refined heading scale,
  shadow scale, radius scale, and component-level defaults for `Card`,
  `Paper`, `Button`, `Badge`, `Table`, `Modal`, `Notification`,
  `NavLink`, and `TextInput`.
- Self-hosted typography: Inter Variable for UI and JetBrains Mono
  Variable for code, served via `@fontsource-variable/*` (no CDN
  dependency, latin / cyrillic / greek subsets shipped, browser fetches
  only what it needs).
- Redesigned **Login page** with a layered radial gradient backdrop, a
  glass-morphism card, refined typography, and a footer attribution.
- Redesigned **Dashboard** with a personalized greeting (uses the
  signed-in admin name), a "Live" indicator, separated _Inventory_ /
  _Operational visibility_ / _Quick actions_ sections, and KPI metric
  cards with tinted icon squares, hover-lift, and tabular numerals.
- New shared **`PageHeader`** component (eyebrow / title / description /
  breadcrumbs / actions slot) used by every route for consistent
  spacing, typography, and a brand-tinted underline accent.
- Refined **`QueryStatus`** loading and empty states: Skeleton-aware
  loaders, illustrated empty states with optional descriptions.
- Polished **`AppLayout`**: glass-effect header, subtle navbar surface,
  "Manage" section eyebrow, refined active-link state, and a footer in
  the sidebar showing the live build version (`__APP_VERSION__`
  injected by Vite from `package.json`).
- Detail pages (`DatabaseServerDetailPage`, `DatabaseDetailPage`) now
  use breadcrumbs and a `Fact` grid for cleaner key/value layout.
- 404 page now uses a brand-tinted gradient title plus "Go back" + "Go
  to dashboard" actions.
- Tables now share theme defaults (no zebra, hover highlight, uppercase
  letter-spaced headers, tabular numerals via global CSS).
- Vite manual-chunking simplified — fixed a circular-chunk warning
  introduced by font-asset assets by collapsing the `react` and
  `vendor` chunks into a single long-lived `vendor` chunk.

### Added

- **Recent activity panel on the Dashboard** — live feed wired to the
  audit-log shim. Subscribes on mount, shows the most recent 5 admin
  writes (`POST/PUT/PATCH/DELETE`) with method-tinted badge, truncated
  request path, status code, duration, and relative timestamp that
  refreshes on a 30s tick.
- **API health indicator** in the Dashboard header — derives from the
  status of all four management queries and renders as a green
  `All systems operational`, amber `Checking…`, or red `Service
degraded` badge with a contextual tooltip.
- **Top-of-page navigation progress bar** powered by
  `@mantine/nprogress`. Driven by the route-level `Suspense` fallback so
  every lazy chunk download (and every initial route mount) gives the
  user immediate visual feedback.
- **Brand-aware `PageFallback`** — centered `Loader` (dotted, brand
  color) with `aria-live="polite"` for screen readers; doubles as the
  driver for the navigation progress bar.
- **`FormSection` shared component** — gives every form modal a
  consistent rhythm: tinted icon square, bold title, supporting
  description, and dividers between sections. Adopted by all four forms
  (`DatabaseServerForm`, `DatabaseForm`, `AuthorizedUserForm`,
  `StaticUserForm`).
- **`HealthBadge` shared component** — reusable status badge with
  `ok` / `loading` / `error` states, optional tooltip, and
  matching iconography.
- **`relativeTime` utility** with unit tests covering seconds, minutes,
  hours, days, and calendar-date fallback.
- **Command palette** powered by `@mantine/spotlight`. Opens with
  `Ctrl+K` / `Cmd+K` (or `Ctrl/Cmd+P`) and indexes every primary
  navigation destination plus theme toggle and sign-out. The header now
  shows a subtle search-style trigger button with the keyboard shortcut.
- **Mutation progress feedback.** A `MutationProgress` observer
  subscribes to TanStack Query's `MutationCache` and drives the global
  navigation-progress bar while ANY mutation is in flight, so saves,
  password rotations, and deletes get the same top-of-page feedback as
  route changes.
- **Table skeleton** loading state. `QueryStatus` now accepts a
  `loadingSkeleton={{ rows, columns }}` prop that renders a shimmer
  matching the real table layout — no more page jumps when data
  arrives. Adopted by every list page.
- **Try-again button** on `QueryStatus` error states (when an
  `onRetry` callback is supplied). All four list pages now wire their
  `refetch()` into this so a failed initial load is one click from
  recovering.
- **Empty-state CTAs.** `QueryStatus` accepts an `emptyAction` slot
  used by every list page to show a primary "Add your first server /
  database / user" button, giving brand-new installs a clear path to
  their first record.
- **Caps Lock detector** on the Login page's API-key field — shows an
  inline yellow hint while Caps Lock is active.

## [0.1.0] - 2026-04-23

Initial release: a production-ready administrative portal for CrystalPM's
remote MariaDB infrastructure.

### Added

- **Authentication**
  - Runtime API-key login screen (key never embedded in the JS bundle).
  - `AuthContext` with `sessionStorage` persistence and cross-tab sync.
  - Automatic sign-out on any `401` response from the management API.
  - `X-Admin-User` header attached to every authenticated request for audit
    attribution.
- **Dashboard** with live counts (database servers / databases / authorized
  users / static users) and quick-action shortcuts. Active-session and
  recent-event tiles are stubbed with explicit "pending backend" notices.
- **Database server management** — list, create, edit. Root password is
  write-only (defaults to "leave unchanged" on edit).
- **Database management** — list, create, edit, filter by server. Detail
  page lists the authorized users with access to the database.
- **Authorized user management** — list, create, edit, delete. Search,
  static-host filter, mappings filter. URL-synchronized email filter for
  deep links. CSV export.
- **Static DB user management** — list (grouped by username across
  servers), create, edit, password rotation. Per-database privilege matrix
  (`SELECT/INSERT/UPDATE/DELETE/CREATE/DROP/GRANT/ALL`) plus a one-time
  secret reveal modal.
- **Dumps and Event log** scaffolds (UI shape with disabled controls,
  documenting the missing backend endpoints).
- **CrystalPM branding** — header logo, login splash logo, favicon, and
  loading splash use the official CrystalPM brand assets.
- **Theming** — light/dark color-scheme toggle.
- **Audit log shim** — in-memory ring buffer of every administrative write
  (`POST/PUT/PATCH/DELETE`), ready to be flushed to a backend audit endpoint.
- **Build / CI / deploy**
  - Vite + React 18 + TypeScript 5 + Mantine 7 + TanStack Query 5 + Axios.
  - Route-level code splitting and per-vendor chunking
    (`mantine`, `tanstack`, `router`, `react`, `vendor`).
  - Multi-stage `Dockerfile` (Node 22 build → unprivileged nginx 1.27).
  - Hardened nginx config: SPA fallback, long-cache hashed assets,
    `no-store` for `index.html`, optional `/api/` reverse proxy, gzip,
    HSTS / CSP / X-Frame-Options / Referrer-Policy / Permissions-Policy.
  - GitHub Actions workflow: format check, lint, typecheck, **vitest**,
    production build, optional Docker build on `main`.
  - Vitest + happy-dom + Testing Library with 23 unit tests covering CSV,
    audit shim, HTTP client, and the auth context.
- **Developer tooling** — ESLint 9 flat config, Prettier 3,
  `eslint-config-prettier`, `.editorconfig`, `.nvmrc`.
- **Reliability** — root error boundary, route-level error boundary,
  `Suspense` fallbacks for every lazy route.

### Backend gap (tracked in `README.md`)

The portal is fully wired for these endpoints; once they ship the matching
UI is enabled with no further changes:

- `DELETE /My/delete-database-server-info/{id}`
- `DELETE /My/delete-database-info/{id}`
- `DELETE /My/delete-static-database-user/{id}`
- `GET /My/database-user-cache?onlyInUse=true`
- `GET /My/event-log/recent?limit=10`
- Full `dumps` CRUD plus `import-dump` and `upload-dump`.
- Full `event-log` query / paginate / export.
- Role claim from Supertokens (Admin vs. Read-only).
- `POST /My/admin-audit-log` (or per-write `event_log` rows).

[Unreleased]: https://github.com/crystalpm/customer-admin-portal/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/crystalpm/customer-admin-portal/releases/tag/v0.1.0
