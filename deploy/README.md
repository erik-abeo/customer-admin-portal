# Deployment artifacts

This folder holds everything you need to build, ship, and run the Customer
Admin Portal in production. Each file is intentionally small and reviewable;
prefer wiring these into your existing platform pipeline rather than
introducing a parallel one.

## Files

| File                       | Purpose                                                                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nginx.conf`               | nginx site config used inside the container. SPA fallback, immutable asset caching, `/healthz`, security headers (CSP, HSTS, COOP, CORP, XCTO, X-Frame-Options, Referrer-Policy, Permissions-Policy), gzip, and an optional `/api/` reverse proxy to the gateway. |
| `ecs-task-definition.json` | Hand-edit AWS ECS Fargate task definition (no Terraform required). Wires CloudWatch logs, secrets injection (Sentry DSN, audit-sink URL), `/healthz` ECS healthcheck, rootless user (uid 101).                                                                    |
| `terraform/`               | Terraform skeleton (ECR + log group + IAM + task definition + ALB target group + ECS service). Reusable starting point — assumes a VPC + internal ALB + ECS cluster already exist.                                                                                |

## Image build

```bash
# From the repo root:
docker build -t customer-admin-portal:local .
docker run --rm -p 8080:8080 customer-admin-portal:local
# → http://localhost:8080
```

The Dockerfile is multi-stage:

1. `node:22-alpine` builds the SPA via `npm ci && npm run typecheck && npm run build`.
2. `nginxinc/nginx-unprivileged:1.27-alpine` serves `dist/` under the
   non-root `nginx` user (uid 101) on port 8080.

A built-in `HEALTHCHECK` hits `/healthz`. ECS / Kubernetes probes should
target the same path.

## Build-time configuration

The values below are baked into the static JS bundle at `npm run build`
time. Override at image build by passing `--build-arg`:

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://api.internal \
  --build-arg VITE_API_CONTROLLER_PREFIX=/My \
  --build-arg VITE_APP_NAME="Customer Admin Portal" \
  -t customer-admin-portal:local .
```

The API key is **never** baked into the image — it is supplied by the
operator at the runtime login screen and stored in `sessionStorage`.

## Runtime configuration

Sentry DSN and audit-sink URL are runtime values. The simplest pattern is
to bake placeholders at build time and overwrite them via an init script
that writes a `config.json` from the container's environment variables;
the SPA can then read that file before bootstrap. ECS task definition
ships these as `secrets[]` so they never appear in `docker inspect` or
log output.

## Security headers

The shipped `nginx.conf` enforces:

- `Content-Security-Policy` with `default-src 'self'`, `frame-ancestors
'none'`, `object-src 'none'`, `upgrade-insecure-requests`, and
  explicit `connect-src` for the gateway and Sentry ingest.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `X-XSS-Protection: 0` (modern browsers ignore the legacy filter; we
  explicitly disable it because enabling it can introduce XSS auditor
  side-channels)

If you point the SPA at a different API origin, add it to `connect-src`.

## Source maps and Sentry

The Vite build emits source maps as `sourcemap: "hidden"` — the `.map`
files are produced alongside each chunk but the bundle does **not**
contain a `//# sourceMappingURL=` comment. This means:

- Browsers and devtools cannot resolve readable source from the shipped
  bundle (good for a customer-facing admin tool).
- Symbolicators with direct access to the maps (Sentry, Rollbar, etc.)
  can still de-minify stack traces.

The Dockerfile **deletes** `*.map` files from `/app/dist` before copying
into the runtime stage, so maps never reach customers. To wire up Sentry
symbolication, upload the maps to your Sentry project before that delete
runs in CI:

```bash
# In your CI job, after `npm run build` and before `docker build`:
npx @sentry/cli sourcemaps upload \
  --org "$SENTRY_ORG" \
  --project "$SENTRY_PROJECT" \
  --release "$(node -p "require('./package.json').version")" \
  --url-prefix "~/" \
  ./dist
```

The release identifier must match the value Vite injects into the bundle
via `__APP_VERSION__` (which is read from `package.json`'s `version`
field — see `vite.config.ts`). Sentry then matches a runtime stack trace
to the uploaded maps via that release id and the chunk filename.

If you want to embed Sentry source-map upload into the image build, do
it in a separate CI job that runs `npm run build`, uploads maps, and
then triggers `docker build --target runtime` with the pre-built `dist/`
directory mounted in. The repo's `Dockerfile` already deletes maps so
nothing extra is required to keep them out of the runtime container.

## Secret rotation

Sensitive values live in AWS Secrets Manager (or the equivalent). Rotation
procedure for the per-deploy values:

1. Update the secret via the cloud console or CLI.
2. Force a fresh ECS deployment (`aws ecs update-service ... --force-new-deployment`)
   so the new task pulls the new value at startup.
3. The previous deployment continues serving until drained — there is no
   secret stored in the running tasks beyond the env-var injection.

The session-scoped admin API key (entered at login) can be rotated by:

1. Issuing a new key via the backend.
2. Telling each operator to sign out and sign back in. Old tabs continue
   using the old key in `sessionStorage` until they're closed.
