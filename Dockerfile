# syntax=docker/dockerfile:1.7

# ---- Stage 1: build the SPA ------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Every VITE_* variable the SPA reads (src/config/env.ts), wired into the
# bundle at build time. There is no runtime configuration: a value not passed
# here with --build-arg is baked in as its default, and changing one means
# building a new image. .env files are not copied in (.dockerignore), so these
# are the only way in. An empty value means the app's own default; see
# deploy/README.md for each. The API key is NOT among them: the operator
# enters it at the login screen and it lives in sessionStorage.
ARG VITE_API_BASE_URL=/api
ARG VITE_API_CONTROLLER_PREFIX=/My
ARG VITE_APP_NAME="Customer Admin Portal"
ARG VITE_ENVIRONMENT=
ARG VITE_DEMO_MODE=false
ARG VITE_FEATURE_MIGRATIONS=false
ARG VITE_FEATURE_EVENT_LOG=false
ARG VITE_FEATURE_DELETES=false
ARG VITE_FEATURE_RBAC=false
ARG VITE_FEATURE_AUDIT_SINK=false
ARG VITE_AUDIT_SINK_URL=
ARG VITE_SENTRY_DSN=
ARG VITE_IDLE_TIMEOUT_MINUTES=
ARG VITE_IDLE_WARN_MINUTES=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_API_CONTROLLER_PREFIX=$VITE_API_CONTROLLER_PREFIX \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_ENVIRONMENT=$VITE_ENVIRONMENT \
    VITE_DEMO_MODE=$VITE_DEMO_MODE \
    VITE_FEATURE_MIGRATIONS=$VITE_FEATURE_MIGRATIONS \
    VITE_FEATURE_EVENT_LOG=$VITE_FEATURE_EVENT_LOG \
    VITE_FEATURE_DELETES=$VITE_FEATURE_DELETES \
    VITE_FEATURE_RBAC=$VITE_FEATURE_RBAC \
    VITE_FEATURE_AUDIT_SINK=$VITE_FEATURE_AUDIT_SINK \
    VITE_AUDIT_SINK_URL=$VITE_AUDIT_SINK_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_IDLE_TIMEOUT_MINUTES=$VITE_IDLE_TIMEOUT_MINUTES \
    VITE_IDLE_WARN_MINUTES=$VITE_IDLE_WARN_MINUTES

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY eslint.config.js .prettierrc.json .prettierignore ./
COPY src ./src
COPY public ./public

# Typechecks the app and the Vite config only, then builds. `npm run build`
# would run `tsc -b`, which follows tsconfig.json into the e2e project, and
# the tests are not in the image. CI's `npm run typecheck` still covers e2e.
RUN npx tsc -p tsconfig.app.json --noEmit \
 && npx tsc -p tsconfig.node.json --noEmit \
 && npx vite build

# Source maps are emitted as "hidden" (no //# sourceMappingURL=), and are
# stripped here so they never reach customers. Nothing uploads them to Sentry
# today; deploy/README.md describes how a CI job could, from its own build.
RUN find /app/dist -name "*.map" -type f -delete

# ---- Stage 2: serve via nginx ---------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Drop the stock site config and ship our own.
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf

# The image's USER nginx (uid 101) cannot bind <1024; we listen on 8080.
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

EXPOSE 8080

# Liveness probe hits the dedicated /healthz endpoint we expose in
# deploy/nginx.conf. Avoids re-rendering index.html on every probe.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
