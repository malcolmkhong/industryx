// ============================================
// useGameTickLoop.ts (Phase 7: UI-only tick)
//
// Previous behavior: called `gameTickAction()` on a 1-second interval to
// advance client-side game state (production, payouts, etc). Phase 7 made
// the server the source of truth for tick progression (see
// src/lib/auth/applyElapsedTicks.ts), so client-side mutation is no longer
// needed.
//
// Current behavior: this hook triggers a UI re-render every second so that
// countdown bars, ticker numbers, and other animation-only displays stay
// smooth. It does NOT touch game state.
//
// The `gameTickAction()` function still exists in src/lib/game/actions/gameTick.ts
// and remains exported via the store for any future use (e.g., explicit
// "simulate offline progress" UI button). It is no longer wired to any
// auto-tick caller.
// ============================================

import { useEffect, useState } from "react";

export function useGameTickLoop(
  effectiveSpeed: number,
  paused: boolean,
): number {
  // Local display tick — incremented every second for UI animation only.
  const [displayTick, setDisplayTick] = useState(0);

  useEffect(() => {
    // When paused, no need to refresh UI on tick. Returns displayTick=0
    // until unpaused. The interval is 1000ms regardless of effectiveSpeed
    // since this hook no longer drives game state — only animation.
    if (paused) return;
    if (typeof document !== "undefined" && document.hidden) return;

    const id = setInterval(
      () => {
        setDisplayTick((prev) => prev + 1);
      },
      Math.max(50, 1000 / effectiveSpeed),
    );
    return () => clearInterval(id);
  }, [effectiveSpeed, paused]);

  return displayTick;
}
