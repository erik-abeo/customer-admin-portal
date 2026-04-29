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
