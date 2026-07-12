'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useLoginPrompt } from '@/lib/hooks/useLoginPrompt';
import { useCloudSync } from '@/lib/hooks/cloudSync';
import { Button } from '@/components/ui/button';
import { X, User, LogOut, Cloud, RefreshCw, Check, Save, Link2, Github } from 'lucide-react';

interface AccountSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSignOut: () => Promise<void>;
}

export function AccountSettingsModal({ open, onClose, onSignOut }: AccountSettingsModalProps) {
  const { user, isGuest } = useAuth();
  const { promptLogin } = useLoginPrompt();
  const cloudSync = useCloudSync();
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setError(null);
    setSuccess(null);
    setDisplayName(
      (user.user_metadata?.full_name as string) ||
      user.email?.split('@')[0] ||
      'Commander'
    );
  }, [open, user]);

  if (!open || !user) return null;

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/auth/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          displayName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to update profile');
        return;
      }

      setSuccess('Profile updated. Refresh to see changes in header.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsSaving(false);
    }
  };

  // Derive the account provider from Supabase's app_metadata. Supported
  // providers: 'google', 'github', 'email' (password / magic link), or
  // 'guest' for anonymous users. Each renders with its own badge colour
  // and an icon hint that matches the sign-in method.
  const userAppMeta = (user as {
    app_metadata?: { provider?: string; providers?: string[] };
  } | null)?.app_metadata;

  // `providers` lists every linked identity (Supabase supports linking
  // multiple OAuth providers to one user). When missing, fall back to
  // a single-element array of the primary provider.
  const linkedProviders: string[] = (() => {
    if (userAppMeta?.providers && userAppMeta.providers.length > 0) {
      return userAppMeta.providers;
    }
    if (userAppMeta?.provider) return [userAppMeta.provider];
    return isGuest ? ['anonymous'] : ['email'];
  })();

  const primaryProvider = userAppMeta?.provider ?? linkedProviders[0] ?? 'email';

  const providerBadge = (provider: string) => {
    switch (provider) {
      case 'google':
        return {
          label: 'Google',
          className: 'bg-success/30 text-success border-success/30',
          Icon: Check,
        };
      case 'github':
        return {
          label: 'GitHub',
          className: 'bg-subtle/30 text-subtle border-subtle/30',
          Icon: Github,
        };
      case 'email':
        return {
          label: 'Email',
          className: 'bg-brand/30 text-brand border-brand/30',
          Icon: Check,
        };
      case 'anonymous':
        return {
          label: 'Guest',
          className: 'bg-warning/30 text-warning border-warning/30',
          Icon: User,
        };
      default:
        return {
          label: provider,
          className: 'bg-muted-label/30 text-muted-label border-muted-label/30',
          Icon: User,
        };
    }
  };

  const accountTypeBadge = providerBadge(primaryProvider);

  return (
    <div className="fixed inset-0 z-110 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Account settings">
      <div className="relative bg-[#0d1220] border border-brand/40 rounded-2xl shadow-2xl shadow-brand/20 max-w-md w-full overflow-hidden">
        <div className="h-1 bg-linear-to-r from-brand via-success/70 to-success" />

        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-muted-label/80 hover:bg-muted-label flex items-center justify-center text-subtle hover:text-subtle transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 pt-5">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-brand/30 flex items-center justify-center shrink-0 border border-brand/30">
              <User className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-subtle">Account Settings</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-md border ${accountTypeBadge.className} flex items-center gap-1`}>
                  <accountTypeBadge.Icon className="w-3 h-3" aria-hidden="true" />
                  {accountTypeBadge.label}
                </span>
                <span className="text-[10px] text-muted-label">
                  {user.id.slice(0, 8)}...
                </span>
              </div>
            </div>
          </div>

          {isGuest && (
            <div className="mb-4 p-3 rounded-lg bg-warning/20 border border-warning/80/30 text-xs text-warning">
              Playing as Guest. Your progress is tied to this device. Bind your account to protect it across devices.
            </div>
          )}

          {/* ─── Linked Accounts ─────────────────────────────────────────────── */}
          <div className="mb-4 p-3 rounded-lg bg-card border border-brand/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-label font-semibold mb-2">
              Linked accounts
            </p>
            <div className="space-y-1.5">
              {linkedProviders.length > 0 ? (
                linkedProviders.map((p) => {
                  const badge = providerBadge(p);
                  const isPrimary = p === primaryProvider;
                  return (
                    <div
                      key={p}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className={`text-[10px] px-2 py-0.5 rounded-md border ${badge.className} flex items-center gap-1`}>
                        <badge.Icon className="w-3 h-3" aria-hidden="true" />
                        {badge.label}
                      </span>
                      {isPrimary && (
                        <span className="text-[10px] text-muted-label">primary</span>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-[10px] text-muted-label">No linked accounts</p>
              )}
            </div>
          </div>

          {/* ─── Cloud Sync Status ───────────────────────────────────────────── */}
          <div className="mb-4 p-3 rounded-lg bg-card border border-brand/20">
            <div className="flex items-center gap-2 mb-2">
              {cloudSync.isSyncing ? (
                <RefreshCw className="w-4 h-4 text-brand animate-spin" aria-hidden="true" />
              ) : cloudSync.lastSyncAt ? (
                <Check className="w-4 h-4 text-success" aria-hidden="true" />
              ) : (
                <Cloud className="w-4 h-4 text-muted-label" aria-hidden="true" />
              )}
              <span className="text-xs font-semibold text-subtle">
                {cloudSync.isSyncing
                  ? 'Syncing…'
                  : cloudSync.lastSyncAt
                    ? 'Cloud Synced'
                    : 'Not yet synced'}
              </span>
            </div>
            <div className="text-[10px] text-muted-label space-y-0.5">
              {cloudSync.lastSyncAt && (
                <p>
                  Last sync:{' '}
                  <span className="font-mono text-subtle">
                    {new Date(cloudSync.lastSyncAt).toLocaleString()}
                  </span>
                </p>
              )}
              {cloudSync.lastAutoSaveAt && (
                <p>
                  Last auto-save:{' '}
                  <span className="font-mono text-subtle">
                    {new Date(cloudSync.lastAutoSaveAt).toLocaleString()}
                  </span>
                </p>
              )}
              {!cloudSync.lastSyncAt && (
                <p>Your progress will sync to the cloud when you sign in and play.</p>
              )}
            </div>
          </div>

          {isGuest && (
            <Button
              type="button"
              onClick={() => {
                onClose();
                promptLogin('manual');
              }}
              className="w-full h-10 text-sm font-semibold bg-linear-to-r from-brand/70 to-success/80 hover:from-brand hover:to-success/70 text-white rounded-lg mb-5"
            >
              <Link2 className="w-4 h-4 mr-2" />
              Bind Account
            </Button>
          )}

          <div className="space-y-3 mb-5">
            <div>
              <label htmlFor="display-name-input" className="text-xs text-muted-label block mb-1.5">Display Name</label>
              <input
                id="display-name-input"
                aria-label="Display name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={32}
                className="w-full px-3 py-2 bg-card border border-brand/20 rounded-lg text-sm text-subtle focus:outline-none focus:border-brand/50"
                placeholder="Enter display name"
              />
              <p className="text-[10px] text-muted-label mt-1">Up to 32 characters. Control characters and angle brackets are stripped.</p>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-danger/20 border border-danger/30 text-xs text-danger">
                {error}
              </div>
            )}

            {success && (
              <div className="p-2.5 rounded-lg bg-success/20 border border-success/30 text-xs text-success">
                {success}
              </div>
            )}
          </div>

          <div className="flex gap-2 mb-4">
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 h-10 text-sm font-semibold bg-linear-to-r from-brand/70 to-success/80 hover:from-brand hover:to-success/70 text-white rounded-lg"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>

          <div className="border-t border-brand/20 pt-4 space-y-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onSignOut}
              className="w-full justify-start h-9 text-sm text-danger hover:text-danger hover:bg-danger/10"
            >
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
