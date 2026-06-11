import { useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/game/store';

// Drives the main game tick loop. Calls gameTickAction() on an interval whose
// frequency matches the current effective game speed (1000 / speed ms, floor 50ms).
// Pauses when `paused` is true. gameTick is intentionally NOT in the dep array
// to avoid re-creating the interval on every tick (use getState() for stable refs).
export function useGameTickLoop(effectiveSpeed: number, paused: boolean): void {
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const interval = Math.max(50, 1000 / effectiveSpeed);
    if (tickRef.current) clearInterval(tickRef.current);
    if (!paused) {
      tickRef.current = setInterval(() => {
        useGameStore.getState().gameTickAction();
      }, interval);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [effectiveSpeed, paused]);
}
