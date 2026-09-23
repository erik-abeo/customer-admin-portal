/**
 * Opt-in Sentry initialization.
 *
 * Sentry is activated only when `VITE_SENTRY_DSN` is set; otherwise this
 * module is a no-op (still safe to call `initSentry()`). Nothing uploads
 * source maps today; deploy/README.md describes how a CI job could.
 *
 * Why opt-in: development and CI runs should never spam your Sentry
 * project, and we don't want to ship a hardcoded DSN inside the
 * customer-shipped JS bundle.
 */

import * as Sentry from "@sentry/react";

import { env } from "@/config/env";

let initialized = false;

/** Deletes every key that is `api-key` in any casing. */
function dropApiKey(record: Record<string, unknown> | undefined): void {
  if (!record) return;
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === "api-key") delete record[key];
  }
}

/**
 * Strip the api-key from XHR/fetch breadcrumb data, in any casing, as
 * scrubEvent does. Exported for unit tests; production code wires this
 * through Sentry.init.
 */
export function scrubBreadcrumb<T extends Sentry.Breadcrumb>(breadcrumb: T): T {
  if (breadcrumb.category === "xhr" || breadcrumb.category === "fetch") {
    dropApiKey(breadcrumb.data as Record<string, unknown> | undefined);
  }
  return breadcrumb;
}

/**
 * Defense-in-depth: scrub api-key from any request headers that find their
 * way into a Sentry event. Casing variants are stripped because middleware
 * and proxies often canonicalize headers differently.
 */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  dropApiKey(event.request?.headers as Record<string, unknown> | undefined);
  return event;
}

export function initSentry(): void {
  if (initialized) return;
  if (!env.sentryDsn) return;

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.environment,
    release: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : undefined,

    // Capture unhandled errors and unhandled rejections automatically.
    // We layer the React ErrorBoundary on top via the existing
    // RootErrorBoundary component.
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.browserSessionIntegration(),
    ],

    // Trace 10% of navigations in production; 100% elsewhere.
    tracesSampleRate: env.environment === "production" ? 0.1 : 1.0,

    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });

  initialized = true;
}

/** Attach the signed-in admin to subsequent Sentry events. */
export function setSentryUser(adminName: string | null): void {
  if (!initialized) return;
  if (!adminName) {
    Sentry.setUser(null);
    return;
  }
  // We deliberately omit email/PII; only the admin's username.
  Sentry.setUser({ username: adminName });
}

/** Manually capture an error (used by error boundaries). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** True when Sentry has been initialized at least once. */
export function isSentryEnabled(): boolean {
  return initialized;
}
