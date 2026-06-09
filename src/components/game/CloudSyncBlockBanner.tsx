'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudBlockState } from '@/lib/hooks/useCloudSync';
import { ShieldAlert, MessageCircle, Lock, Ban, WifiOff, AlertTriangle } from 'lucide-react';

interface CloudSyncBlockBannerProps {
  blockedState: CloudBlockState;
  onSignInAgain?: () => void;
}

const DISCORD_URL = 'https://discord.com/616340426474913794';

function getBlockIcon(code: CloudBlockState['code']) {
  switch (code) {
    case 'ACCOUNT_LOCKED':
      return <Lock className="w-10 h-10 text-red-400" />;
    case 'ACCESS_DENIED':
      return <Ban className="w-10 h-10 text-orange-400" />;
    case 'SESSION_EXPIRED':
      return <WifiOff className="w-10 h-10 text-yellow-400" />;
    case 'VALIDATION_FAILED':
      return <AlertTriangle className="w-10 h-10 text-amber-400" />;
    case 'NETWORK_ERROR':
      return <WifiOff className="w-10 h-10 text-gray-400" />;
    default:
      return <ShieldAlert className="w-10 h-10 text-red-400" />;
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
    default:
      return 'Cloud sync is no longer available for your account.';
  }
}

export function CloudSyncBlockBanner({ blockedState, onSignInAgain }: CloudSyncBlockBannerProps) {
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(false);

  // Animate in on mount
  useEffect(() => {
    const t1 = setTimeout(() => setAnimating(true), 50);
    const t2 = setTimeout(() => setVisible(true), 100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const handleDiscordClick = useCallback(() => {
    window.open(DISCORD_URL, '_blank', 'noopener,noreferrer');
  }, []);

  const handleSignIn = useCallback(() => {
    onSignInAgain?.();
  }, [onSignInAgain]);

  const icon = getBlockIcon(blockedState.code);
  const title = getBlockTitle(blockedState.code);
  const description = getBlockDescription(blockedState.code);
  const isSessionExpired = blockedState.code === 'SESSION_EXPIRED';

  // Format detection time
  const detectedTime = new Date(blockedState.detectedAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-500 ${
        visible ? 'bg-black/70 backdrop-blur-sm' : 'bg-black/0'
      }`}
      style={{ pointerEvents: 'all' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Banner card - centered */}
      <div
        className={`relative mx-4 w-full max-w-md transform transition-all duration-500 ease-out ${
          animating ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'
        }`}
      >
        {/* Main card */}
        <div className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-b from-[#1a1020] to-[#0f0a15] shadow-[0_0_60px_rgba(239,68,68,0.15)]">
          {/* Animated top accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 animate-pulse" />

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
            <div className="mx-auto mb-5 flex items-center justify-center w-20 h-20 rounded-full bg-red-900/20 border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
              <div className="animate-pulse-slow">
                {icon}
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl sm:text-2xl font-bold text-red-400 mb-2 tracking-wide">
              {title}
            </h2>

            {/* Subtitle */}
            <p className="text-sm text-gray-400 mb-4">
              Cloud Sync Unavailable
            </p>

            {/* Divider */}
            <div className="w-16 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent mx-auto mb-4" />

            {/* Reason box */}
            <div className="bg-red-950/30 border border-red-900/30 rounded-xl p-4 mb-5 text-left">
              <p className="text-xs font-semibold text-red-300 mb-2 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Reason
              </p>
              <p className="text-sm text-gray-300 leading-relaxed">
                {blockedState.reason}
              </p>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-400 leading-relaxed mb-5">
              {description}
            </p>

            {/* Detection time */}
            <p className="text-[11px] text-gray-600 mb-6">
              Detected at {detectedTime}
            </p>

            {/* Contact Admin section */}
            <div className="bg-[#1a1525] border border-cyan-900/20 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-cyan-300 mb-3 uppercase tracking-wider flex items-center justify-center gap-2">
                <MessageCircle className="w-3.5 h-3.5" />
                Contact Admin
              </p>
              <p className="text-xs text-gray-400 mb-4">
                If you believe this is a mistake or need assistance, please reach out to our team on Discord.
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

            {/* Session expired: show sign in button */}
            {isSessionExpired && onSignInAgain && (
              <button
                onClick={handleSignIn}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-cyan-400 bg-cyan-950/30 border border-cyan-500/20 hover:bg-cyan-900/30 hover:border-cyan-500/30 transition-all duration-200"
              >
                <WifiOff className="w-4 h-4" />
                Sign In Again
              </button>
            )}

            {/* Footer note */}
            <p className="text-[10px] text-gray-600 mt-4">
              Your local game progress is still saved and available. Only cloud sync is affected.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
