"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { applyServerState } from "@/lib/game/state/store";

const LIVE_TICK_INTERVAL_MS = 10_000;

interface LiveTickResponse {
  newState?: Record<string, unknown>;
  ticksApplied?: number;
}

export function useLiveServerTick(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!userId) return undefined;

    let cancelled = false;

    const settleServerTime = (): void => {
      if (cancelled || inFlightRef.current) return;
      if (document.visibilityState !== "visible") return;
      inFlightRef.current = true;
      void fetch("/api/game/state/live-tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "same-origin",
      })
        .then(async (response) => {
          if (!response.ok) return;

          const data = (await response.json()) as LiveTickResponse;
          if (
            typeof data.ticksApplied === "number" &&
            data.ticksApplied > 0 &&
            data.newState
          ) {
            applyServerState(data.newState);
          }
        })
        .catch((err: unknown) => {
          console.warn("[useLiveServerTick] server tick failed:", err);
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    settleServerTime();
    const interval = window.setInterval(() => {
      settleServerTime();
    }, LIVE_TICK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [userId]);
}
