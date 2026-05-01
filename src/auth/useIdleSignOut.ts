/**
 * `useIdleSignOut` — force sign-out after a configurable period of
 * inactivity, with a non-blocking warning toast that lets the operator
 * extend their session.
 *
 * Why client-side: the API uses a long-lived header API key today, so
 * idle revocation is the only way to limit blast radius if a workstation
 * is left unattended. Once Supertokens lands the server-side session
 * expiry will become the source of truth and this hook can become a
 * thin client of that.
 *
 * Activity signals (passive listeners — no UI lag):
 *   - `mousemove`, `mousedown`, `keydown`, `scroll`, `touchstart`,
 *     `wheel` on the window.
 *   - `visibilitychange` resets the timer when the operator returns
 *     after switching tabs.
 *   - Cross-tab BroadcastChannel: any tab's activity resets every tab,
 *     so a long-running tab in the background isn't accidentally
 *     signed out while the operator works in another portal tab.
 *
 * Timer model:
 *   1. Activity → reset countdown to `timeoutMs`.
 *   2. At `timeoutMs - warnMs` show a sticky warning notification with
 *      a "Stay signed in" action.
 *   3. At `timeoutMs` call `onSignOut`.
 *
 * The hook is a no-op when `timeoutMinutes` is 0.
 */
import { notifications } from "@mantine/notifications";
import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
] as const;

const NOTIFICATION_ID = "cap-idle-warning";
const BROADCAST_CHANNEL_NAME = "cap.activity.v1";
/**
 * Throttle window for activity broadcasts. We don't need millisecond
 * precision and the rebroadcast on every mousemove would be wasteful.
 */
const ACTIVITY_THROTTLE_MS = 1_000;

export interface UseIdleSignOutOptions {
  /** When false, the hook is inert (no listeners, no timers). */
  enabled: boolean;
  /** Hard idle threshold in minutes. 0 disables the hook entirely. */
  timeoutMinutes: number;
  /** Warning window in minutes (must be < `timeoutMinutes`). */
  warnMinutes: number;
  /** Invoked exactly once when the hard threshold is hit. */
  onSignOut: () => void;
}

export function useIdleSignOut({
  enabled,
  timeoutMinutes,
  warnMinutes,
  onSignOut,
}: UseIdleSignOutOptions): void {
  // We don't want stale closures over `onSignOut` after re-renders.
  const onSignOutRef = useRef(onSignOut);
  useEffect(() => {
    onSignOutRef.current = onSignOut;
  }, [onSignOut]);

  useEffect(() => {
    if (!enabled) return;
    if (timeoutMinutes <= 0) return;

    const timeoutMs = timeoutMinutes * 60_000;
    const warnMs = Math.min(warnMinutes * 60_000, Math.max(timeoutMs - 1_000, 0));
    const warnAtMs = Math.max(timeoutMs - warnMs, 1_000);

    let warnTimer: number | undefined;
    let signOutTimer: number | undefined;
    let lastBroadcastAt = 0;
    let warningShown = false;

    // Use BroadcastChannel when available so cross-tab activity counts
    // as activity. Falls back gracefully on Safari < 15.4 / IE-style
    // shells where it's missing — the per-tab listeners still fire.
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
        : null;

    const clearTimers = () => {
      if (warnTimer !== undefined) window.clearTimeout(warnTimer);
      if (signOutTimer !== undefined) window.clearTimeout(signOutTimer);
      warnTimer = undefined;
      signOutTimer = undefined;
    };

    const dismissWarning = () => {
      if (!warningShown) return;
      warningShown = false;
      notifications.hide(NOTIFICATION_ID);
    };

    const showWarning = () => {
      warningShown = true;
      const seconds = Math.max(1, Math.round(warnMs / 1000));
      notifications.show({
        id: NOTIFICATION_ID,
        title: "You'll be signed out soon",
        message: `For your security you will be signed out in ${seconds}s due to inactivity. Move the mouse or press a key to stay signed in.`,
        color: "yellow",
        autoClose: false,
        withCloseButton: false,
      });
    };

    const armTimers = () => {
      clearTimers();
      warnTimer = window.setTimeout(showWarning, warnAtMs);
      signOutTimer = window.setTimeout(() => {
        dismissWarning();
        clearTimers();
        onSignOutRef.current();
      }, timeoutMs);
    };

    const reset = (broadcast: boolean) => {
      dismissWarning();
      armTimers();
      if (broadcast && channel) {
        const now = Date.now();
        if (now - lastBroadcastAt >= ACTIVITY_THROTTLE_MS) {
          lastBroadcastAt = now;
          try {
            channel.postMessage({ type: "activity", at: now });
          } catch {
            // Channel may be closed mid-teardown; ignore.
          }
        }
      }
    };

    const onActivity = () => reset(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") reset(true);
    };
    const onChannelMessage = (event: MessageEvent) => {
      if (
        typeof event.data === "object" &&
        event.data !== null &&
        (event.data as { type?: unknown }).type === "activity"
      ) {
        // Don't rebroadcast or we'd ping-pong forever.
        reset(false);
      }
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    if (channel) {
      channel.addEventListener("message", onChannelMessage);
    }

    armTimers();

    return () => {
      clearTimers();
      dismissWarning();
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      if (channel) {
        channel.removeEventListener("message", onChannelMessage);
        channel.close();
      }
    };
  }, [enabled, timeoutMinutes, warnMinutes]);
}
