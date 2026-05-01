import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getProgressCountForTests,
  resetProgressForTests,
  startProgress,
  stopProgress,
} from "./progressBar";

vi.mock("@mantine/nprogress", () => ({
  nprogress: {
    start: vi.fn(),
    complete: vi.fn(),
  },
}));

import { nprogress } from "@mantine/nprogress";

describe("progressBar refcount", () => {
  beforeEach(() => {
    resetProgressForTests();
    vi.mocked(nprogress.start).mockClear();
    vi.mocked(nprogress.complete).mockClear();
  });

  afterEach(() => {
    resetProgressForTests();
  });

  it("calls nprogress.start only on the first start", () => {
    startProgress();
    startProgress();
    startProgress();
    expect(nprogress.start).toHaveBeenCalledTimes(1);
    expect(getProgressCountForTests()).toBe(3);
  });

  it("calls nprogress.complete only when the count returns to zero", () => {
    startProgress();
    startProgress();
    stopProgress();
    expect(nprogress.complete).not.toHaveBeenCalled();

    stopProgress();
    expect(nprogress.complete).toHaveBeenCalledTimes(1);
    expect(getProgressCountForTests()).toBe(0);
  });

  it("ignores extra stop() calls past zero", () => {
    stopProgress();
    stopProgress();
    expect(nprogress.complete).not.toHaveBeenCalled();
    expect(getProgressCountForTests()).toBe(0);
  });

  it("handles interleaved consumers correctly", () => {
    // Consumer A starts.
    startProgress(); // 0 -> 1, start
    // Consumer B starts.
    startProgress(); // 1 -> 2
    // Consumer B finishes — bar must NOT hide because A is still active.
    stopProgress(); // 2 -> 1
    expect(nprogress.complete).not.toHaveBeenCalled();
    // Consumer A finishes — now bar hides.
    stopProgress(); // 1 -> 0, complete
    expect(nprogress.complete).toHaveBeenCalledTimes(1);
    // A new request immediately starts a fresh bar.
    startProgress();
    expect(nprogress.start).toHaveBeenCalledTimes(2);
  });

  it("resetProgressForTests force-clears state", () => {
    startProgress();
    startProgress();
    expect(getProgressCountForTests()).toBe(2);
    resetProgressForTests();
    expect(getProgressCountForTests()).toBe(0);
  });
});
