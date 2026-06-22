'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  Cloud,
  Trophy,
  ArrowRightLeft,
  Building2,
  Shield,
  X,
  Sparkles,
  Loader2,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  Check,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────

export type LoginPromptReason =
  | 'cloud_save'       // Guest clicked "Save to Cloud"
  | 'cloud_load'       // Guest clicked "Load from Cloud"
  | 'leaderboard'      // Guest opened Leaderboard tab
  | 'trading_post'     // Guest opened Trading Post tab
  | 'mega_project'     // Guest opened Mega Projects tab
  | 'stock_market'     // Guest opened Stock Market tab
  | 'progress_milestone' // After 5000 ticks — significant progress at risk
  | 'prestige_available' // Prestige became available — secure your data
  | 'playtime_reminder'  // After 1 hour — one-time gentle nudge
  | 'manual'           // User clicked Sign In / Bind Account button
  | 'merge_conflict'   // Phase 1.5: guest linked to Google with progress on both sides
  | 'merge_confirm_keep_guest'   // Phase 1.5: confirmation step before Keep Guest
  | 'merge_confirm_keep_google'  // Phase 1.5: confirmation step before Keep Google
  | 'merge_success'    // Phase 1.5: merge completed, show receipt
  | 'merge_failure';   // Phase 1.5: merge failed, show retry

export type PromptMode = 'hard_gate' | 'soft_prompt' | 'merge';

export interface MergePreview {
  guest: {
    user_id: string;
    display_name: string;
    money: number;
    total_money_earned: number;
    game_tick: number;
    buildings_count: number;
    is_guest: boolean;
  };
  google: {
    user_id: string;
    display_name: string;
    money: number;
    total_money_earned: number;
    game_tick: number;
    buildings_count: number;
    is_guest: boolean;
  };
}

interface LoginFloatingPanelProps {
  /** Whether the panel is visible */
  open: boolean;
  /** Why the panel was triggered */
  reason: LoginPromptReason;
  /** Close the panel (only works for soft prompts) */
  onClose: () => void;
  /** Callback after successful sign-in initiation */
  onSignInStart?: () => void;
  /** Phase 1.5.3: Merge preview data (for merge_conflict reason) */
  mergePreview?: MergePreview | null;
  /** Phase 1.5.3: Merge operation id */
  mergeOperationId?: string | null;
  /** Phase 1.5.3: Is merge currently executing */
  isMergeConfirming?: boolean;
  /** Phase 1.5.3: Merge result state */
  mergeResult?: 'idle' | 'success' | 'failure';
  /** Phase 1.5.3: Merge receipt id (on success) */
  mergeReceiptId?: string | null;
  /** Phase 1.5.3: Merge error message (on failure) */
  mergeError?: string | null;
  /** Phase 1.5.3: Confirm merge with preference */
  onMergeConfirm?: (preference: 'keep_guest' | 'keep_google') => void;
  /** Phase 1.5.3: Cancel merge */
  onMergeCancel?: () => void;
  /** Phase 1.5.3: Close merge result dialog */
  onMergeClose?: () => void;
  /** Phase 1.5.3: Retry merge after failure */
  onMergeRetry?: () => void;
}

// ─── Reason Config ──────────────────────────────────────────────────────

interface ReasonConfig {
  mode: PromptMode;
  title: string;
  description: string;
  icon: React.ReactNode;
  benefits: string[];
  urgencyText?: string;
  dismissible: boolean;
}

