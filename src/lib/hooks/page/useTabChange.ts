'use client';

import { useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useLoginPrompt } from '@/lib/hooks/useLoginPrompt';
import type { GameTab } from '@/lib/game/types';
import type { LoginPromptReason } from '@/components/game/LoginFloatingPanel';

const GUEST_GATED_TABS: Partial<Record<GameTab, LoginPromptReason>> = {
  leaderboard: 'leaderboard',
  tradePost: 'trading_post',
  megaprojects: 'mega_project',
  market: 'stock_market',
};

// Returns a stable tab-gate handler.
//
//   true  → caller may proceed with navigation (e.g. <Link> click, router.push)
//   false → caller must preventDefault / skip navigation; a login prompt was shown.
//
// Existing callers that ignore the return value keep working unchanged.
export function useTabChange(): (tab: GameTab) => boolean {
  const { user, isGuest, loading: authLoading } = useAuth();
  const { promptLogin } = useLoginPrompt();

  return useCallback((tab: GameTab): boolean => {
    const reason = GUEST_GATED_TABS[tab];
    if (reason && (isGuest || (!user && !authLoading))) {
      // Pass the tab so useLoginPrompt can replay navigation after sign-in.
      promptLogin(reason, tab);
      return false;
    }
    return true;
  }, [user, isGuest, authLoading, promptLogin]);
}
