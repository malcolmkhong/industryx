import { useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/game/store';

// Auto-opens the Guide tab for new players (no buildings yet, < 5 ticks).
// Idempotent via an internal ref.
export function useAutoOpenGuide(): void {
  const buildings = useGameStore(s => s.buildings);
  const gameTick = useGameStore(s => s.gameTick);
  const setActiveTab = useGameStore(s => s.setActiveTab);
  const hasAutoOpenedGuide = useRef(false);

  useEffect(() => {
    if (!hasAutoOpenedGuide.current && buildings.length === 0 && gameTick < 5) {
      hasAutoOpenedGuide.current = true;
      setActiveTab('guide');
    }
  }, [buildings.length, gameTick, setActiveTab]);
}
