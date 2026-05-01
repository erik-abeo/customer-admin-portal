# Security policy

Customer Admin Portal is the centralized control plane for the CrystalPM remote
database access infrastructure. We take its security posture seriously and want
to make it easy for you to report problems.

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.** Instead, send the
details to the CrystalPM security team:

- Email: `security@crystalpm.com`
- Subject line: `[customer-admin-portal] <short summary>`

Include in the report:

- A clear description of the issue
- The affected version (commit SHA from `git log` or the value rendered in the
  app footer: `v<APP_VERSION>`)
- Reproduction steps and any proof-of-concept code
- The impact you observed and the impact you believe is possible
- Whether the issue can be reproduced against the public docs / demo, against a
  production deploy, or only locally

We will acknowledge your report within **two business days** and provide a
target remediation window once we've confirmed reproducibility. We are happy
to credit reporters in the release notes if you'd like attribution.

### Out-of-scope

- Reports against the upstream `ClientRemoteDatabaseAccessAPI` or Supertokens —
  please file those with the upstream projects.
- Self-XSS that requires the operator to paste hostile input into their own
  console / DevTools.
- Volumetric DoS that requires the attacker to exhaust public bandwidth at the
  ALB level (this is handled by AWS WAF / Shield, not by the portal).

## Supported versions

The portal follows trunk development on `main`. We patch security issues on
`main` and ship a new container image; older tags are not back-patched. Pin
your deploys to a recent `main` SHA or to a published release tag.

## Security model summary

The portal is an authenticated single-page React app served by Nginx that
talks to the ClientRemoteDatabaseAccessAPI over HTTPS.

- **Authentication today:** the operator pastes a static `api-key` at the
  login screen. The key is held only in `sessionStorage` (not `localStorage`)
  and is wiped on tab close. Every API call carries the key in an `api-key`
  header.
- **Authentication target:** Supertokens-issued session tokens. The
  `AuthStrategy` interface in `src/api/httpClient.ts` is the swap point.
- **Authorization:** role gating is performed by the backend. The portal
  reads the response header `X-Admin-Role` to enable or disable destructive
  UI controls (view-only vs. admin) but does **not** rely on this for
  enforcement — every write call goes through the backend, which is the
  source of truth.
- **Transport:** HTTPS only (HSTS preload-eligible policy is enforced by the
  Nginx configuration in `deploy/nginx/`).
- **Static assets:** strict CSP, COOP, CORP, X-Frame-Options, Referrer-Policy,
  and Permissions-Policy headers; no `unsafe-eval`. See `deploy/nginx/`.
- **Secrets in code:** none. The repository contains an `.env.example`. The
  `api-key`, Sentry DSN, and other deployment-specific values are injected at
  build / runtime.
- **Source maps:** built as `hidden` in production and stripped from the
  Docker image; uploaded directly to Sentry for symbolication.
- **PII scrubbing:** Sentry events and breadcrumbs are passed through
  `scrubBreadcrumb` / `scrubEvent` (see `src/lib/sentry.ts`) which strip the
  `api-key` header in any casing.
- **Idle revocation:** the portal force-signs the operator out after
  `VITE_IDLE_TIMEOUT_MINUTES` minutes of inactivity (default 30) with a
  warning at the configurable threshold. See `src/auth/useIdleSignOut.ts`.
- **Audit log:** every mutating action is recorded in an in-memory ring
  buffer (`src/lib/auditLog.ts`) and, when `VITE_FEATURE_AUDIT_SINK` is on,
  POSTed to `VITE_AUDIT_SINK_URL` for long-term storage.

## Dependency posture

- Dependencies are updated weekly via Dependabot (`.github/dependabot.yml`).
- `npm audit --omit=dev` runs in CI on every PR; CI fails on `high` or
  `critical` advisories.
- Production dependencies are pinned in `package-lock.json`. Major bumps are
  reviewed by hand before merging.

## Threat model (abridged)

| Threat                                  | Mitigation                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Stolen API key                          | sessionStorage only; idle sign-out; HTTPS-only transport                    |
| XSS via injected content in admin input | React escapes by default; CSP forbids `unsafe-inline` / `unsafe-eval`       |
| CSRF                                    | API requires the `api-key` header — cookies aren't used                     |
| Open redirect on `/login?redirect=`     | `safeRedirect` (`src/auth/redirectSafety.ts`) rejects absolute / `//` paths |
| Source-map exposure                     | Vite emits `hidden` maps; Dockerfile strips `*.map` before publishing       |
| Cross-tab session drift                 | `storage` event listener mirrors sign-in/out across tabs                    |
| Inactive workstation                    | `useIdleSignOut` warning + automatic sign-out after threshold               |
