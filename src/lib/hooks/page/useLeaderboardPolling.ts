"use client";

/**
 * useLeaderboardPolling — shared backoff-aware polling hook.
 *
 * P2-12 (BUILDING_PRODUCTION_AUDIT §10.6 P2, 2026-07-16):
 *   LeaderboardPanel previously owned a `setInterval(fetch, 30_000)` that
 *   ran regardless of tab visibility and had no failure backoff. A 429/503
 *   during a service incident would amplify load because every mounted
 *   leaderboard kept polling on a fixed interval.
 *
 *   This hook centralizes the polling pattern so any panel that needs
 *   recurring data refresh can opt into the same behavior:
 *     - visibility-aware (pauses while the tab is hidden)
 *     - exponential backoff on failure (10s → 20s → 40s … cap 160s)
 *     - resets on success
 *     - cleanup on unmount
 *
 *   Mirrors `useLiveServerTick` without coupling to a specific endpoint.
 */
import { useEffect, useRef } from "react";

const BASE_INTERVAL_MS = 30_000;
const BACKOFF_MAX_MS = 160_000;

export function useLeaderboardPolling(
  fetcher: () => Promise<void>,
  baseIntervalMs: number = BASE_INTERVAL_MS,
): void {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let cancelled = false;
    let timeoutHandle: number | null = null;
    let failureStreak = 0;

    const scheduleNext = (delayMs: number): void => {
      if (cancelled) return;
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
      timeoutHandle = window.setTimeout(() => {
        timeoutHandle = null;
        void pollOnce();
      }, delayMs);
    };

    const pollOnce = async (): Promise<void> => {
      if (cancelled) return;
      if (inFlightRef.current) return;
      if (document.visibilityState !== "visible") {
        scheduleNext(baseIntervalMs);
        return;
      }

      inFlightRef.current = true;
      try {
        await fetcherRef.current();
        failureStreak = 0;
      } catch {
        failureStreak = Math.min(failureStreak + 1, 6);
      } finally {
        inFlightRef.current = false;
      }

      let nextDelay = baseIntervalMs;
      if (failureStreak > 0) {
        nextDelay = Math.min(baseIntervalMs * 2 ** failureStreak, BACKOFF_MAX_MS);
      }
      scheduleNext(nextDelay);
    };

    scheduleNext(0);

    return () => {
      cancelled = true;
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    };
  }, [baseIntervalMs]);
}
