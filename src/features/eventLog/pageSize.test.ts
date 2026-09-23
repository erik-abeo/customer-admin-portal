import { describe, expect, it } from "vitest";

import { parsePageSize } from "./pageSize";

describe("parsePageSize", () => {
  it("takes whole numbers from 10 to 500", () => {
    expect(parsePageSize(10)).toBe(10);
    expect(parsePageSize("250")).toBe(250);
    expect(parsePageSize(500)).toBe(500);
  });

  it("ignores a cleared field, which would otherwise become 0", () => {
    expect(parsePageSize("")).toBeNull();
    expect(parsePageSize(0)).toBeNull();
  });

  it("ignores anything out of range or fractional", () => {
    expect(parsePageSize(5)).toBeNull();
    expect(parsePageSize(501)).toBeNull();
    expect(parsePageSize(12.5)).toBeNull();
    expect(parsePageSize("abc")).toBeNull();
  });
});
