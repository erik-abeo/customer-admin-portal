import { describe, expect, it } from "vitest";

import { isApiCommandLine, shouldSweepAfterFailedStart } from "./cleanupPolicy";

describe("shouldSweepAfterFailedStart", () => {
  it("never sweeps when the test servers were not both verified", () => {
    // The check refused a container, or failed before it ran: whatever answered
    // may not be a test server at all.
    expect(shouldSweepAfterFailedStart(false, undefined)).toBe(false);
    expect(shouldSweepAfterFailedStart(false, "0")).toBe(false);
  });

  it("sweeps a start that failed after both servers were verified", () => {
    expect(shouldSweepAfterFailedStart(true, undefined)).toBe(true);
  });

  it("keeps everything when the run asked to", () => {
    expect(shouldSweepAfterFailedStart(true, "1")).toBe(false);
  });
});

describe("isApiCommandLine", () => {
  it("recognises dotnet running the API", () => {
    expect(
      isApiCommandLine(
        '"C:\\Program Files\\dotnet\\dotnet.exe" ClientRemoteDatabaseAccessAPI.dll --urls http://127.0.0.1:5199',
      ),
    ).toBe(true);
    expect(
      isApiCommandLine(
        "dotnet /tmp/cpm-portal-live-api-ab12/ClientRemoteDatabaseAccessAPI.dll",
      ),
    ).toBe(true);
  });

  it("refuses anything else that has reused the PID", () => {
    expect(isApiCommandLine("node server.js")).toBe(false);
    expect(isApiCommandLine("dotnet OtherService.dll")).toBe(false);
    expect(isApiCommandLine("")).toBe(false);
  });
});
