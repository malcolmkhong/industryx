import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/game/store';

export interface OfflineProgressData {
  resources: Record<string, number>;
  money: number;
  ticksElapsed: number;
}

// On mount (after rehydration), calculates offline progress and shows the
// offline earnings dialog if the player earned anything while away. Idempotent
// via an internal ref so it only runs once per session.
export function useOfflineProgressCheck(): {
  offlineData: OfflineProgressData | null;
  setOfflineData: React.Dispatch<React.SetStateAction<OfflineProgressData | null>>;
  offlineDialogOpen: boolean;
  setOfflineDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
} {
  const [offlineData, setOfflineData] = useState<OfflineProgressData | null>(null);
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false);
  const gameTick = useGameStore(s => s.gameTick);
  const buildings = useGameStore(s => s.buildings);
  const calculateOfflineProgress = useGameStore(s => s.calculateOfflineProgress);
  const hasCheckedOffline = useRef(false);

  useEffect(() => {
    if (hasCheckedOffline.current) return;
    if (gameTick === 0 && buildings.length === 0) {
      hasCheckedOffline.current = true;
      return;
    }
    hasCheckedOffline.current = true;
    const result = calculateOfflineProgress();
    if (result && (result.money > 0 || Object.values(result.resources).some(v => v > 0))) {
      const timer = setTimeout(() => {
        setOfflineData(result);
        setOfflineDialogOpen(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [gameTick, buildings.length, calculateOfflineProgress]);

  return { offlineData, setOfflineData, offlineDialogOpen, setOfflineDialogOpen };
}
