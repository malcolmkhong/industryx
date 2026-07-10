"use client";

// ============================================
// useSessionHeartbeat
// ============================================
// Wires the existing /api/game/heartbeat endpoint to the client so the
// server actually tracks online/offline status.
//
// Three lifecycle signals feed the server:
//   1. Every 30 s while the tab is visible and the user is authenticated,
//      POST /api/game/heartbeat with the latest gameTick/money/paused/speed
//      → upserts player_sessions.is_online=true. It does not advance
//      server_game_state.last_tick_at; tick settlement owns that cursor.
//   2. On pagehide (tab close, navigation, refresh), best-effort
//      DELETE /api/game/heartbeat via navigator.sendBeacon.
//      sendBeacon is the standard, browser-supported way to fire
//      a final request during unload — fetch+keepalive is unreliable
//      on actual tab close (Chrome throttles/loses it).
//   3. On visibilitychange→hidden, we still POST a final heartbeat
//      with keepalive (in case the user comes back soon) AND we do not
//      fire DELETE — server can still see the recent heartbeat, and we
//      don't want a spurious offline mark from a brief tab-switch.
//
// All signed-in profiles heartbeat — anonymous users included. Both
// anon and OAuth users have a Supabase session and a player_sessions
// row, so both need accurate online/offline tracking + offline
// progress reconciliation.
//
// Failure modes:
// Failure modes:
//   - Network error during POST: logged + retried on next 30s tick.
//   - 4xx/5xx response during DELETE: sendBeacon is fire-and-forget,
//     we cannot read the response. Don't crash, don't retry.
//   - User signs out: cleanup runs, no further heartbeats.
//   - Tab loads but stays hidden: pagehide won't fire later. We catch
//     this by also tagging a DELETE on visibilitychange→hidden as
//     fallback (low-priority, only if last heartbeat was >5 min ago).

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useGameStore } from "@/lib/game/store";

const POST_INTERVAL_MS = 30_000;
const VISIBILITY_HIDDEN_MS_THRESHOLD = 5 * 60_000; // 5 min

export function useSessionHeartbeat(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Single mutable container so the unload listeners always see the
  // latest values (functional setters + refs avoid stale closures).
  const lastPostAtRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Skip only when fully signed out (user === null) or on SSR.
    // Anonymous users (Supabase anon sign-in) DO have a row in
    // player_sessions — they accumulate real offline progress and need
    // accurate online/offline tracking just like any other user.
    if (typeof window === "undefined") return undefined;
    if (!userId) return undefined;

    let cancelled = false;

    const collectPayload = () => {
      const s = useGameStore.getState();
      return {
        gameTick: Number(s.gameTick) || 0,
        money: Number(s.money) || 0,
        paused: !!s.paused,
        gameSpeed: Number(s.gameSpeed) || 1,
      };
    };

    const postHeartbeat = async (): Promise<void> => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return; // don't ping while tab hidden
      try {
        const r = await fetch("/api/game/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(collectPayload()),
          credentials: "same-origin",
        });
        if (r.ok) {
          lastPostAtRef.current = Date.now();
        }
        // Non-2xx: leave lastPostAtRef as-is; next tick will retry.
      } catch {
        // Network down / aborted — next tick retries.
      }
    };

    const sendDisconnect = (): void => {
      if (cancelled) return;
      // sendBeacon is the standard way to fire-and-forget on pagehide.
      // Use a Blob with content-type so the server can read the body.
      // Empty body is fine — DELETE handler does not need fields.
      try {
        const blob = new Blob([""], { type: "application/json" });
        const ok = navigator.sendBeacon("/api/game/heartbeat", blob);
        if (!ok) {
          // Fallback for browsers that throttle / drop the beacon.
          // Use fetch+keepalive; the request may or may not survive unload.
          void fetch("/api/game/heartbeat", {
            method: "DELETE",
            credentials: "same-origin",
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // Older browsers without sendBeacon — best-effort fetch fallback.
        void fetch("/api/game/heartbeat", {
          method: "DELETE",
          credentials: "same-origin",
          keepalive: true,
        }).catch(() => {});
      }
    };

    const onPageHide = (): void => {
      sendDisconnect();
    };

    const onBeforeUnload = (): void => {
      // pagehide is preferred on modern browsers; beforeunload is the
      // legacy fallback. Both fire on tab close in most cases.
      sendDisconnect();
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        // If we just heartbeated recently, skip — let server infer offline
        // from staleness. Only DELETE if the gap is large enough that the
        // server's stale-detection would take a while to fire.
        const sinceLastPost = Date.now() - lastPostAtRef.current;
        if (sinceLastPost > VISIBILITY_HIDDEN_MS_THRESHOLD) {
          sendDisconnect();
        }
        return;
      }
      // Became visible again: post a heartbeat so server knows user
      // is back, then resume the periodic loop.
      void postHeartbeat();
    };

    // Initial beat (immediate — first POST right after auth, fires once)
    void postHeartbeat();

    intervalRef.current = setInterval(() => {
      void postHeartbeat();
    }, POST_INTERVAL_MS);

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Final disconnect when the hook unmounts (sign-out, navigation,
      // route change). Fire-and-forget; best-effort.
      sendDisconnect();
    };
  }, [userId]);
}
