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
- **Authorization:** the backend has no roles today. The `api-key` grants full
  admin access to every management endpoint, and nothing in the service sends
  an `X-Admin-Role` header. `VITE_FEATURE_RBAC` is UI-only: it hides or
  disables write controls according to that header, and enforces nothing. With
  it on and no header, every caller is treated as a viewer, so it must stay off
  in real builds until the backend issues roles, sends the header and enforces
  them on its endpoints.
- **Transport:** HTTPS only (HSTS preload-eligible policy is enforced by the
  nginx configuration in `deploy/nginx.conf`, with the headers themselves in
  `deploy/security-headers.conf`). The container serves plain HTTP on 8080, so
  TLS terminates at the load balancer in front of it.
- **Static assets:** strict CSP, COOP, CORP, X-Frame-Options, Referrer-Policy,
  and Permissions-Policy headers. `script-src 'self'` forbids inline scripts
  and `eval`; `style-src` allows `'unsafe-inline'`, which Mantine's runtime
  styles need. See `deploy/security-headers.conf`.
- **Secrets in code:** none. The repository contains an `.env.example`. The
  `api-key`, Sentry DSN, and other deployment-specific values are injected at
  build / runtime.
- **Source maps:** built as `hidden` in production and stripped from the
  Docker image. Nothing uploads them to Sentry today; `deploy/README.md`
  describes how a CI job could.
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
- CI runs `npm audit --omit=dev --audit-level=high`, so a high or critical
  advisory in a production dependency fails the build. Two moderate
  `react-router` advisories remain, fixed only in v7. One concerns server-side
  rendering, which this SPA does not use; the other is an open redirect through
  a backslash in a navigation target, and the only target a user can influence,
  the post-login `redirect`, is refused by `safeRedirect` if it contains a
  backslash or a control character anywhere.
- Production dependencies are pinned in `package-lock.json`. Major bumps are
  reviewed by hand before merging.

## Threat model (abridged)

| Threat                                  | Mitigation                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stolen API key                          | sessionStorage only; idle sign-out; HTTPS-only transport                                                                                                                                                     |
| XSS via injected content in admin input | React escapes by default; CSP forbids inline scripts and `eval` (`style-src` allows inline styles)                                                                                                           |
| CSRF                                    | API requires the `api-key` header; cookies aren't used                                                                                                                                                       |
| Open redirect on `/login?redirect=`     | `safeRedirect` (`src/auth/redirectSafety.ts`) rejects absolute / `//` paths                                                                                                                                  |
| Source-map exposure                     | Vite emits `hidden` maps; Dockerfile strips `*.map` before publishing                                                                                                                                        |
| Cross-tab session drift                 | None: each tab holds its own session in `sessionStorage`, whose changes never reach another tab, so signing out in one tab does not sign out the others. Close the other tabs, or rely on the idle sign-out. |
| Inactive workstation                    | `useIdleSignOut` warning + automatic sign-out after threshold                                                                                                                                                |
