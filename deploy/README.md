# Deployment artifacts

This folder holds everything you need to build, ship, and run the Customer
Admin Portal in production. Each file is intentionally small and reviewable;
prefer wiring these into your existing platform pipeline rather than
introducing a parallel one.

## Files

| File                       | Purpose                                                                                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nginx.conf`               | nginx site config used inside the container. SPA fallback, immutable asset caching, `/healthz`, security headers (included from `security-headers.conf`), gzip, and the `/api/` reverse proxy to the gateway, which is required: the service does not enable CORS, so the SPA can only reach it on its own origin. |
| `security-headers.conf`    | CSP, HSTS, COOP, CORP, XCTO, X-Frame-Options, Referrer-Policy and Permissions-Policy. Included at server level and in every location that adds its own header, because nginx drops inherited headers in those.                                                                                                     |
| `ecs-task-definition.json` | Hand-edit AWS ECS Fargate task definition (no Terraform required). Wires CloudWatch logs, `/healthz` ECS healthcheck, rootless user (uid 101).                                                                                                                                                                     |
| `terraform/`               | Terraform skeleton (ECR + log group + IAM + task definition + ALB target group + ECS service). Reusable starting point; assumes a VPC + internal ALB + ECS cluster already exist.                                                                                                                                  |

## ECS task definition (without Terraform)

`ecs-task-definition.json` is a plain RegisterTaskDefinition input. Nothing in
CI pushes or deploys (the Docker job builds with `push: false` and has no ECR
login), so every step is yours:

1. Create the ECR repository once, with immutable tags, as the Terraform does:
   `aws ecr create-repository --repository-name customer-admin-portal --image-tag-mutability IMMUTABLE`.
2. Build the image and push it under a **new** tag, a version or commit SHA; an
   immutable tag such as `latest` can be pushed only once.
3. Replace the `<ANGLE_BRACKETS>` values for your account, region and that tag,
   then register the task definition:

```bash
aws ecs register-task-definition --cli-input-json file://deploy/ecs-task-definition.json
```

It has no task role: nginx serving static files makes no AWS calls. The
execution role only pulls the image and writes logs.

Create or update a service that uses it behind an ALB target group on port 8080. The container is rootless (uid 101) and listens on 8080, so there is no
port mapping to 80 or 443.

**Create the log group first.** The task logs to `/ecs/customer-admin-portal`
through `awslogs`, and it does not create the group itself: that needs
`logs:CreateLogGroup`, which the standard `ecsTaskExecutionRole` lacks, so the
task would fail to start. Create it once:

```bash
aws logs create-log-group --log-group-name /ecs/customer-admin-portal
aws logs put-retention-policy --log-group-name /ecs/customer-admin-portal --retention-in-days 30
```

The Terraform in `terraform/` already creates this group (30 days' retention).

There are no environment variables or secrets to set on the task beyond `TZ`:
the SPA has no runtime configuration, and every `VITE_*` value is baked in at
image build (see below). The container is nginx serving static files, so
nothing set on the task reaches the bundle.

## Image build

```bash
# From the repo root:
docker build -t customer-admin-portal:local .
docker run --rm -p 8080:8080 customer-admin-portal:local
# then open http://localhost:8080
```

The Dockerfile is multi-stage:

1. `node:22-alpine` builds the SPA via `npm ci && npm run typecheck && npm run build`.
2. `nginxinc/nginx-unprivileged:1.27-alpine` serves `dist/` under the
   non-root `nginx` user (uid 101) on port 8080.

A built-in `HEALTHCHECK` hits `/healthz`. ECS / Kubernetes probes should
target the same path.

## Build-time configuration

Every setting is baked into the static JS bundle at `npm run build` time, and
the Dockerfile declares an `ARG` for each variable the SPA reads. Pass them with
`--build-arg`; anything not passed gets the default below. `.env` files are
excluded from the build context, so build args are the only way in.

```bash
# VITE_API_BASE_URL already defaults to /api, which the image's nginx proxies.
docker build \
  --build-arg VITE_FEATURE_MIGRATIONS=true \
  --build-arg VITE_ENVIRONMENT=production \
  -t customer-admin-portal:local .
