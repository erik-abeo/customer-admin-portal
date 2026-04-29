import { addResponseListener, type ResponseEvent } from "@/api/httpClient";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * In-memory ring buffer of recent admin write actions, plus optional console
 * mirroring. Designed to be the single point we'd extend to POST entries to
 * a future `/My/admin-audit-log` backend endpoint without touching call
 * sites.
 */
export interface AuditEntry {
  timestamp: string;
  admin: string | null;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  durationMs: number;
  errorMessage?: string;
}

const MAX_ENTRIES = 200;
const buffer: AuditEntry[] = [];
const subscribers = new Set<(entries: ReadonlyArray<AuditEntry>) => void>();

function snapshot(): ReadonlyArray<AuditEntry> {
  return buffer.slice();
}

function record(event: ResponseEvent): void {
  if (!WRITE_METHODS.has(event.method)) return;
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    admin: event.admin,
    method: event.method,
    url: event.url,
    status: event.status,
    ok: event.ok,
    durationMs: Math.round(event.durationMs),
    errorMessage: event.error?.message,
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
  if (import.meta.env.DEV) {
    const tag = entry.ok ? "audit" : "audit-fail";
    console.info(
      `[${tag}] ${entry.method} ${entry.url} → ${entry.status} ` +
        `(${entry.durationMs}ms, admin=${entry.admin ?? "anonymous"})` +
        (entry.errorMessage ? ` — ${entry.errorMessage}` : ""),
    );
  }
  for (const sub of subscribers) {
    try {
      sub(snapshot());
    } catch {
      // Subscribers must never break the audit pipeline.
    }
  }
}

let installed = false;

export function installAuditLog(): void {
  if (installed) return;
  installed = true;
  addResponseListener(record);
}

export function getAuditEntries(): ReadonlyArray<AuditEntry> {
  return snapshot();
}

export function subscribeAuditEntries(
  listener: (entries: ReadonlyArray<AuditEntry>) => void,
): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}
