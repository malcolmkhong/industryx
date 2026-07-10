'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CloudBlockState } from "@/lib/hooks/useCloudSync";
import { ShieldAlert, MessageCircle, Lock, Ban, WifiOff, AlertTriangle, Loader2 } from 'lucide-react';

interface CloudSyncBlockBannerProps {
  blockedState: CloudBlockState;
  onSignInWithGoogle?: () => Promise<void> | void;
  onSignInWithGithub?: () => Promise<void> | void;
}

const DISCORD_URL = 'https://discordapp.com/users/616340426474913794';

function getBlockIcon(code: CloudBlockState['code']) {
  switch (code) {
    case 'ACCOUNT_LOCKED':
      return <Lock className="w-10 h-10 text-danger" />;
    case 'ACCESS_DENIED':
      return <Ban className="w-10 h-10 text-domain" />;
    case 'SESSION_EXPIRED':
      return <WifiOff className="w-10 h-10 text-warning" />;
    case 'VALIDATION_FAILED':
      return <AlertTriangle className="w-10 h-10 text-warning" />;
    case 'NETWORK_ERROR':
    case 'CONFIG_UNAVAILABLE':
    case 'SERVER_UNAVAILABLE':
      return <WifiOff className="w-10 h-10 text-subtle" />;
    default:
      return <ShieldAlert className="w-10 h-10 text-danger" />;
  }
}

function getBlockTitle(code: CloudBlockState['code']): string {
  switch (code) {
    case 'ACCOUNT_LOCKED':
      return 'Account Locked';
    case 'ACCESS_DENIED':
      return 'Access Denied';
    case 'SESSION_EXPIRED':
      return 'Session Expired';
    case 'VALIDATION_FAILED':
      return 'Validation Failed';
    case 'NETWORK_ERROR':
      return 'Connection Lost';
    case 'CONFIG_UNAVAILABLE':
      return 'Game Server Unavailable';
    case 'SERVER_UNAVAILABLE':
      return 'Server Unavailable';
    default:
      return 'Cloud Sync Blocked';
  }
}

function getBlockDescription(code: CloudBlockState['code']): string {
  switch (code) {
    case 'ACCOUNT_LOCKED':
      return 'Your account has been locked by the system or an administrator. Cloud sync is disabled for your account.';
    case 'ACCESS_DENIED':
      return 'You do not have permission to access cloud sync. Your account may have restricted access.';
    case 'SESSION_EXPIRED':
      return 'Your authentication session has expired. You need to sign in again to restore cloud sync.';
    case 'VALIDATION_FAILED':
      return 'Your game data failed server validation. Cloud sync has been paused to protect your account.';
    case 'NETWORK_ERROR':
      return 'Unable to reach the cloud sync server. Please check your internet connection.';
    case 'CONFIG_UNAVAILABLE':
      return 'Game configuration could not be loaded from the server. Gameplay actions are paused until the server is available again.';
    case 'SERVER_UNAVAILABLE':
      return 'The game server is not available. Gameplay actions are paused to protect your saved progress.';
    default:
      return 'Cloud sync is no longer available for your account.';
  }
}

