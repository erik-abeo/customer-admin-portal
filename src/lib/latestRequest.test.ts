import { describe, expect, it } from "vitest";

import { createLatestRequest } from "./latestRequest";

describe("createLatestRequest", () => {
  it("keeps only the most recent ticket current", () => {
    const requests = createLatestRequest();
    const first = requests.begin();
    expect(requests.isLatest(first)).toBe(true);
    const second = requests.begin();
    // The first request resolving late must not win.
    expect(requests.isLatest(first)).toBe(false);
    expect(requests.isLatest(second)).toBe(true);
  });
});
