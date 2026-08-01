import { useEffect, useState } from "react";

/**
 * Returns a monotonically-incrementing counter that advances every 1000ms
 * while the tab is visible. Components use this to drive per-second
 * re-renders for countdown displays and the world clock — both derive
 * from `gameTick` which only updates on server pushes (every ~10s).
 *
 * The returned value is a `number` (not `Date.now()`) so consumers don't
 * accidentally introduce a client-clock dependency. Each tick increments
 * by 1; first call returns 0.
 *
 * Pauses when the tab is hidden so background tabs don't waste CPU. The
 * counter resumes on visibility change.
 *
 * NOT used for any server-authoritative logic — display only.
 */
export function usePerSecondTick(intervalMs: number = 1000): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let cancelled = false;

    const startInterval = (): (() => void) => {
      if (document.visibilityState !== "visible") return () => {};
      const id = window.setInterval(() => {
        if (cancelled) return;
        setTick((t) => t + 1);
      }, intervalMs);
      return () => window.clearInterval(id);
    };

    let cleanup = startInterval();
    const onVisibilityChange = (): void => {
      cleanup();
      cleanup = startInterval();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      cleanup();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);

  return tick;
}