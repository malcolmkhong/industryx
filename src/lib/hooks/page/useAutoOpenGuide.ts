import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/game/state/store';

// Auto-opens the Guide route for new players from the default dashboard entry.
// It must not override explicit navigation to other game routes.
export function useAutoOpenGuide(): void {
  const router = useRouter();
  const pathname = usePathname();
  const buildings = useGameStore(s => s.buildings);
  const gameTick = useGameStore(s => s.gameTick);
  const hydrated = useGameStore(s => s.hydrated);
  const hasAutoOpenedGuide = useRef(false);

  useEffect(() => {
    const currentPath =
      typeof window === 'undefined' ? pathname : window.location.pathname;
    const isDashboardEntry = currentPath === '/game/dashboard';
    if (
      !hasAutoOpenedGuide.current &&
      hydrated &&
      isDashboardEntry &&
      buildings.length === 0 &&
      gameTick < 5
    ) {
      hasAutoOpenedGuide.current = true;
      router.push('/game/guide');
    }
  }, [router, pathname, hydrated, buildings.length, gameTick]);
}
