/**
 * Optional audit-log backend sink.
 *
 * When `features.auditSink` is on AND `env.auditSinkUrl` is set, every
 * write captured by `auditLog.ts` is mirrored to the configured backend
 * endpoint via a fire-and-forget POST. Failures are swallowed (with a
 * dev console warning) so a temporarily unavailable audit service can
 * never break the user's primary flow.
 *
 * Each POST carries the same auth headers as an API call, which today means
 * the admin api-key. The sink therefore has to be trusted like the API itself.
 *
 * Backend contract is documented in `BACKEND-CONTRACT.md` under
 * "Optional audit-sink endpoint".
 */

import { type AuditEntry, subscribeAuditEntries } from "./auditLog";
import { env, features } from "@/config/env";
import { getAuthStrategy } from "@/api/httpClient";

let installed = false;
/**
 * Entries already sent, by identity. Two writes finishing in the same
 * millisecond share a timestamp, so the timestamp cannot tell them apart; the
 * buffer hands out the same entry objects in every snapshot, so identity can.
 */
const forwarded = new WeakSet<AuditEntry>();

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
    for (const entry of entries) {
      if (forwarded.has(entry)) continue;
      forwarded.add(entry);
      void forward(entry);
    }
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
