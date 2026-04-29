/**
 * Role-based access control primitives.
 *
 * The backend communicates the signed-in admin's role via the
 * `X-Admin-Role` response header on every authenticated request. The
 * httpClient response interceptor extracts it and forwards it here via
 * `setCurrentRole`. Components read the resolved role with `useRole()`
 * and gate write affordances behind `<RequireRole role="admin">`.
 *
 * When `features.rbac` is OFF (default), `useRole()` returns "admin" so
 * every signed-in user has full write access — preserves today's
 * behavior. When the flag is ON and no header was returned, role
 * defaults to "viewer" (read-only) — fail-closed.
 */

import { features } from "@/config/env";

export type AdminRole = "admin" | "viewer";

export const ADMIN_ROLES: ReadonlyArray<AdminRole> = ["admin", "viewer"];

let currentRole: AdminRole | null = null;
const subscribers = new Set<(role: AdminRole) => void>();

export function setCurrentRole(role: AdminRole | string | null | undefined): void {
  const next = normalize(role);
  if (next === currentRole) return;
  currentRole = next;
  for (const sub of subscribers) {
    try {
      sub(resolved());
    } catch {
      // Subscribers must never break the auth pipeline.
    }
  }
}

function normalize(role: AdminRole | string | null | undefined): AdminRole | null {
  if (!role) return null;
  const lower = String(role).trim().toLowerCase();
  if (lower === "admin") return "admin";
  if (lower === "viewer" || lower === "readonly" || lower === "read-only") {
    return "viewer";
  }
  return null;
}

function resolved(): AdminRole {
  if (!features.rbac) return "admin";
  return currentRole ?? "viewer";
}

export function getCurrentRole(): AdminRole {
  return resolved();
}

export function subscribeRole(listener: (role: AdminRole) => void): () => void {
  subscribers.add(listener);
  // Fire immediately with current value so subscribers don't have to
  // call getCurrentRole separately.
  try {
    listener(resolved());
  } catch {
    // ignore
  }
  return () => subscribers.delete(listener);
}

export function canWrite(role: AdminRole): boolean {
  return role === "admin";
}