```

| Build arg                    | Default                 | Effect                                                                                                                                                                                                         |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`          | `/api`                  | Where the SPA sends API calls. `/api` goes through this container's nginx proxy.                                                                                                                               |
| `VITE_API_CONTROLLER_PREFIX` | `/My`                   | The route every API controller shares.                                                                                                                                                                         |
| `VITE_APP_NAME`              | `Customer Admin Portal` | Name shown in the header and page titles.                                                                                                                                                                      |
| `VITE_ENVIRONMENT`           | empty (`development`)   | Environment label sent to Sentry.                                                                                                                                                                              |
| `VITE_DEMO_MODE`             | `false`                 | Serves in-memory fixtures instead of calling the API. Never for a real deployment.                                                                                                                             |
| `VITE_FEATURE_MIGRATIONS`    | `false`                 | Registers the Migrations, Capacity and Customer moves pages. Needs the API's migrations 001 to 011.                                                                                                            |
| `VITE_FEATURE_EVENT_LOG`     | `false`                 | Shows the Event Log viewer. Needs the pending event-log endpoints.                                                                                                                                             |
| `VITE_FEATURE_DELETES`       | `false`                 | Shows delete actions. Needs the pending delete endpoints.                                                                                                                                                      |
| `VITE_FEATURE_RBAC`          | `false`                 | Keep off. It gates write actions in the UI on an `X-Admin-Role` header the service does not send yet, so on it makes everyone read-only. It enforces nothing: the api-key grants full admin.                   |
| `VITE_FEATURE_AUDIT_SINK`    | `false`                 | POSTs each admin write to `VITE_AUDIT_SINK_URL`.                                                                                                                                                               |
| `VITE_AUDIT_SINK_URL`        | empty                   | The audit sink. It receives the admin API key on every POST, so it must be trusted like the API itself. On another origin, add it to `connect-src` in `security-headers.conf`, or the browser blocks the POST. |
| `VITE_SENTRY_DSN`            | empty (off)             | Turns on Sentry error reporting. `connect-src` already allows Sentry's ingest hosts (`*.ingest.sentry.io`, `*.ingest.us.sentry.io`, `*.ingest.de.sentry.io`); add yours only for a self-hosted Sentry.         |
| `VITE_IDLE_TIMEOUT_MINUTES`  | empty (`30`)            | Idle minutes before a forced sign-out; `0` disables it.                                                                                                                                                        |
| `VITE_IDLE_WARN_MINUTES`     | empty (`1`)             | Minutes of warning before that sign-out.                                                                                                                                                                       |

None of these is a secret: whatever is baked in is readable by anyone who can
load the bundle. The API key is **never** baked into the image; it is supplied
by the operator at the login screen and stored in `sessionStorage`.

There is no runtime configuration. The container is nginx serving static
files, so environment variables and Secrets Manager entries set on the task do
not reach the SPA, and changing any value above means building a new image.

## TLS and access

The container serves plain HTTP on 8080. Terminate TLS at the load balancer in
front of it; the HSTS and `upgrade-insecure-requests` headers assume the portal
is only ever reached over HTTPS.

The Terraform listener rule only forwards to the target group. It has no
authentication action, so until you add one (Cognito, or your OIDC identity
provider), anyone who can reach the ALB reaches the portal's login page, where
the api-key is the only barrier. Add it as a deployment step; the choice of
identity provider is yours, so it is not made in `main.tf`.

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

The SPA reaches the API only through the `/api/` proxy, on its own origin. If
you change the gateway the proxy points at, change `connect-src` with it (see the
comment in `nginx.conf`).

The gateway then forwards `/My` to the service, so every portal call also
depends on that hop. The gateway config in remote-database-system
(`GatewayServer/Nginx/conf/nginx.conf`) sends `/My` to `http://localhost:8443`,
while the service listens for HTTPS on 443 (`Program.cs` in crystalpm). Check
the live gateway config against where the service really listens before
deploying.

## Source maps and Sentry

The Vite build emits source maps as `sourcemap: "hidden"`: the `.map`
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
field; see `vite.config.ts`). Sentry then matches a runtime stack trace
to the uploaded maps via that release id and the chunk filename.

The image cannot be built from a pre-built `dist/`: the runtime stage copies
from the build stage, which builds the bundle itself and deletes the maps before
the copy. So upload from a separate `npm run build` in CI, using the same
source and the same `VITE_*` values as the image build, and check that the
chunk file names in `dist/assets` match the image's before relying on them.
Nothing in this repo does the upload today.

## Secret rotation

The image holds no secrets. Every setting is compiled into the bundle at build
time and is readable by anyone who can load the portal, so changing one, such as
the Sentry DSN or the audit sink URL, means building and deploying a new image.
Nothing set on the running task reaches the app.

`--force-new-deployment` alone does not do it: the ECR repository's tags are
`IMMUTABLE` and the task definition pins `image_tag`, so it restarts the tasks
on the old image. Instead:

1. Build the image with the new build arg and push it under a **new** tag.
2. Register a task-definition revision with the new image: set `image_tag` and
   `terraform apply`, or `aws ecs register-task-definition` with the new image.
3. Roll the service to that revision yourself:
   `aws ecs update-service --cluster <cluster> --service customer-admin-portal --task-definition customer-admin-portal:<revision>`.
   `terraform apply` does **not** do this step: the service's
   `lifecycle { ignore_changes = [task_definition] }` is there on purpose, so
   that a revision rolled out by hand is not reverted by the next apply, and it
   also means a new revision from Terraform sits unused until the service is
   updated. Nothing in CI pushes or deploys, so this is always a manual step.

The admin API key (entered at login) is a single `api-key` value in the
service's configuration; there is no backend issuance. To rotate it, change that
value and restart the service. Any open portal tab is signed out on its next API
call, since the old key then gets a 401 and the portal signs out on any 401, and
operators sign in again with the new key.
