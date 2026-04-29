/**
 * Opt-in Sentry initialization.
 *
 * Sentry is activated only when `VITE_SENTRY_DSN` is set; otherwise this
 * module is a no-op (still safe to call `initSentry()`). Source maps are
 * uploaded as a separate CI step (see CHANGELOG and infra/ scripts).
 *
 * Why opt-in: development and CI runs should never spam your Sentry
 * project, and we don't want to ship a hardcoded DSN inside the
 * customer-shipped JS bundle.
 */

import * as Sentry from "@sentry/react";

import { env } from "@/config/env";

let initialized = false;

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

    // Strip the api-key header so it never leaves the browser even
    // if a request is captured as a breadcrumb.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "xhr" || breadcrumb.category === "fetch") {
        const data = breadcrumb.data as Record<string, unknown> | undefined;
        if (data && "api-key" in data) {
          delete data["api-key"];
        }
      }
      return breadcrumb;
    },

    beforeSend(event) {
      // Defense-in-depth: scrub api-key from request headers if axios
      // ever leaks one into an event.
      const headers = event.request?.headers as Record<string, string> | undefined;
      if (headers) {
        delete headers["api-key"];
        delete headers["Api-Key"];
        delete headers["API-KEY"];
      }
      return event;
    },
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
