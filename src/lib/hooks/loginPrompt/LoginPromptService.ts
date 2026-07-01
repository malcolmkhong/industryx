/**
 * LoginPromptService — Phase 7.
 *
 * Owns soft-prompt state and auto-trigger evaluation. Per Decision 18: orchestrator
 * owns auto-triggers; this service evaluates the conditions and emits BIND_REQUEST
 * events. Module-level `let progressMilestoneTriggered` is replaced by instance
 * state — survives identity swaps within a session, dies on page reload (by
 * design — re-derives from localStorage dismissal flags).
 *
 * Dismissal persistence stays in localStorage (must survive reload).
 */

import { useGameStore } from '@/lib/game/store';
import type { LoginPromptReason } from '@/components/game/LoginFloatingPanel';
import type { GameTab } from '@/lib/game/types';

const PROGRESS_MILESTONE_TICKS = 5000;
const PRESTIGE_THRESHOLD = 1_000_000;
const PLAYTIME_REMINDER_MS = 60 * 60 * 1000;
const PLAYTIME_CHECK_INTERVAL_MS = 60_000;

const DISMISSAL_KEY = 'factory-dominion-login-dismissals';

type DismissalRecord = Partial<Record<LoginPromptReason, boolean>>;

interface AutoTriggerInput {
  gameTick: number;
  totalMoneyEarned: number;
  isAnonymous: boolean;
  now: number;
}

type Listener = () => void;
type RequestLogin = (reason: LoginPromptReason, tab?: GameTab) => void;

export class LoginPromptService {
  private progressMilestoneTriggered = false;
  private prestigeChecked = false;
  private playtimeStartTime: number | null = null;
  private playtimeIntervalId: ReturnType<typeof setInterval> | null = null;
  private tickUnsubscribe: (() => void) | null = null;
  private requestLogin: RequestLogin | null = null;
  private listeners = new Set<Listener>();

  /**
   * Start auto-trigger evaluation. Called by orchestrator on READY anon state.
   * Subscribes to game store for tick + money events.
   */
  start(requestLogin: RequestLogin): void {
    if (this.tickUnsubscribe) return; // already running
    this.requestLogin = requestLogin;
    this.progressMilestoneTriggered = false;
    this.prestigeChecked = false;
    this.playtimeStartTime = Date.now();

    // Subscribe to game store for tick + totalMoneyEarned changes
    this.tickUnsubscribe = useGameStore.subscribe((state, prev) => {
      if (!this.requestLogin) return;
      if (state.gameTick === prev.gameTick) return;

      if (
        !this.progressMilestoneTriggered &&
        !this.isDismissed('progress_milestone') &&
        state.gameTick >= PROGRESS_MILESTONE_TICKS
      ) {
        this.progressMilestoneTriggered = true;
        setTimeout(() => this.requestLogin?.('progress_milestone'), 3000);
      }

      if (
        !this.prestigeChecked &&
        !this.isDismissed('prestige_available') &&
        state.totalMoneyEarned >= PRESTIGE_THRESHOLD &&
        state.gameTick > 0
      ) {
        this.prestigeChecked = true;
        setTimeout(() => this.requestLogin?.('prestige_available'), 2000);
      }
    });

    // Playtime reminder interval
    if (!this.playtimeIntervalId && !this.isDismissed('playtime_reminder')) {
      this.playtimeIntervalId = setInterval(() => {
        if (!this.playtimeStartTime) return;
        if (this.isDismissed('playtime_reminder')) {
          this.stopPlaytime();
          return;
        }
        if (Date.now() - this.playtimeStartTime >= PLAYTIME_REMINDER_MS) {
          this.stopPlaytime();
          this.requestLogin?.('playtime_reminder');
        }
      }, PLAYTIME_CHECK_INTERVAL_MS);
    }
  }

  /**
   * Stop auto-trigger evaluation. Called by orchestrator on auth transition + sign-out.
   */
  stop(): void {
    if (this.tickUnsubscribe) {
      this.tickUnsubscribe();
      this.tickUnsubscribe = null;
    }
    this.stopPlaytime();
    this.requestLogin = null;
  }

  /**
   * Reset trigger flags. Called by orchestrator on sign-out so the next
   * guest session re-derives trigger state from localStorage + dismissal flags.
   */
  reset(): void {
    this.stop();
    this.progressMilestoneTriggered = false;
    this.prestigeChecked = false;
    this.playtimeStartTime = null;
  }

  /**
   * Stop the playtime interval without resetting other trigger flags.
   */
  stopPlaytime(): void {
    if (this.playtimeIntervalId) {
      clearInterval(this.playtimeIntervalId);
      this.playtimeIntervalId = null;
    }
  }

  /**
   * Mark a reason as dismissed. Persists to localStorage.
   */
  dismiss(reason: LoginPromptReason): void {
    if (typeof window === 'undefined') return;
    let dismissals: DismissalRecord = {};
    try {
      const raw = localStorage.getItem(DISMISSAL_KEY);
      dismissals = raw ? JSON.parse(raw) : {};
    } catch {
      dismissals = {};
    }
    dismissals[reason] = true;
    try {
      localStorage.setItem(DISMISSAL_KEY, JSON.stringify(dismissals));
    } catch {
      // localStorage may be unavailable
    }
    this.notify();
  }

  isDismissed(reason: LoginPromptReason): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(DISMISSAL_KEY);
      if (!raw) return false;
      const dismissals = JSON.parse(raw) as DismissalRecord;
      return dismissals[reason] === true;
    } catch {
      return false;
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.warn('[LoginPromptService] listener threw:', err);
      }
    }
  }
}