/**
 * `useIdleSignOut` tests.
 *
 * Uses fake timers + manual event dispatch to verify the warning and
 * sign-out fire on schedule and that activity resets the countdown.
 */
import { renderHook, act } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { useIdleSignOut } from "./useIdleSignOut";

describe("useIdleSignOut", () => {
  let onSignOut: ReturnType<typeof vi.fn>;
  let originalBroadcastChannel: typeof globalThis.BroadcastChannel | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    onSignOut = vi.fn();
    // BroadcastChannel exists in happy-dom but its postMessage may
    // schedule async work that pollutes other tests; stub it out for
    // deterministic timing.
    originalBroadcastChannel = globalThis.BroadcastChannel;
    // @ts-expect-error — stubbing global.
    globalThis.BroadcastChannel = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalBroadcastChannel !== undefined) {
      globalThis.BroadcastChannel = originalBroadcastChannel;
    }
  });

  it("is a no-op when disabled", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() =>
      useIdleSignOut({
        enabled: false,
        timeoutMinutes: 5,
        warnMinutes: 1,
        onSignOut,
      }),
    );
    const idleEvents = addSpy.mock.calls
      .map((c) => c[0])
      .filter((name) => name === "mousemove" || name === "keydown");
    expect(idleEvents).toHaveLength(0);
    addSpy.mockRestore();
  });

  it("is a no-op when timeoutMinutes is 0", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() =>
      useIdleSignOut({
        enabled: true,
        timeoutMinutes: 0,
        warnMinutes: 0,
        onSignOut,
      }),
    );
    const idleEvents = addSpy.mock.calls
      .map((c) => c[0])
      .filter((name) => name === "mousemove" || name === "keydown");
    expect(idleEvents).toHaveLength(0);
    addSpy.mockRestore();
  });

  it("calls onSignOut after the full timeout when no activity occurs", () => {
    renderHook(() =>
      useIdleSignOut({
        enabled: true,
        timeoutMinutes: 5,
        warnMinutes: 1,
        onSignOut,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(5 * 60_000 - 1);
    });
    expect(onSignOut).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("activity resets the countdown — sign-out is deferred", () => {
    renderHook(() =>
      useIdleSignOut({
        enabled: true,
        timeoutMinutes: 5,
        warnMinutes: 1,
        onSignOut,
      }),
    );

    // Advance most of the way then trigger activity.
    act(() => {
      vi.advanceTimersByTime(4 * 60_000);
      window.dispatchEvent(new MouseEvent("mousemove"));
    });
    // Now advance by another 4 minutes — should still be < timeout
    // because the timer was reset.
    act(() => {
      vi.advanceTimersByTime(4 * 60_000);
    });
    expect(onSignOut).not.toHaveBeenCalled();

    // Advance to the new deadline.
    act(() => {
      vi.advanceTimersByTime(60_001);
    });
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("clears its listeners and timers on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() =>
      useIdleSignOut({
        enabled: true,
        timeoutMinutes: 5,
        warnMinutes: 1,
        onSignOut,
      }),
    );

    unmount();
    const idleRemoved = removeSpy.mock.calls
      .map((c) => c[0])
      .filter((name) => name === "mousemove" || name === "keydown");
    expect(idleRemoved.length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(onSignOut).not.toHaveBeenCalled();

    (removeSpy as MockInstance).mockRestore();
  });
});
