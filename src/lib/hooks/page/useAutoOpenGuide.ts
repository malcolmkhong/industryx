import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/game/store';

// Auto-opens the Guide route for new players (no buildings yet, < 5 ticks).
// Idempotent via an internal ref.
export function useAutoOpenGuide(): void {
  const router = useRouter();
  const buildings = useGameStore(s => s.buildings);
  const gameTick = useGameStore(s => s.gameTick);
  const hasAutoOpenedGuide = useRef(false);

  useEffect(() => {
    if (!hasAutoOpenedGuide.current && buildings.length === 0 && gameTick < 5) {
      hasAutoOpenedGuide.current = true;
      router.push('/game/guide');
    }
  }, [router, buildings.length, gameTick]);
}
