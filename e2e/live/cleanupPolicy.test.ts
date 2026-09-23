import { describe, expect, it } from "vitest";

import { shouldSweepAfterFailedStart } from "./cleanupPolicy";

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
