"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { getOrchestratorStateSnapshot } from "@/lib/auth/orchestrator/registry";
import { createDeviceIdStorage } from "@/lib/auth/orchestrator/storage";
import { applyServerState } from "@/lib/game/state/store";
import type { ProductionSnapshot } from "@/lib/game/production/productionCalculator";
import { useCloudSync } from "@/lib/hooks/useCloudSync";

const LIVE_TICK_INTERVAL_MS = 10_000;
const LIVE_TICK_BACKOFF_MAX_MS = 160_000;

interface LiveTickResponse {
  newState?: Record<string, unknown>;
  ticksApplied?: number;
  /**
   * ProductionSnapshot matched to `newState`. `null` when no ticks were
   * applied (e.g., sub-second interval). When present, the store MUST
   * install it alongside `newState` so UI consumers refresh rates.
   */
  productionSnapshot?: ProductionSnapshot | null;
}

function readPersistentDeviceId(): string | null {
  try {
    const storage = typeof window === "undefined" ? null : window.localStorage;
    return createDeviceIdStorage(storage).get();
  } catch {
    return null;
  }
}

export function useLiveServerTick(): void {
  const { user, deviceId } = useAuth();
  const { lastSyncAt } = useCloudSync();
  const userId = user?.id ?? null;
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let cancelled = false;
    let timeoutHandle: number | null = null;

    // M3 audit fix: cross-tab live-tick dedup. Use a leader-election
    // BroadcastChannel so only one tab per browser polls the
    // /api/game/state/live-tick endpoint at any given time. The leader
    // claims via a "claim" message; on leader-loss (the leader tab
    // closes), the next "claim" round picks a new leader.
    let isLeader = true;
    let leaderChannel: BroadcastChannel | null = null;
    let onFocus: (() => void) | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      leaderChannel = new BroadcastChannel("industryx-tick-leader");
      const claim = () => {
        try {
          leaderChannel?.postMessage({ type: "claim", ts: Date.now() });
        } catch {
          // best-effort
        }
      };
      const election = () => {
        // All tabs reply with their lastClaim timestamp; lowest wins.
        // We use Date.now() so the most-recently-mounted tab is favored.
        claim();
        window.setTimeout(() => {
          if (cancelled) return;
          // If we haven't received a "claim" reply with a lower ts in
          // 250ms, we are the leader. If we did, stand down.
        }, 250);
      };
      leaderChannel.onmessage = (e) => {
        if (cancelled) return;
        const data = e.data as { type?: string; ts?: number };
        if (data?.type === "claim") {
          // The sender is claiming leadership. Stand down unless
          // they were mounted later than us (no good signal here, so
          // always stand down on first claim — subsequent claim rounds
          // re-elect). This gives the first-loaded tab priority.
          isLeader = false;
        }
      };
      // On focus, re-elect so the visible tab takes over.
      onFocus = () => {
        isLeader = true;
        election();
      };
      window.addEventListener("focus", onFocus);
      election();
    }
    // HIGH-1 fix (2026-07-14): exponential backoff on 429/503 so we do
    // not hammer the server (which is already over budget) and do not
    // waste client CPU + bandwidth. Reset on success. Other non-ok
    // responses (4xx client errors) do NOT escalate — they will not
    // resolve themselves by retrying faster.
    let failureStreak = 0;

    const scheduleNext = (delayMs: number): void => {
      if (cancelled) return;
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
      timeoutHandle = window.setTimeout(() => {
        timeoutHandle = null;
        void settleServerTime();
      }, delayMs);
    };

    const settleServerTime = async (): Promise<void> => {
      if (cancelled) return;
      if (inFlightRef.current) return;
      // M3 audit fix: only the leader tab polls. The other tabs skip
      // this round and reschedule, picking up leadership on focus or
      // on leader tab close.
      if (!isLeader) {
        scheduleNext(LIVE_TICK_INTERVAL_MS);
        return;
      }
      if (document.visibilityState !== "visible") {
        // Tab hidden — re-check shortly, do not advance backoff.
        scheduleNext(LIVE_TICK_INTERVAL_MS);
        return;
      }

      // H4 audit fix: skip live-tick on idle / just-saved users.
      // - lastSyncAt is bumped on every successful cloud load + save;
      //   if we just saved (lastSyncAt within the last 10s), the server
      //   state is already fresh — re-ticking would re-run
      //   applyElapsedServerTime for zero delta.
      // - Idle >5min since the last user interaction (per the lastSyncAt
      //   timestamp) means the player is AFK. Pause ticking to save
      //   server compute.
      if (lastSyncAt) {
        const msSinceSync = Date.now() - lastSyncAt;
        if (msSinceSync < LIVE_TICK_INTERVAL_MS) {
          scheduleNext(LIVE_TICK_INTERVAL_MS);
          return;
        }
        // AFK threshold: 5 minutes since last successful sync. The
        // server's offline-progress check will catch up on the next
        // tab focus, so we can skip per-tick polling in the meantime.
        const AFK_THRESHOLD_MS = 5 * 60_000;
        if (msSinceSync > AFK_THRESHOLD_MS) {
          scheduleNext(LIVE_TICK_INTERVAL_MS);
          return;
        }
      }

      // Task 7: barrier against offline-progress application. The cloud
      // sync service bumps `lastSyncAt` only after a successful load OR
      // save — so this gate ensures we don't apply a live-tick delta over
      // the freshly-bootstrapped state until hydration completes.
      if (!lastSyncAt) {
        scheduleNext(LIVE_TICK_INTERVAL_MS);
        return;
      }

      const snapshot = getOrchestratorStateSnapshot();
      const activeUserId = userId ?? snapshot.userId;
      const activeDeviceId =
        deviceId ?? snapshot.deviceId ?? readPersistentDeviceId();
      if (!activeUserId && !activeDeviceId) {
        scheduleNext(LIVE_TICK_INTERVAL_MS);
        return;
      }

      inFlightRef.current = true;
      // Definitely assigned after try/catch/finally: the try block sets
      // `status = response.status` and the catch block sets `status = 0`,
      // so every code path that reaches L122 (the if-statement below) has
      // already initialised `status`. Declaring the type as plain `number`
      // (no `| undefined`) lets TypeScript prove this via control flow.
      let status: number;
      try {
        const response = await fetch("/api/game/state/live-tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: activeDeviceId }),
          credentials: "same-origin",
        });
        status = response.status;
        if (response.ok) {
          failureStreak = 0;
          const data = (await response.json()) as LiveTickResponse;
          if (
            typeof data.ticksApplied === "number" &&
            data.ticksApplied > 0 &&
            data.newState
          ) {
            applyServerState(data.newState, data.productionSnapshot);
          }
        }
      } catch (err: unknown) {
        // Network error — treat like 5xx for backoff purposes.
        console.warn("[useLiveServerTick] server tick failed:", err);
        status = 0;
      } finally {
        // Safe under JS's single-threaded model: no other code runs between
        // the read at L64 (`if (inFlightRef.current) return`) and this write,
        // because the `setTimeout` in `scheduleNext` schedules a separate
        // task that cannot preempt the current try/finally. The `finally`
        // block also guarantees this runs even if the `try` throws, so the
        // next scheduled tick always sees `inFlightRef.current = false`.
        // eslint-disable-next-line require-atomic-updates
        inFlightRef.current = false;
      }

      // Compute next delay. 429 / 5xx / network errors escalate; everything
      // else (including 200) stays at the base interval.
      let nextDelay = LIVE_TICK_INTERVAL_MS;
      if (status === 429 || status === 0 || status >= 500) {
        failureStreak = Math.min(failureStreak + 1, 6);
        nextDelay = Math.min(
          LIVE_TICK_INTERVAL_MS * 2 ** failureStreak,
          LIVE_TICK_BACKOFF_MAX_MS,
        );
      }
      scheduleNext(nextDelay);
    };

    scheduleNext(0);

    return () => {
      cancelled = true;
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (leaderChannel) {
        try {
          if (onFocus) {
            window.removeEventListener("focus", onFocus);
            onFocus = null;
          }
          leaderChannel.close();
        } catch {
          // best-effort
        }
      }
    };
  }, [deviceId, userId, lastSyncAt]);
}
