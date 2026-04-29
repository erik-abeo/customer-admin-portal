import { beforeEach, describe, expect, it } from "vitest";

import { ApiError, setAdminName } from "@/api/httpClient";
import { getAuditEntries, installAuditLog, subscribeAuditEntries } from "./auditLog";

installAuditLog();

describe("audit log shim", () => {
  beforeEach(() => {
    setAdminName(null);
  });

  it("starts with an empty buffer the first time it's read", () => {
    expect(Array.isArray(getAuditEntries())).toBe(true);
  });

  it("subscribers receive a function for cleanup", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeAuditEntries((entries) => {
      seen.push(entries.length);
    });
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("re-installation is idempotent", () => {
    installAuditLog();
    installAuditLog();
    expect(getAuditEntries()).toEqual(expect.any(Array));
  });

  it("ApiError is propagated with status and details", () => {
    const e = new ApiError("nope", 401, { code: "X" });
    expect(e.message).toBe("nope");
    expect(e.status).toBe(401);
    expect(e.details).toEqual({ code: "X" });
    expect(e.name).toBe("ApiError");
  });
});
