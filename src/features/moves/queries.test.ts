import { describe, expect, it } from "vitest";

import { canCancelMove, isActiveMove, movesThatSettled } from "./queries";

describe("move status rules", () => {
  it("polls every phase that is still working", () => {
    for (const status of ["planned", "draining", "copying", "verifying"]) {
      expect(isActiveMove(status)).toBe(true);
    }
    for (const status of [
      "flipped",
      "settled",
      "failed",
      "cancelled",
      "rolled_back",
      null,
    ]) {
      expect(isActiveMove(status)).toBe(false);
    }
  });

  it("offers cancel only before anything has been copied", () => {
    expect(canCancelMove("planned")).toBe(true);
    expect(canCancelMove("draining")).toBe(true);
    expect(canCancelMove("copying")).toBe(false);
    expect(canCancelMove("verifying")).toBe(false);
    expect(canCancelMove(null)).toBe(false);
  });
});

describe("movesThatSettled", () => {
  it("names the moves that were active and no longer are", () => {
    const before = new Set([1, 2, 3]);
    const after = [
      { Id: 1, Status: "flipped" },
      { Id: 2, Status: "copying" },
      { Id: 3, Status: "cancelled" },
      // Never seen active, so nothing changed for it on this poll.
      { Id: 4, Status: "failed" },
    ];

    expect(movesThatSettled(before, after)).toEqual([1, 3]);
  });

  it("finds nothing on the first poll", () => {
    expect(movesThatSettled(new Set(), [{ Id: 1, Status: "settled" }])).toEqual([]);
  });
});
