import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/game/store";

// Drives the main game tick loop. Calls gameTickAction() on an interval whose
// frequency matches the current effective game speed (1000 / speed ms, floor 50ms).
// Pauses when `paused` is true OR when the document is hidden (saves battery/CPU
// on backgrounded tabs). gameTick is intentionally NOT in the dep array
// to avoid re-creating the interval on every tick (use getState() for stable refs).
export function useGameTickLoop(effectiveSpeed: number, paused: boolean): void {
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hiddenRef = useRef<boolean>(false);

  // Track document visibility — sets a ref so the main effect can read it
  // without needing visibility in its dependency array.
  useEffect(() => {
    const update = () => {
      hiddenRef.current = typeof document !== "undefined" && document.hidden;
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const interval = Math.max(50, 1000 / effectiveSpeed);
    if (tickRef.current) clearInterval(tickRef.current);
    // Don't tick if paused or if the tab is backgrounded.
    if (paused || hiddenRef.current) return;
    tickRef.current = setInterval(() => {
      // Belt-and-suspenders: re-check hidden at fire time, in case visibility
      // changed between effect setup and interval tick.
      if (hiddenRef.current) return;
      useGameStore.getState().gameTickAction();
    }, interval);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [effectiveSpeed, paused]);
}
