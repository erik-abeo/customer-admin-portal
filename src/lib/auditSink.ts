/**
 * Optional audit-log backend sink.
 *
 * When `features.auditSink` is on AND `env.auditSinkUrl` is set, every
 * write captured by `auditLog.ts` is mirrored to the configured backend
 * endpoint via a fire-and-forget POST. Failures are swallowed (with a
 * dev console warning) so a temporarily unavailable audit service can
 * never break the user's primary flow.
 *
 * Backend contract is documented in `BACKEND-CONTRACT.md` under
 * "POST /admin-audit-log".
 */

import { type AuditEntry, subscribeAuditEntries } from "./auditLog";
import { env, features } from "@/config/env";
import { getAuthStrategy } from "@/api/httpClient";

let installed = false;
let lastForwardedTimestamp = "";

export function installAuditSink(): void {
  if (installed) return;
  if (!features.auditSink) return;
  if (!env.auditSinkUrl) {
    if (import.meta.env.DEV) {
      console.warn(
        "[auditSink] VITE_FEATURE_AUDIT_SINK is on but VITE_AUDIT_SINK_URL " +
          "is not set; sink is inactive.",
      );
    }
    return;
  }
  installed = true;

  subscribeAuditEntries((entries) => {
    const newest = entries[entries.length - 1];
    if (!newest) return;
    if (newest.timestamp === lastForwardedTimestamp) return;
    lastForwardedTimestamp = newest.timestamp;
    void forward(newest);
  });
}

async function forward(entry: AuditEntry): Promise<void> {
  if (!env.auditSinkUrl) return;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const strategy = getAuthStrategy();
    if (strategy) {
      Object.assign(headers, strategy.applyAuthHeaders({}));
    }
    await fetch(env.auditSinkUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(entry),
      keepalive: true,
    });
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[auditSink] Failed to POST audit entry", e);
    }
  }
}
