import { useCallback } from 'react';
import { useGameStore } from '@/lib/game/store';
import { useAuth } from '@/components/providers/AuthProvider';
import { useLoginPrompt } from '@/lib/hooks/useLoginPrompt';
import type { GameTab } from '@/lib/game/types';

const GUEST_GATED_TABS: Record<string, 'leaderboard' | 'trading_post' | 'mega_project'> = {
  leaderboard: 'leaderboard',
  tradePost: 'trading_post',
  megaprojects: 'mega_project',
};

const GUEST_TAB_REASON_MAP: Record<string, 'leaderboard' | 'trading_post' | 'mega_project'> = {
  leaderboard: 'leaderboard',
  tradePost: 'trading_post',
  megaprojects: 'mega_project',
};

// Returns a stable tab-change handler that intercepts cloud-required tabs
// (leaderboard, trading post, mega projects) for guest users and prompts
// login instead of navigating.
export function useTabChange(): (tab: GameTab) => void {
  const setActiveTab = useGameStore(s => s.setActiveTab);
  const { user, loading: authLoading } = useAuth();
  const { promptLogin } = useLoginPrompt();

  return useCallback((tab: GameTab) => {
    if (!user && !authLoading && GUEST_GATED_TABS[tab]) {
      promptLogin(GUEST_TAB_REASON_MAP[tab]);
      return;
    }
    setActiveTab(tab);
  }, [user, authLoading, promptLogin, setActiveTab]);
}
