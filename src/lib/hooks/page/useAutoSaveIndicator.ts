import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/game/store';

// Detects when the game state has been persisted (gameTick changes) and
// shows a brief "Saved" flash every 50 ticks. Exposes lastSaveTime for the
// header display.
export function useAutoSaveIndicator(): {
  lastSaveTime: number | null;
  showSavedFlash: boolean;
} {
  const gameTick = useGameStore(s => s.gameTick);
  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null);
  const [showSavedFlash, setShowSavedFlash] = useState(false);
  const prevGameTickRef = useRef(gameTick);

  useEffect(() => {
    if (prevGameTickRef.current !== gameTick && gameTick > 0) {
      if (gameTick % 50 === 0) {
        const now = Date.now();
        const t1 = setTimeout(() => setLastSaveTime(now), 0);
        const t2 = setTimeout(() => setShowSavedFlash(true), 0);
        const t3 = setTimeout(() => setShowSavedFlash(false), 2000);
        prevGameTickRef.current = gameTick;
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
      }
      prevGameTickRef.current = gameTick;
    }
  }, [gameTick]);

  return { lastSaveTime, showSavedFlash };
}