const REASON_CONFIGS: Record<LoginPromptReason, ReasonConfig> = {
  cloud_save: {
    mode: 'hard_gate',
    title: 'Cloud Save Requires Account',
    description: 'To save your progress to the cloud, you need to sign in. This protects your empire from browser data loss.',
    icon: <Cloud className="w-5 h-5 text-brand" />,
    benefits: [
      'Save progress across devices',
      'Automatic cloud backup',
      'Never lose your factory',
    ],
    urgencyText: 'Your progress is only stored locally right now',
    dismissible: true, // Allow dismiss but show warning
  },
  cloud_load: {
    mode: 'hard_gate',
    title: 'Cloud Load Requires Account',
    description: 'Loading from the cloud requires authentication to verify your save data.',
    icon: <Cloud className="w-5 h-5 text-brand" />,
    benefits: [
      'Load progress from any device',
      'Restore after browser clear',
      'Continue on mobile/desktop',
    ],
    urgencyText: 'Sign in to access your cloud saves',
    dismissible: true,
  },
  leaderboard: {
    mode: 'hard_gate',
    title: 'Leaderboard Requires Account',
    description: 'To compete on the leaderboard and show off your industrial empire, you need an account.',
    icon: <Trophy className="w-5 h-5 text-warning" />,
    benefits: [
      'Compete for top rankings',
      'Show off your empire stats',
      'Track your global position',
    ],
    urgencyText: 'See how you rank against other players',
    dismissible: true,
  },
  trading_post: {
    mode: 'hard_gate',
    title: 'Trading Post Requires Account',
    description: 'Player-to-player trading requires authentication to prevent fraud and protect both parties.',
    icon: <ArrowRightLeft className="w-5 h-5 text-success" />,
    benefits: [
      'Trade resources with other players',
      'Get better deals than the market',
      'Build your trading reputation',
    ],
    urgencyText: 'Join the trading community',
    dismissible: true,
  },
  mega_project: {
    mode: 'hard_gate',
    title: 'Mega Projects Require Account',
    description: 'Global mega projects are collaborative efforts. Sign in to contribute and earn exclusive rewards.',
    icon: <Building2 className="w-5 h-5 text-research" />,
    benefits: [
      'Contribute to global projects',
      'Earn exclusive mega project rewards',
      'Leave your mark on the world',
    ],
    urgencyText: 'Help build something massive',
    dismissible: true,
  },
  progress_milestone: {
    mode: 'soft_prompt',
    title: 'Protect Your Progress!',
    description: 'You\'ve been building for a while. Don\'t risk losing everything to a browser clear or accident!',
    icon: <Shield className="w-5 h-5 text-success" />,
    benefits: [
      'Cloud backup — never lose progress',
      'Play on any device',
      'Unlock leaderboard & trading',
    ],
    urgencyText: 'Your empire is worth protecting',
    dismissible: true,
  },
  prestige_available: {
    mode: 'soft_prompt',
    title: 'Prestige Wants Protection!',
    description: 'Prestige is a major milestone! Sign in to secure your Corporation Points and ensure they\'re never lost.',
    icon: <Sparkles className="w-5 h-5 text-premium" />,
    benefits: [
      'Secure your Corporation Points',
      'Keep prestige bonuses safe',
      'Cloud backup for peace of mind',
    ],
    urgencyText: 'Don\'t risk losing prestige progress!',
    dismissible: true,
  },
  playtime_reminder: {
    mode: 'soft_prompt',
    title: 'Quick Sign-In Suggestion',
    description: 'You\'ve been playing for a while! Signing in takes seconds and keeps your factory safe forever.',
    icon: <Shield className="w-5 h-5 text-brand" />,
    benefits: [
      'One-click Google sign-in',
      'Your progress stays safe',
      'Play on any device later',
    ],
    dismissible: true,
  },
  manual: {
    mode: 'soft_prompt',
    title: 'Sign In to IndustriaX',
    description: 'Sign in with your Google account to unlock cloud features and protect your industrial empire.',
    icon: <Cloud className="w-5 h-5 text-brand" />,
    benefits: [
      'Cloud save & load',
      'Leaderboard rankings',
      'Player trading',
      'Cross-device play',
    ],
    dismissible: true,
  },
  stock_market: {
    mode: 'hard_gate',
    title: 'Stock Market Requires Account',
    description: 'Trading on the stock market requires a Google account to prevent fraud and protect your investments.',
    icon: <TrendingUp className="w-5 h-5 text-success" />,
    benefits: [
      'Trade resources for profit',
      'Build your trading portfolio',
      'Compete with other players',
    ],
    urgencyText: 'Bind Account to access the stock market',
    dismissible: true,
  },
  merge_conflict: {
    mode: 'merge',
    title: 'Account Conflict Detected',
    description: 'Choose which profile to keep. Only one profile will remain active.',
    icon: <ArrowRightLeft className="w-5 h-5 text-warning" />,
    benefits: [],
    dismissible: false,
  },
  merge_confirm_keep_guest: {
    mode: 'merge',
    title: 'Keep Guest Profile?',
    description: 'Your guest profile will become the surviving account. The Google account access will be attached to it.',
    icon: <Shield className="w-5 h-5 text-success" />,
    benefits: [],
    dismissible: true,
  },
  merge_confirm_keep_google: {
    mode: 'merge',
    title: 'Keep Google Profile?',
    description: 'Your Google profile will become the surviving account. The guest profile will be archived.',
    icon: <Cloud className="w-5 h-5 text-brand" />,
    benefits: [],
    dismissible: true,
  },
  merge_success: {
    mode: 'merge',
    title: 'Profile Resolution Complete',
    description: 'Your accounts have been merged successfully.',
    icon: <Check className="w-5 h-5 text-success" />,
    benefits: [],
    dismissible: false,
  },
  merge_failure: {
    mode: 'merge',
    title: 'Conflict Resolution Failed',
    description: 'Nothing was changed. Please retry.',
    icon: <AlertTriangle className="w-5 h-5 text-danger" />,
    benefits: [],
    dismissible: true,
  },
};

