/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_API_CONTROLLER_PREFIX?: string;
  readonly VITE_APP_NAME?: string;

  // Feature flags (string "true"/"1"/"yes"/"on" enables).
  readonly VITE_FEATURE_DUMPS?: string;
  readonly VITE_FEATURE_EVENT_LOG?: string;
  readonly VITE_FEATURE_DELETES?: string;
  readonly VITE_FEATURE_RBAC?: string;
  readonly VITE_FEATURE_AUDIT_SINK?: string;

  // Operational integrations (all optional).
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_ENVIRONMENT?: string;
  readonly VITE_AUDIT_SINK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;

declare module "@fontsource-variable/inter";
declare module "@fontsource-variable/jetbrains-mono";
