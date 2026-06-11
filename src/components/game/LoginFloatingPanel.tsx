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
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────

export type LoginPromptReason =
  | 'cloud_save'       // Guest clicked "Save to Cloud"
  | 'cloud_load'       // Guest clicked "Load from Cloud"
  | 'leaderboard'      // Guest opened Leaderboard tab
  | 'trading_post'     // Guest opened Trading Post tab
  | 'mega_project'     // Guest opened Mega Projects tab
  | 'progress_milestone' // After 5000 ticks — significant progress at risk
  | 'prestige_available' // Prestige became available — secure your data
  | 'playtime_reminder'  // After 1 hour — one-time gentle nudge
  | 'manual';          // User clicked Sign In button

export type PromptMode = 'hard_gate' | 'soft_prompt';

interface LoginFloatingPanelProps {
  /** Whether the panel is visible */
  open: boolean;
  /** Why the panel was triggered */
  reason: LoginPromptReason;
  /** Close the panel (only works for soft prompts) */
  onClose: () => void;
  /** Callback after successful sign-in initiation */
  onSignInStart?: () => void;
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
    icon: <Cloud className="w-5 h-5 text-cyan-400" />,
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
    icon: <Cloud className="w-5 h-5 text-cyan-400" />,
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
    icon: <Building2 className="w-5 h-5 text-purple-400" />,
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
    icon: <Sparkles className="w-5 h-5 text-fuchsia-400" />,
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
    icon: <Shield className="w-5 h-5 text-blue-400" />,
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
    icon: <Cloud className="w-5 h-5 text-cyan-400" />,
    benefits: [
      'Cloud save & load',
      'Leaderboard rankings',
      'Player trading',
      'Cross-device play',
    ],
    dismissible: true,
  },
};

// ─── Component ──────────────────────────────────────────────────────────

export function LoginFloatingPanel({ open, reason, onClose, onSignInStart }: LoginFloatingPanelProps) {
  const { signInWithGoogle, loading: authLoading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showDismissWarning, setShowDismissWarning] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  const config = REASON_CONFIGS[reason];
  const isHardGate = config.mode === 'hard_gate';

  // Animate in
  useEffect(() => {
    if (open) {
      // Trigger animation after a frame
      requestAnimationFrame(() => setAnimateIn(true));
    } else {
      // Use microtask to avoid synchronous setState in effect
      queueMicrotask(() => {
        setAnimateIn(false);
        setShowDismissWarning(false);
      });
    }
  }, [open]);

  const handleSignIn = useCallback(async () => {
    setIsSigningIn(true);
    onSignInStart?.();
    try {
      await signInWithGoogle();
    } catch {
      setIsSigningIn(false);
    }
  }, [signInWithGoogle, onSignInStart]);

  const handleDismiss = useCallback(() => {
    if (isHardGate && !showDismissWarning) {
      setShowDismissWarning(true);
      return;
    }
    onClose();
  }, [isHardGate, showDismissWarning, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          animateIn ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={isHardGate ? undefined : onClose}
      />

      {/* Panel */}
      <div
        className={`fixed z-[101] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md transition-all duration-300 ${
          animateIn
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-4'
        }`}
      >
        <div className="relative bg-[#0d1220] border border-cyan-900/40 rounded-2xl shadow-2xl shadow-cyan-900/20 overflow-hidden">
          {/* Top accent gradient */}
          <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500" />

          {/* Close button (only for soft prompts or after warning) */}
          {config.dismissible && (
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-muted-label/80 hover:bg-muted-label flex items-center justify-center text-subtle hover:text-gray-200 transition-colors z-10"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Content */}
          <div className="p-6 pt-5">
            {/* Icon + Title */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-900/30 flex items-center justify-center flex-shrink-0 border border-cyan-800/30">
                {config.icon}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-100 pr-8">{config.title}</h2>
                <p className="text-sm text-subtle mt-1 leading-relaxed">{config.description}</p>
              </div>
            </div>

            {/* Urgency text */}
            {config.urgencyText && (
              <div className={`text-xs px-3 py-2 rounded-lg mb-4 flex items-center gap-2 ${
                isHardGate
                  ? 'bg-amber-900/20 text-warning border border-amber-800/30'
                  : 'bg-cyan-900/20 text-cyan-400 border border-cyan-800/30'
              }`}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {config.urgencyText}
              </div>
            )}

            {/* Benefits */}
            <div className="space-y-2 mb-5">
              {config.benefits.map((benefit, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm text-subtle">
                  <div className="w-5 h-5 rounded-full bg-success/30 flex items-center justify-center flex-shrink-0 border border-success/30">
                    <svg className="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  {benefit}
                </div>
              ))}
            </div>

            {/* Dismiss warning for hard gates */}
            {showDismissWarning && (
              <div className="mb-4 p-3 rounded-lg bg-danger/20 border border-danger/30">
                <p className="text-xs text-danger font-medium">
                  Your progress is only stored locally. If you clear your browser data or switch devices, your factory will be lost forever.
                </p>
              </div>
            )}

            {/* Sign In Button */}
            <Button
              onClick={handleSignIn}
              disabled={isSigningIn || authLoading}
              className="w-full h-12 text-sm font-semibold bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white rounded-xl shadow-lg shadow-cyan-900/30 transition-all duration-200 hover:shadow-cyan-800/40"
            >
              {isSigningIn || authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing in...
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

            {/* Dismiss link for hard gates */}
            {isHardGate && (
              <button
                onClick={handleDismiss}
                className="w-full mt-3 text-xs text-muted-label hover:text-subtle transition-colors py-1"
              >
                {showDismissWarning ? 'Continue without saving to cloud' : 'Continue as guest'}
              </button>
            )}

            {/* Soft prompt dismiss */}
            {!isHardGate && (
              <button
                onClick={onClose}
                className="w-full mt-3 text-xs text-muted-label hover:text-subtle transition-colors py-1"
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
