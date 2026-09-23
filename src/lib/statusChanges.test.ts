import { describe, expect, it } from "vitest";

import { changedStatuses } from "./statusChanges";

describe("changedStatuses", () => {
  it("names every record whose status moved, not only ones that finished", () => {
    const before = new Map<number, string | null>([
      [1, "planned"],
      [2, "copying"],
      [3, "verifying"],
      [4, "pending"],
    ]);
    const after = [
      { Id: 1, Status: "draining" },
      { Id: 2, Status: "copying" },
      { Id: 3, Status: "flipped" },
      { Id: 4, Status: "redeemed" },
    ];

    expect(changedStatuses(before, after)).toEqual([1, 3, 4]);
  });

  it("finds nothing on the first poll, or for a record not seen before", () => {
    expect(changedStatuses(new Map(), [{ Id: 1, Status: "settled" }])).toEqual([]);
    expect(
      changedStatuses(new Map([[1, "planned"]]), [{ Id: 2, Status: "failed" }]),
    ).toEqual([]);
  });

  it("counts a status becoming null as a change", () => {
    expect(
      changedStatuses(new Map([[1, "streaming"]]), [{ Id: 1, Status: null }]),
    ).toEqual([1]);
  });
});
