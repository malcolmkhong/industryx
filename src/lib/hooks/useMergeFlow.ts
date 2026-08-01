// Phase 1.7: Merge flow hook
// Listens for pending merge operations and drives the LoginFloatingPanel
// through the merge dialog modes.

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import type { LoginPromptReason } from '@/components/game/LoginFloatingPanel';
import { getFingerprint } from '@/lib/auth/fingerprint';

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

export interface MergeState {
  isOpen: boolean;
  reason: LoginPromptReason;
  operationId: string | null;
  preview: MergePreview | null;
  riskScore: number;
  isConfirming: boolean;
  isCancelling: boolean;
  result: 'idle' | 'success' | 'failure';
  receiptId: string | null;
  survivingUserId: string | null;
  error: string | null;
}

const INITIAL: MergeState = {
  isOpen: false,
  reason: 'manual',
  operationId: null,
  preview: null,
  riskScore: 0,
  isConfirming: false,
  isCancelling: false,
  result: 'idle',
  receiptId: null,
  survivingUserId: null,
  error: null,
};

const GUEST_UID_COOKIE = 'factory-dominion-guest-uid';
const IDEMPOTENCY_PREFIX = 'merge-';

function generateIdempotencyKey(): string {
  return `${IDEMPOTENCY_PREFIX}${crypto.randomUUID()}`;
}

function setCookie(name: string, value: string, days: number = 30): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export function useMergeFlow() {
  const { user, deviceId } = useAuth();
  const [state, setState] = useState<MergeState>(INITIAL);
  const triggeredRef = useRef<string | null>(null);

  const triggerMergeCheck = useCallback(async () => {
    if (!user || user.is_anonymous) return;
    if (!deviceId) return;
    if (triggeredRef.current === user.id) return;
    triggeredRef.current = user.id;

    const idempotencyKey = generateIdempotencyKey();

    try {
      deleteCookie(GUEST_UID_COOKIE);
    } catch {
    }

    try {
      // Phase 1: include fingerprint + UA for correlation (never used for
      // enforcement; server stores them as-is).
      const fingerprintHash = await getFingerprint();
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const res = await fetch('/api/auth/link-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          deviceId,
          fingerprintHash,
          userAgent,
        }),
      });

      const data = await res.json();

      if (data.linked && data.reason === 'no_guest_to_link') {
        return;
      }

      if (data.conflict) {
        setState({
          isOpen: true,
          reason: 'merge_conflict',
          operationId: data.operationId,
          preview: data.preview,
          riskScore: data.riskScore ?? 0,
          isConfirming: false,
          isCancelling: false,
          result: 'idle',
          receiptId: null,
          survivingUserId: null,
          error: null,
        });
      }
    } catch (err) {
      console.warn('[MergeFlow] Trigger failed:', err);
    }
  }, [user, deviceId]);

  useEffect(() => {
    if (user && !user.is_anonymous) {
      triggerMergeCheck();
    }
  }, [user, triggerMergeCheck]);

  const confirmMerge = useCallback(
    async (preference: 'keep_guest' | 'keep_google') => {
      if (!state.operationId) return;

      setState((s) => ({
        ...s,
        isConfirming: true,
        reason:
          preference === 'keep_guest'
            ? 'merge_confirm_keep_guest'
            : 'merge_confirm_keep_google',
        error: null,
      }));

      const idempotencyKey = `${state.operationId}-${preference}`;

      try {
        // Phase 1: include fingerprint for correlation
        const fingerprintHash = await getFingerprint();
        const res = await fetch('/api/auth/confirm-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationId: state.operationId,
            idempotencyKey,
            preference,
            fingerprintHash,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setState((s) => ({
            ...s,
            isConfirming: false,
            result: 'failure',
            error: data.error ?? 'Merge failed',
          }));
          return;
        }

        deleteCookie(GUEST_UID_COOKIE);

        setState((s) => ({
          ...s,
          isConfirming: false,
          isOpen: true,
          reason: 'merge_success',
          result: 'success',
          receiptId: data.receiptId,
          survivingUserId: data.survivingUserId,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          isConfirming: false,
          result: 'failure',
          error: err instanceof Error ? err.message : 'Network error',
        }));
      }
    },
    [state.operationId]
  );

  const cancelMerge = useCallback(async () => {
    setState(INITIAL);
  }, []);

  const closeMerge = useCallback(() => {
    setState(INITIAL);
  }, []);

  const retryMerge = useCallback(() => {
    setState((s) => ({
      ...s,
      result: 'idle',
      error: null,
      reason: 'merge_conflict',
    }));
  }, []);

  return {
    state,
    triggerMergeCheck,
    confirmMerge,
    cancelMerge,
    closeMerge,
    retryMerge,
  };
}
