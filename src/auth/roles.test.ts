import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  features: { rbac: true },
}));

import {
  canWrite,
  getCurrentRole,
  normalizeRole,
  setCurrentRole,
  subscribeRole,
} from "./roles";

describe("RBAC roles store", () => {
  afterEach(() => {
    setCurrentRole(null);
  });

  it("defaults to viewer (fail-closed) when RBAC is on and no role is set", () => {
    setCurrentRole(null);
    expect(getCurrentRole()).toBe("viewer");
  });

  it("normalizes 'Admin' / 'ADMIN' / 'admin' to 'admin'", () => {
    setCurrentRole("Admin");
    expect(getCurrentRole()).toBe("admin");
    setCurrentRole("ADMIN");
    expect(getCurrentRole()).toBe("admin");
    setCurrentRole("admin");
    expect(getCurrentRole()).toBe("admin");
  });

  it("downgrades an admin to viewer on 'readonly', 'read-only' or 'viewer'", () => {
    // From admin each time: starting from no role would read viewer whatever
    // the header did, since no role is viewer too.
    for (const header of ["readonly", "read-only", "viewer", "Read-Only"]) {
      setCurrentRole("admin");
      expect(getCurrentRole()).toBe("admin");
      setCurrentRole(header);
      expect(getCurrentRole()).toBe("viewer");
    }
  });

  it("recognizes the viewer aliases, rather than falling back on them as unknown", () => {
    // Unknown strings also resolve to viewer, so the store alone cannot tell
    // the two apart; the normalizer can.
    expect(normalizeRole("readonly")).toBe("viewer");
    expect(normalizeRole("read-only")).toBe("viewer");
    expect(normalizeRole("viewer")).toBe("viewer");
    expect(normalizeRole("totally-made-up")).toBeNull();
    expect(normalizeRole(null)).toBeNull();
  });

  it("falls back to viewer for unknown role strings (when RBAC on)", () => {
    setCurrentRole("totally-made-up");
    expect(getCurrentRole()).toBe("viewer");
  });

  it("notifies subscribers on role changes", () => {
    const seen: string[] = [];
    const unsub = subscribeRole((r) => seen.push(r));
    // Initial fire happens synchronously inside subscribe.
    expect(seen).toEqual(["viewer"]);
    setCurrentRole("admin");
    expect(seen).toEqual(["viewer", "admin"]);
    setCurrentRole("admin"); // no change → no event
    expect(seen).toEqual(["viewer", "admin"]);
    unsub();
    setCurrentRole("viewer");
    expect(seen).toEqual(["viewer", "admin"]);
  });

  it("canWrite() returns true only for admin", () => {
    expect(canWrite("admin")).toBe(true);
    expect(canWrite("viewer")).toBe(false);
  });
});
