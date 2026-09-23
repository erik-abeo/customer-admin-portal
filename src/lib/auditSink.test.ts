import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuditEntry } from "./auditLog";

let listener: ((entries: ReadonlyArray<AuditEntry>) => void) | undefined;

vi.mock("./auditLog", () => ({
  subscribeAuditEntries: (fn: (entries: ReadonlyArray<AuditEntry>) => void) => {
    listener = fn;
    return () => undefined;
  },
}));
vi.mock("@/config/env", () => ({
  features: { auditSink: true },
  env: { auditSinkUrl: "https://audit.example/sink" },
}));
vi.mock("@/api/httpClient", () => ({
  getAuthStrategy: () => ({
    applyAuthHeaders: () => ({ "api-key": "admin-key" }),
  }),
}));

const entry = (url: string): AuditEntry => ({
  timestamp: "2026-09-23T10:00:00.000Z",
  admin: "erik",
  method: "POST",
  url,
  status: 200,
  ok: true,
  durationMs: 5,
});

describe("audit sink", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards each entry once, even when two share a timestamp", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const { installAuditSink } = await import("./auditSink");
    installAuditSink();

    const first = entry("/create-user");
    const second = entry("/update-user");
    listener!([first]);
    listener!([first, second]);
    listener!([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).url);
    expect(bodies).toEqual(["/create-user", "/update-user"]);
    // What the contract warns about: the sink receives the admin key.
    expect(fetchMock.mock.calls[0][1].headers["api-key"]).toBe("admin-key");
  });
});
