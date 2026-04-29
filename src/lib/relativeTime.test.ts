import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./relativeTime";

describe("formatRelativeTime", () => {
  const now = new Date("2026-04-23T12:00:00Z");

  it("returns 'just now' for very recent times", () => {
    const t = new Date(now.getTime() - 2_000);
    expect(formatRelativeTime(t, now)).toBe("just now");
  });

  it("formats seconds", () => {
    const t = new Date(now.getTime() - 30_000);
    expect(formatRelativeTime(t, now)).toBe("30s ago");
  });

  it("formats minutes", () => {
    const t = new Date(now.getTime() - 5 * 60_000);
    expect(formatRelativeTime(t, now)).toBe("5m ago");
  });

  it("formats hours", () => {
    const t = new Date(now.getTime() - 3 * 60 * 60_000);
    expect(formatRelativeTime(t, now)).toBe("3h ago");
  });

  it("formats days for under a week", () => {
    const t = new Date(now.getTime() - 2 * 24 * 60 * 60_000);
    expect(formatRelativeTime(t, now)).toBe("2d ago");
  });

  it("falls back to a calendar date after a week", () => {
    const t = new Date("2026-03-01T12:00:00Z");
    const out = formatRelativeTime(t, now);
    expect(out).toMatch(/Mar/);
    expect(out).toMatch(/1/);
  });

  it("accepts ISO strings", () => {
    expect(formatRelativeTime(now.toISOString(), now)).toBe("just now");
  });
});
