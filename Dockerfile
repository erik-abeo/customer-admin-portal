# syntax=docker/dockerfile:1.7

# ---- Stage 1: build the SPA ------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Build-time variables wired into the bundle. Sensitive values (API keys)
# are NOT baked in — they are entered by the operator at the login screen
# and stored in sessionStorage. See README.
ARG VITE_API_BASE_URL=/api
ARG VITE_API_CONTROLLER_PREFIX=/My
ARG VITE_APP_NAME=Customer\ Admin\ Portal
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_API_CONTROLLER_PREFIX=$VITE_API_CONTROLLER_PREFIX \
    VITE_APP_NAME=$VITE_APP_NAME

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY eslint.config.js .prettierrc.json .prettierignore ./
COPY src ./src
COPY public ./public

RUN npm run typecheck \
 && npm run build

# ---- Stage 2: serve via nginx ---------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Drop the stock site config and ship our own.
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# The image's USER nginx (uid 101) cannot bind <1024; we listen on 8080.
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

# Optional runtime config drop-in. If the operator mounts a /usr/share/nginx/
# html/config.json file at deploy time, the SPA will pick it up and override
# the build-time VITE_API_BASE_URL. See README.

EXPOSE 8080

# Liveness probe hits the dedicated /healthz endpoint we expose in
# deploy/nginx.conf. Avoids re-rendering index.html on every probe.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