// ─── Component ──────────────────────────────────────────────────────────

export function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px] py-0.5">
      <span className="text-muted-label">{label}</span>
      <span className="text-subtle font-mono">{value}</span>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function getSignInErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return "We couldn't sign you in. Please try again.";
  }
  const msg = err.message.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout') || msg.includes('failed to')) {
    return 'Connection lost. Please check your network and try again.';
  }
  if (msg.includes('provider') && msg.includes('not enabled')) {
    return 'Google sign-in is currently unavailable. Please try again later.';
  }
  if (msg.includes('redirect') || msg.includes('uri') || msg.includes('mismatch')) {
    return 'Sign-in is misconfigured. Please refresh the page or contact support.';
  }
  if (msg.includes('popup') || msg.includes('blocked')) {
    return 'Your browser blocked the sign-in window. Please allow popups for this site and try again.';
  }
  if (msg.includes('cancelled') || msg.includes('canceled') || msg.includes('closed')) {
    return 'Sign-in was cancelled. You can try again anytime.';
  }
  if (msg.includes('access_denied') || msg.includes('denied')) {
    return 'Access was denied. You can try again or sign in with a different account.';
  }
  return 'We couldn’t sign you in. Please try again.';
}

export function LoginFloatingPanel({
  open,
  reason,
  onClose,
  onSignInStart,
  mergePreview,
  mergeOperationId,
  isMergeConfirming,
  mergeResult,
  mergeReceiptId,
  mergeError,
  onMergeConfirm,
  onMergeCancel,
  onMergeClose,
  onMergeRetry,
}: LoginFloatingPanelProps) {
  const { signInWithGoogle, signInWithGithub, loading: authLoading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInProvider, setSignInProvider] = useState<'google' | 'github' | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [showDismissWarning, setShowDismissWarning] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  const config = REASON_CONFIGS[reason];
  const isHardGate = config.mode === 'hard_gate';

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setAnimateIn(true));
    } else {
      queueMicrotask(() => {
        setAnimateIn(false);
        setShowDismissWarning(false);
        setSignInError(null);
        setSignInProvider(null);
      });
    }
  }, [open]);

  /**
   * Provider-agnostic sign-in handler.
   * @param provider which OAuth provider to use
   */
  const handleSignIn = useCallback(
    async (provider: 'google' | 'github' = 'google') => {
      setIsSigningIn(true);
      setSignInProvider(provider);
      setSignInError(null);
      onSignInStart?.();

      const timeoutId = window.setTimeout(() => {
        setIsSigningIn(false);
        setSignInProvider(null);
        setSignInError('Sign-in is taking longer than expected. Please check your browser and try again.');
      }, 15000);

      try {
        if (provider === 'github') {
          await signInWithGithub();
        } else {
          await signInWithGoogle();
        }
        window.clearTimeout(timeoutId);
      } catch (err) {
        window.clearTimeout(timeoutId);
        setIsSigningIn(false);
        setSignInProvider(null);
        setSignInError(getSignInErrorMessage(err));
      }
    },
    [signInWithGoogle, signInWithGithub, onSignInStart]
  );

  const handleRetry = useCallback(() => {
    setSignInError(null);
    handleSignIn(signInProvider ?? 'google');
  }, [handleSignIn, signInProvider]);

  const handleDismiss = useCallback(() => {
    if (isHardGate && !showDismissWarning) {
      setShowDismissWarning(true);
      return;
    }
    onClose();
  }, [isHardGate, showDismissWarning, onClose]);

  const handleBackdropClick = useCallback(() => {
    if (!isHardGate) onClose();
  }, [isHardGate, onClose]);

  const handleBackdropKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isHardGate) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClose();
    }
  }, [isHardGate, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className={`fixed inset-0 z-100 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          animateIn ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleBackdropClick}
        onKeyDown={handleBackdropKeyDown}
        role="button"
        tabIndex={isHardGate ? -1 : 0}
        aria-disabled={isHardGate}
        aria-label="Close dialog"
      />

      {/* Panel */}
      <div
        className={`fixed z-101 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md transition-all duration-300 ${
          animateIn
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-4'
        }`}
      >
        <div className="relative bg-[#0d1220] border border-brand/40 rounded-2xl shadow-2xl shadow-brand/20 overflow-hidden">
          {/* Top accent gradient */}
          <div className="h-1 bg-linear-to-r from-brand via-success/70 to-success" />

          {/* Close button (only for soft prompts or after warning) */}
          {config.dismissible && (
            <button
              type="button"
              onClick={handleDismiss}
              className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-muted-label/80 hover:bg-muted-label flex items-center justify-center text-subtle hover:text-subtle transition-colors z-10"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Content */}
          <div className="p-6 pt-5">
            {/* Icon + Title */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-brand/30 flex items-center justify-center shrink-0 border border-brand/30">
                {config.icon}
              </div>
              <div>
                <h2 className="text-lg font-bold text-subtle pr-8">{config.title}</h2>
                <p className="text-sm text-subtle mt-1 leading-relaxed">{config.description}</p>
              </div>
            </div>

            {/* Urgency text */}
            {config.urgencyText && (
              <div className={`text-xs px-3 py-2 rounded-lg mb-4 flex items-center gap-2 ${
                isHardGate
                  ? 'bg-warning/20 text-warning border border-warning/80/30'
                  : 'bg-brand/20 text-brand border border-brand/30'
              }`}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {config.urgencyText}
              </div>
            )}

            {/* Phase 1.5.3: Merge conflict dialog (side-by-side comparison) */}
            {reason === 'merge_conflict' && mergePreview && (
              <div className="mb-4">
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="p-3 rounded-lg bg-warning/20 border border-warning/80/30">
                    <div className="text-[10px] uppercase tracking-wider text-warning font-bold mb-2">Guest Profile</div>
                    <StatRow label="UUID" value={mergePreview.guest.user_id.slice(0, 8) + '...'} />
                    <StatRow label="Total Money" value={`$${formatNum(mergePreview.guest.total_money_earned)}`} />
                    <StatRow label="Total Ticks" value={formatNum(mergePreview.guest.game_tick)} />
                    <StatRow label="Buildings" value={formatNum(mergePreview.guest.buildings_count)} />
                  </div>
                  <div className="p-3 rounded-lg bg-brand/20 border border-brand/30">
                    <div className="text-[10px] uppercase tracking-wider text-brand font-bold mb-2">Google Profile</div>
                    <StatRow label="UUID" value={mergePreview.google.user_id.slice(0, 8) + '...'} />
                    <StatRow label="Total Money" value={`$${formatNum(mergePreview.google.total_money_earned)}`} />
                    <StatRow label="Total Ticks" value={formatNum(mergePreview.google.game_tick)} />
                    <StatRow label="Buildings" value={formatNum(mergePreview.google.buildings_count)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => onMergeConfirm?.('keep_guest')}
                    disabled={isMergeConfirming}
                    className="w-full h-11 text-sm font-semibold bg-success/20 hover:bg-success/30 text-success border border-success/30 rounded-lg disabled:opacity-50"
                  >
                    Keep Guest Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => onMergeConfirm?.('keep_google')}
                    disabled={isMergeConfirming}
                    className="w-full h-11 text-sm font-semibold bg-brand/20 hover:bg-brand/30 text-brand border border-brand/30 rounded-lg disabled:opacity-50"
                  >
                    Keep Google Profile
                  </button>
                  <button
                    type="button"
                    onClick={onMergeCancel}
                    disabled={isMergeConfirming}
                    className="w-full h-9 text-xs text-muted-label hover:text-subtle transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Phase 1.5.3: Merge success screen */}
            {reason === 'merge_success' && mergeResult === 'success' && (
              <div className="mb-4 p-4 rounded-lg bg-success/20 border border-success/30 text-center">
                <p className="text-sm text-success font-medium mb-2">Profile Resolution Complete</p>
                {mergeReceiptId && (
                  <p className="text-[10px] text-muted-label font-mono">Receipt: {mergeReceiptId.slice(0, 13)}</p>
                )}
                <button
                  type="button"
                  onClick={onMergeClose}
                  className="w-full h-10 text-sm font-semibold bg-linear-to-r from-brand/70 to-success/80 hover:from-brand hover:to-success/70 text-white rounded-lg mt-3"
                >
                  Continue
                </button>
              </div>
            )}

            {/* Phase 1.5.3: Merge failure screen */}
            {reason === 'merge_failure' && mergeResult === 'failure' && (
              <div className="mb-4 p-4 rounded-lg bg-danger/20 border border-danger/30 text-center">
                <p className="text-sm text-danger font-medium mb-2">Conflict Resolution Failed</p>
                <p className="text-[10px] text-muted-label mb-3">Nothing was changed. Please retry.</p>
                {mergeError && (
                  <p className="text-[10px] text-danger font-mono mb-3">{mergeError}</p>
                )}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={onMergeRetry}
                    className="w-full h-10 text-sm font-semibold bg-linear-to-r from-brand/70 to-success/80 hover:from-brand hover:to-success/70 text-white rounded-lg"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={onMergeCancel}
                    className="w-full h-9 text-xs text-muted-label hover:text-subtle transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Benefits */}
            <div className="space-y-2 mb-5">
              {config.benefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-2.5 text-sm text-subtle">
                  <div className="w-5 h-5 rounded-full bg-success/30 flex items-center justify-center shrink-0 border border-success/30" aria-hidden="true">
                    <svg className="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  {benefit}
                </div>
              ))}
            </div>

            {/* Sign-in error (natural-language, with retry) */}
            {signInError && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-4 p-3 rounded-lg bg-danger/20 border border-danger/30"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-danger font-medium">We couldn’t sign you in</p>
                    <p className="text-xs text-danger/80 mt-1 wrap-break-word">{signInError}</p>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="mt-2 text-xs text-danger hover:text-danger/80 underline focus-visible:ring-2 focus-visible:ring-danger rounded px-1"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Dismiss warning for hard gates */}
            {showDismissWarning && (
              <div className="mb-4 p-3 rounded-lg bg-danger/20 border border-danger/30">
                <p className="text-xs text-danger font-medium">
                  Your progress is only stored locally. If you clear your browser data or switch devices, your factory will be lost forever.
                </p>
              </div>
            )}

            {/* Sign In Buttons — provider-agnostic stack */}
            <div className="space-y-2">
              <Button
                onClick={() => handleSignIn('google')}
                disabled={isSigningIn || authLoading}
                className="w-full h-12 text-sm font-semibold bg-linear-to-r from-brand/70 to-success/80 hover:from-brand hover:to-success/70 text-white rounded-xl shadow-lg shadow-brand/30 transition-all duration-200 hover:shadow-brand/80/40"
              >
                {isSigningIn && signInProvider === 'google' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in with Google...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    Sign in with Google
                  </>
                )}
              </Button>

              <Button
                onClick={() => handleSignIn('github')}
                disabled={isSigningIn || authLoading}
                variant="outline"
                className="w-full h-12 text-sm font-semibold bg-[#24292e] hover:bg-[#1b1f23] text-white border-[#24292e] hover:border-[#1b1f23] rounded-xl shadow-lg transition-all duration-200"
              >
                {isSigningIn && signInProvider === 'github' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in with GitHub...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
                      />
                    </svg>
                    Sign in with GitHub
                  </>
                )}
              </Button>
            </div>

            {/* Dismiss link for hard gates */}
            {isHardGate && (
              <button
                type="button"
                onClick={handleDismiss}
                className="w-full mt-3 text-xs text-muted-label hover:text-subtle transition-colors py-1 focus-visible:ring-2 focus-visible:ring-brand rounded"
              >
                {showDismissWarning ? 'Continue without saving to cloud' : 'Continue as guest'}
              </button>
            )}

            {/* Soft prompt dismiss */}
            {!isHardGate && (
              <button
                type="button"
                onClick={onClose}
                className="w-full mt-3 text-xs text-muted-label hover:text-subtle transition-colors py-1 focus-visible:ring-2 focus-visible:ring-brand rounded"
              >
                Maybe later
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
