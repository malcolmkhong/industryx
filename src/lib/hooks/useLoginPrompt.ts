'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useGameStore } from '@/lib/game/store';
import { useAuth } from '@/components/providers/AuthProvider';
import type { LoginPromptReason } from '@/components/game/LoginFloatingPanel';

// ─── Types ──────────────────────────────────────────────────────────────

interface LoginPromptState {
  /** Whether the login panel is open */
  isOpen: boolean;
  /** The reason the panel was triggered */
  reason: LoginPromptReason;
  /** Open the login panel with a specific reason */
  promptLogin: (reason: LoginPromptReason) => void;
  /** Close the login panel */
  closePrompt: () => void;
}

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
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<LoginPromptReason>('manual');
  const hasCheckedPrestige = useRef(false);

  // Game state selectors
  const gameTick = useGameStore(s => s.gameTick);
  const prestigeState = useGameStore(s => s.prestigeState);

  // Open prompt
  const promptLogin = useCallback((triggerReason: LoginPromptReason) => {
    // Don't prompt if already authenticated or auth is loading
    if (user || authLoading) return;
    setReason(triggerReason);
    setIsOpen(true);
  }, [user, authLoading]);

  // Close prompt
  const closePrompt = useCallback(() => {
    // Record dismissal for soft prompts
    if (reason === 'progress_milestone' || reason === 'prestige_available' || reason === 'playtime_reminder') {
      setDismissal(reason);
    }
    setIsOpen(false);
  }, [reason]);

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

  // Close prompt when user signs in
  useEffect(() => {
    if (user && isOpen) {
      // Use microtask to avoid synchronous setState in effect
      queueMicrotask(() => setIsOpen(false));
    }
  }, [user, isOpen]);

  return { isOpen, reason, promptLogin, closePrompt };
}
