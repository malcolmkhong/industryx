'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { GameTab } from '@/lib/game/types';
import { useTabChange } from '@/lib/hooks/page/useTabChange';

function gameTabHref(tab: GameTab): string {
  return `/game/${tab}`;
}

// Returns a stable handler that gates + navigates to a game tab.
// Use this from non-Link contexts (keyboard shortcuts, programmatic nav, FAB).
export function useNavigateToTab(): (tab: GameTab) => void {
  const router = useRouter();
  const handleTabChange = useTabChange();
  return useCallback(
    (tab: GameTab) => {
      if (handleTabChange(tab)) {
        router.push(gameTabHref(tab));
      }
    },
    [router, handleTabChange],
  );
}
