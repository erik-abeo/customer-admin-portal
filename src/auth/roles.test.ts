import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  features: { rbac: true },
}));

import { canWrite, getCurrentRole, setCurrentRole, subscribeRole } from "./roles";

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

  it("treats 'readonly', 'read-only', 'viewer' all as viewer", () => {
    setCurrentRole("readonly");
    expect(getCurrentRole()).toBe("viewer");
    setCurrentRole("read-only");
    expect(getCurrentRole()).toBe("viewer");
    setCurrentRole("viewer");
    expect(getCurrentRole()).toBe("viewer");
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
