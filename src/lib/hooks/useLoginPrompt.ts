'use client';

// Phase 7: Login prompt hook — passive facade.
//
// Auto-triggers (progress_milestone, prestige_available, playtime_reminder) live
// in LoginPromptService now. The orchestrator starts/stops the service via deps.
// The Zustand store still owns shared open/close state because LoginFloatingPanel
// + headers + tab handler all dispatch through the same `requestLogin` channel.
//
// Behavior change: 3 useEffects removed. Module-level `let progressMilestoneTriggered`
// replaced by service instance state. Dismissal persistence unchanged.

import { useCallback, useContext, createContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { create } from 'zustand';

import { useAuth } from '@/components/providers/AuthProvider';
import type { LoginPromptService } from "./loginPrompt/LoginPromptService";
import type { LoginPromptReason } from '@/components/game/LoginFloatingPanel';
import type { GameTab } from '@/lib/game/types';

interface LoginPromptState {
  isOpen: boolean;
  reason: LoginPromptReason;
  pendingTab: GameTab | null;
  promptLogin: (reason: LoginPromptReason, pendingTab?: GameTab | null) => void;
  closePrompt: () => void;
}

interface LoginPromptStore {
  isOpen: boolean;
  reason: LoginPromptReason;
  pendingTab: GameTab | null;
  open: (reason: LoginPromptReason, pendingTab?: GameTab | null) => void;
  close: () => void;
  consumePendingTab: () => GameTab | null;
}

const useLoginPromptStore = create<LoginPromptStore>((set, get) => ({
  isOpen: false,
  reason: 'manual',
  pendingTab: null,
  open: (reason, pendingTab) => set({ isOpen: true, reason, pendingTab: pendingTab ?? null }),
  close: () => set({ isOpen: false, pendingTab: null }),
  consumePendingTab: () => {
    const tab = get().pendingTab;
    if (tab) set({ pendingTab: null });
    return tab;
  },
}));

export { LoginPromptService } from './loginPrompt/LoginPromptService';

const LoginPromptServiceCtx = createContext<{ service: LoginPromptService } | null>(null);

export const LoginPromptServiceProvider = LoginPromptServiceCtx.Provider;

export function useLoginPrompt(): LoginPromptState {
  const ctx = useContext(LoginPromptServiceCtx);
  if (!ctx) {
    throw new Error('useLoginPrompt must be used within LoginPromptServiceProvider');
  }
  const { service } = ctx;
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const isOpen = useLoginPromptStore((s) => s.isOpen);
  const reason = useLoginPromptStore((s) => s.reason);
  const pendingTab = useLoginPromptStore((s) => s.pendingTab);
  const openPanel = useLoginPromptStore((s) => s.open);
  const closePanel = useLoginPromptStore((s) => s.close);
  const consumePendingTab = useLoginPromptStore((s) => s.consumePendingTab);

  const promptLogin = useCallback(
    (triggerReason: LoginPromptReason, tab?: GameTab | null) => {
      if ((user && !user.is_anonymous) || authLoading) return;
      openPanel(triggerReason, tab ?? null);
    },
    [user, authLoading, openPanel],
  );

  const closePrompt = useCallback(() => {
    const currentReason = useLoginPromptStore.getState().reason;
    if (
      currentReason === 'progress_milestone' ||
      currentReason === 'prestige_available' ||
      currentReason === 'playtime_reminder'
    ) {
      service.dismiss(currentReason);
    }
    closePanel();
  }, [service, closePanel]);

  // Sign-in replay: when user transitions to authenticated, close panel + replay pendingTab
  useEffect(() => {
    if (!user || user.is_anonymous) return;
    if (!isOpen) return;

    const tab = consumePendingTab();
    closePanel();
    if (tab) router.push(`/game/${tab}`);
  }, [user, isOpen, consumePendingTab, closePanel, router]);

  return { isOpen, reason, pendingTab, promptLogin, closePrompt };
}