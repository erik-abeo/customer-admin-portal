/**
 * Centralized access to Vite-injected environment variables and runtime
 * feature flags. Throws at startup if a required variable is missing so
 * the app fails fast.
 *
 * The API key is intentionally NOT a build-time variable. It is supplied
 * by the operator at the runtime login screen and lives only in
 * sessionStorage. This keeps it out of the static JS bundle.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill in a value.`,
    );
  }
  return value;
}

function bool(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function optional(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function intInRange(
  raw: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (raw === undefined) return defaultValue;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return defaultValue;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * Feature flags are deliberately *opt-in*. Until backend support lands or
 * an operator explicitly enables them, the corresponding UI surfaces stay
 * hidden / disabled. Default = off everywhere.
 */
export const features = {
  /** Enables the Dumps page (requires backend dump endpoints). */
  dumps: bool(import.meta.env.VITE_FEATURE_DUMPS),
  /** Enables the Event Log viewer (requires backend event-log endpoints). */
  eventLog: bool(import.meta.env.VITE_FEATURE_EVENT_LOG),
  /** Enables Delete actions for servers / databases / static users. */
  deletes: bool(import.meta.env.VITE_FEATURE_DELETES),
  /** Enables Role-Based Access Control gating in the UI. */
  rbac: bool(import.meta.env.VITE_FEATURE_RBAC),
  /** When true, an outbound audit-log POST is emitted for every write. */
  auditSink: bool(import.meta.env.VITE_FEATURE_AUDIT_SINK),
} as const;

export const env = {
  apiBaseUrl: required("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL),
  apiControllerPrefix: import.meta.env.VITE_API_CONTROLLER_PREFIX ?? "/My",
  appName: import.meta.env.VITE_APP_NAME ?? "Customer Admin Portal",
  /** Optional Sentry DSN. When set, error tracking initializes at startup. */
  sentryDsn: optional(import.meta.env.VITE_SENTRY_DSN),
  /** Optional environment label (e.g. "production", "staging"). */
  environment: optional(import.meta.env.VITE_ENVIRONMENT) ?? "development",
  /** Optional URL of the audit-log POST sink. Used only when features.auditSink is true. */
  auditSinkUrl: optional(import.meta.env.VITE_AUDIT_SINK_URL),
  /**
   * Idle inactivity threshold (minutes). After this much inactivity the
   * portal force-signs the operator out. Set `VITE_IDLE_TIMEOUT_MINUTES=0`
   * to disable. Default is 30 — generous enough for paperwork workflows
   * but tight enough to satisfy basic security review.
   */
  idleTimeoutMinutes: intInRange(
    import.meta.env.VITE_IDLE_TIMEOUT_MINUTES,
    30,
    0,
    24 * 60,
  ),
  /**
   * Warning window (minutes) before the hard idle sign-out. Default is 1
   * minute — long enough to give the user a chance to react, short enough
   * not to feel aggressive when they walk away.
   */
  idleWarnMinutes: intInRange(import.meta.env.VITE_IDLE_WARN_MINUTES, 1, 0, 30),
  /**
   * When true the SPA boots in *demo mode*: every API call is routed
   * through an in-memory adapter that returns realistic fixture data
   * (`src/demo/`), and the LoginPage probe trivially succeeds. Use for
   * demos / dry-runs without the ASP.NET backend running. Never set
   * this in production environment files.
   */
  demoMode: bool(import.meta.env.VITE_DEMO_MODE),
  features,
} as const;
