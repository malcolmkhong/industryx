'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { create } from 'zustand';
import { useGameStore } from '@/lib/game/store';
import { useAuth } from '@/components/providers/AuthProvider';
import type { LoginPromptReason } from '@/components/game/LoginFloatingPanel';
import type { GameTab } from '@/lib/game/types';

// ─── Types ──────────────────────────────────────────────────────────────

interface LoginPromptState {
  /** Whether the login panel is open */
  isOpen: boolean;
  /** The reason the panel was triggered */
  reason: LoginPromptReason;
  /**
   * Tab the user wanted to open but couldn't because they were a guest.
   * After successful sign-in we navigate here so the original intent isn't lost.
   */
  pendingTab: GameTab | null;
  /** Open the login panel with a specific reason (and optional pending tab) */
  promptLogin: (reason: LoginPromptReason, pendingTab?: GameTab | null) => void;
  /** Close the login panel */
  closePrompt: () => void;
}

// ─── Shared Store ───────────────────────────────────────────────────────
// The login panel open/close state MUST be shared across every caller of
// useLoginPrompt(). It is consumed in page.tsx (which renders the panel) but
// triggered from completely separate component trees — the header "Sign In" /
// "Bind Account" buttons and the guest-gated tab handler (useTabChange).
//
// Previously this lived in local useState, so each caller got its own isolated
// copy: the headers/tab handler flipped their own `isOpen` while the panel in
// page.tsx read a different one and never opened. Hoisting it into a Zustand
// store gives every caller a single source of truth.

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

// ─── Dismissal Tracking ─────────────────────────────────────────────────
// Track which soft prompts have been dismissed so we don't annoy users

const DISMISSAL_KEY = 'factory-dominion-login-dismissals';

interface DismissalRecord {
  progress_milestone?: boolean;
  prestige_available?: boolean;
  playtime_reminder?: boolean;
}

function getDismissals(): DismissalRecord {
  try {
    const raw = localStorage.getItem(DISMISSAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setDismissal(reason: LoginPromptReason) {
  const dismissals = getDismissals();
  dismissals[reason as keyof DismissalRecord] = true;
  try {
    localStorage.setItem(DISMISSAL_KEY, JSON.stringify(dismissals));
  } catch {
    // localStorage may be unavailable
  }
}

function isDismissed(reason: LoginPromptReason): boolean {
  const dismissals = getDismissals();
  return dismissals[reason as keyof DismissalRecord] === true;
}

// ─── Tick Thresholds ────────────────────────────────────────────────────

/** 5000 ticks ≈ 83 minutes at 1x speed — significant progress */
const PROGRESS_MILESTONE_TICKS = 5000;

/** Track whether we've already triggered the progress milestone prompt */
let progressMilestoneTriggered = false;

// ─── Hook ───────────────────────────────────────────────────────────────

export function useLoginPrompt(): LoginPromptState {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Shared open/close state (single source of truth across all callers)
  const isOpen = useLoginPromptStore(s => s.isOpen);
  const reason = useLoginPromptStore(s => s.reason);
  const pendingTab = useLoginPromptStore(s => s.pendingTab);
  const openPanel = useLoginPromptStore(s => s.open);
  const closePanel = useLoginPromptStore(s => s.close);
  const consumePendingTab = useLoginPromptStore(s => s.consumePendingTab);

  const hasCheckedPrestige = useRef(false);

  // Game state selectors
  const gameTick = useGameStore(s => s.gameTick);

  // Open prompt — accepts an optional pending tab the guest wanted to navigate to.
  // When the user signs in, we replay the navigation so they actually land where
  // they tried to go instead of being silently dumped back on the previous page.
  const promptLogin = useCallback((triggerReason: LoginPromptReason, tab?: GameTab | null) => {
    // Don't prompt if already fully authenticated (non-anonymous user) or auth is loading
    if ((user && !user.is_anonymous) || authLoading) return;
    openPanel(triggerReason, tab ?? null);
  }, [user, authLoading, openPanel]);

  // Close prompt
  const closePrompt = useCallback(() => {
    // Record dismissal for soft prompts (read current reason from the store)
    const currentReason = useLoginPromptStore.getState().reason;
    if (currentReason === 'progress_milestone' || currentReason === 'prestige_available' || currentReason === 'playtime_reminder') {
      setDismissal(currentReason);
    }
    closePanel();
  }, [closePanel]);

  // ── Auto-trigger: Progress Milestone ──
  useEffect(() => {
    if (user || authLoading || progressMilestoneTriggered) return;
    if (isDismissed('progress_milestone')) return;

    if (gameTick >= PROGRESS_MILESTONE_TICKS) {
      progressMilestoneTriggered = true;
      // Small delay to avoid competing with other on-mount effects
      const timer = setTimeout(() => {
        promptLogin('progress_milestone');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameTick, user, authLoading, promptLogin]);

  // ── Auto-trigger: Prestige Available ──
  useEffect(() => {
    if (user || authLoading || hasCheckedPrestige.current) return;
    if (isDismissed('prestige_available')) return;

    // Check if prestige is available (has enough totalMoneyEarned)
    const totalMoneyEarned = useGameStore.getState().totalMoneyEarned;
    const prestigeThreshold = 1_000_000; // First prestige available at $1M earned

    if (totalMoneyEarned >= prestigeThreshold && gameTick > 0) {
      hasCheckedPrestige.current = true;
      const timer = setTimeout(() => {
        promptLogin('prestige_available');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [gameTick, user, authLoading, promptLogin]);

  // ── Auto-trigger: Playtime Reminder (1 hour) ──
  useEffect(() => {
    if (user || authLoading) return;
    if (isDismissed('playtime_reminder')) return;

    // 1 hour at 1x speed ≈ 3600 ticks, but with speed multipliers it could be less real time
    // We check real elapsed time using a simple interval
    const PLAYTIME_REMINDER_MS = 60 * 60 * 1000; // 1 hour
    const startTime = Date.now();

    const checkInterval = setInterval(() => {
      if (user || isDismissed('playtime_reminder')) {
        clearInterval(checkInterval);
        return;
      }
      if (Date.now() - startTime >= PLAYTIME_REMINDER_MS) {
        clearInterval(checkInterval);
        promptLogin('playtime_reminder');
      }
    }, 60_000); // Check every minute

    return () => clearInterval(checkInterval);
  }, [user, authLoading, promptLogin]);

  // Close prompt when user signs in AND replay any pending gated-tab navigation.
  // If the user clicked a gated tab (market, leaderboard, tradePost, megaprojects)
  // while signed out, that click was preventDefault'd. We capture the intent in
  // `pendingTab` and replay it once auth transitions to a real account.
  useEffect(() => {
    if (!user || user.is_anonymous) return;
    if (!isOpen) return;

    queueMicrotask(() => {
      const tab = consumePendingTab();
      closePanel();
      if (tab) router.push(`/game/${tab}`);
    });
  }, [user, isOpen, closePanel, consumePendingTab, router]);

  return { isOpen, reason, pendingTab, promptLogin, closePrompt };
}
