import { useCallback } from 'react';
import { useGameStore } from '@/lib/game/store';
import { useAuth } from '@/components/providers/AuthProvider';
import { useLoginPrompt } from '@/lib/hooks/useLoginPrompt';
import type { GameTab } from '@/lib/game/types';
import type { LoginPromptReason } from '@/components/game/LoginFloatingPanel';

const GUEST_GATED_TABS: Partial<Record<GameTab, LoginPromptReason>> = {
  leaderboard: 'leaderboard',
  tradePost: 'trading_post',
  megaprojects: 'mega_project',
};

// Returns a stable tab-change handler that intercepts cloud-required tabs
// (leaderboard, trading post, mega projects) for guest users and prompts
// login instead of navigating.
export function useTabChange(): (tab: GameTab) => void {
  const setActiveTab = useGameStore(s => s.setActiveTab);
  const { user, isGuest, loading: authLoading } = useAuth();
  const { promptLogin } = useLoginPrompt();

  return useCallback((tab: GameTab) => {
    const reason = GUEST_GATED_TABS[tab];
    if (reason && (isGuest || (!user && !authLoading))) {
      promptLogin(reason);
      return;
    }
    setActiveTab(tab);
  }, [user, isGuest, authLoading, promptLogin, setActiveTab]);
}