export function CloudSyncBlockBanner({
  blockedState,
  onSignInWithGoogle,
  onSignInWithGithub,
}: CloudSyncBlockBannerProps) {
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(false);
  const [signInProvider, setSignInProvider] = useState<"google" | "github" | null>(null);

  // Animate in on mount
  useEffect(() => {
    const t1 = setTimeout(() => setAnimating(true), 50);
    const t2 = setTimeout(() => setVisible(true), 100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const handleDiscordClick = useCallback(() => {
    window.open(DISCORD_URL, '_blank', 'noopener,noreferrer');
  }, []);

  const handleSignIn = useCallback(
    async (provider: "google" | "github") => {
      const signIn =
        provider === "google" ? onSignInWithGoogle : onSignInWithGithub;
      if (!signIn) return;

      setSignInProvider(provider);
      try {
        await signIn();
      } finally {
        setSignInProvider(null);
      }
    },
    [onSignInWithGoogle, onSignInWithGithub],
  );

  const icon = getBlockIcon(blockedState.code);
  const title = getBlockTitle(blockedState.code);
  const description = getBlockDescription(blockedState.code);
  const isSessionExpired = blockedState.code === 'SESSION_EXPIRED';
  const isGameplayBlock =
    blockedState.code === 'CONFIG_UNAVAILABLE' ||
    blockedState.code === 'SERVER_UNAVAILABLE';

  // Format detection time
  const detectedTime = new Date(blockedState.detectedAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sync blocked notification"
      className={`fixed inset-0 z-9999 flex items-center justify-center overflow-y-auto p-3 transition-all duration-500 ${
        visible ? 'bg-black/70 backdrop-blur-sm' : 'bg-black/0'
      }`}
      style={{ pointerEvents: 'all' }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') setVisible(false); }}
      tabIndex={-1}
    >
      {/* Banner card - centered */}
      <div
        className={`relative my-4 w-full max-w-md transform transition-all duration-500 ease-out ${
          animating ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'
        }`}
      >
        {/* Main card */}
        <div className="relative max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-danger/30 bg-linear-to-b from-[#1a1020] to-[#0f0a15] shadow-[0_0_60px_rgba(239,68,68,0.15)]">
          {/* Animated top accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-danger/80 via-domain to-danger/80 animate-pulse" />

          {/* Warning pattern overlay */}
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 10px,
              rgba(239,68,68,0.1) 10px,
              rgba(239,68,68,0.1) 20px
            )`
          }} />

          {/* Content */}
          <div className="relative p-6 sm:p-8 text-center">
            {/* Icon with glow */}
            <div className="mx-auto mb-5 flex items-center justify-center w-20 h-20 rounded-full bg-danger/20 border border-danger/20 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
              <div className="animate-pulse-slow">
                {icon}
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl sm:text-2xl font-bold text-danger mb-2 tracking-wide">
              {title}
            </h2>

            {/* Subtitle */}
            <p className="text-sm text-subtle mb-4">
              {isGameplayBlock ? 'Gameplay Actions Paused' : 'Cloud Sync Unavailable'}
            </p>

            {/* Divider */}
            <div className="w-16 h-px bg-linear-to-r from-transparent via-danger/40 to-transparent mx-auto mb-4" />

            {/* Reason box */}
            <div className="bg-danger/10/30 border border-danger/40/30 rounded-xl p-4 mb-5 text-left">
              <p className="text-xs font-semibold text-danger mb-2 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Reason
              </p>
              <p className="text-sm text-subtle leading-relaxed">
                {blockedState.reason}
              </p>
            </div>

            {/* Description */}
            <p className="text-sm text-subtle leading-relaxed mb-5">
              {description}
            </p>

            {/* Detection time */}
            <p className="text-[11px] text-muted-label mb-6">
              Detected at {detectedTime}
            </p>

            {/* Contact Admin section */}
            <div className="bg-[#1a1525] border border-brand/20 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-brand mb-3 uppercase tracking-wider flex items-center justify-center gap-2">
                <MessageCircle className="w-3.5 h-3.5" />
                Contact Admin
              </p>
              <p className="text-xs text-subtle mb-4">
                {isGameplayBlock
                  ? 'Please retry later. If the issue persists, reach out to our team on Discord.'
                  : 'If you believe this is a mistake or need assistance, please reach out to our team on Discord.'}
              </p>

              {/* Discord button */}
              <button
                onClick={handleDiscordClick}
                className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #5865F2 0%, #4752C4 100%)',
                  boxShadow: '0 4px 15px rgba(88, 101, 242, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                Join Discord Server
              </button>
            </div>

            {/* Session expired: show all supported sign-in providers */}
            {isSessionExpired && (onSignInWithGoogle || onSignInWithGithub) && (
              <div className="grid gap-2">
                {onSignInWithGoogle && (
                  <button
                    onClick={() => void handleSignIn("google")}
                    disabled={signInProvider !== null}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-subtle bg-white/95 border border-white/20 hover:bg-white transition-all duration-200 disabled:opacity-70"
                  >
                    {signInProvider === "google" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-foreground" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                    )}
                    {signInProvider === "google" ? "Signing in with Google..." : "Sign in with Google"}
                  </button>
                )}
                {onSignInWithGithub && (
                  <button
                    onClick={() => void handleSignIn("github")}
                    disabled={signInProvider !== null}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-[#24292e] border border-[#24292e] hover:bg-[#1b1f23] transition-all duration-200 disabled:opacity-70"
                  >
                    {signInProvider === "github" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
                      </svg>
                    )}
                    {signInProvider === "github" ? "Signing in with GitHub..." : "Sign in with GitHub"}
                  </button>
                )}
              </div>
            )}

            {/* Footer note */}
            <p className="text-[10px] text-muted-label mt-4">
              {isGameplayBlock
                ? 'Your current view remains available, but economy actions are blocked until the server recovers.'
                : 'Your local game progress is still saved and available. Only cloud sync is affected.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
