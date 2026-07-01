/**
 * MergeFlowService — Phase 6.
 *
 * Owns the merge-check + merge-confirm pipeline. Triggered by the orchestrator
 * after onAuthenticated. Per Q3: merge UI auto-opens on conflict. Per Decision 13:
 * guest identity is permanently locked to one account.
 *
 * Replaces the buggy useMergeFlow triggeredRef pattern (which silently skipped
 * re-merges for the same user.id after sign-out).
 *
 * State lives outside React. The orchestrator calls startMergeCheck() and
 * confirmMerge(). The useMergeFlow hook facade reads state for LoginFloatingPanel.
 */

import { getFingerprint } from '@/lib/auth/fingerprint';

const GUEST_UID_COOKIE = 'factory-dominion-guest-uid';
const IDEMPOTENCY_PREFIX = 'merge-';

export type MergePreference = 'keep_guest' | 'keep_google';

export type MergeReason =
  | 'merge_conflict'
  | 'merge_confirm_keep_guest'
  | 'merge_confirm_keep_google'
  | 'merge_success';

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

export type MergeOutcome =
  | { kind: 'no_guest_to_link' }
  | { kind: 'linked' }
  | {
      kind: 'conflict';
      operationId: string;
      preview: MergePreview;
      riskScore: number;
      expiresAt: string;
    };

export interface MergeState {
  isOpen: boolean;
  reason: MergeReason;
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
  reason: 'merge_conflict',
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

type Listener = (state: MergeState) => void;

function generateIdempotencyKey(): string {
  return `${IDEMPOTENCY_PREFIX}${crypto.randomUUID()}`;
}

function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export class MergeFlowService {
  private state: MergeState = INITIAL;
  private userId: string | null = null;
  private deviceId: string | null = null;
  private listeners = new Set<Listener>();

  setContext(userId: string | null, deviceId: string | null): void {
    this.userId = userId;
    this.deviceId = deviceId;
  }

  getState(): MergeState {
    return this.state;
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
        l(this.state);
      } catch (err) {
        console.warn('[MergeFlowService] listener threw:', err);
      }
    }
  }

  private setState(patch: Partial<MergeState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  /**
   * Call link-identity. Returns outcome; orchestrator decides what to do
   * with conflict (auto-open panel per Q3).
   */
  async startMergeCheck(): Promise<MergeOutcome> {
    if (!this.userId || !this.deviceId) {
      return { kind: 'no_guest_to_link' };
    }

    try {
      deleteCookie(GUEST_UID_COOKIE);
    } catch {
      // ignored
    }

    const idempotencyKey = generateIdempotencyKey();

    try {
      const fingerprintHash = await getFingerprint();
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const res = await fetch('/api/auth/link-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          deviceId: this.deviceId,
          fingerprintHash,
          userAgent,
        }),
      });

      const data = await res.json();

      if (data.linked && data.reason === 'no_guest_to_link') {
        return { kind: 'no_guest_to_link' };
      }

      if (data.conflict) {
        const conflict: MergeOutcome = {
          kind: 'conflict',
          operationId: data.operationId,
          preview: data.preview,
          riskScore: data.riskScore ?? 0,
          expiresAt: data.expiresAt,
        };
        // Per Q3: auto-open merge UI immediately.
        this.setState({
          isOpen: true,
          reason: 'merge_conflict',
          operationId: conflict.operationId,
          preview: conflict.preview,
          riskScore: conflict.riskScore,
          isConfirming: false,
          isCancelling: false,
          result: 'idle',
          receiptId: null,
          survivingUserId: null,
          error: null,
        });
        return conflict;
      }

      return { kind: 'linked' };
    } catch (err) {
      console.warn('[MergeFlowService] startMergeCheck failed:', err);
      return { kind: 'no_guest_to_link' };
    }
  }

  async confirmMerge(preference: MergePreference): Promise<void> {
    if (!this.state.operationId) return;

    this.setState({
      isConfirming: true,
      reason:
        preference === 'keep_guest'
          ? 'merge_confirm_keep_guest'
          : 'merge_confirm_keep_google',
      error: null,
    });

    const idempotencyKey = `${this.state.operationId}-${preference}`;

    try {
      const fingerprintHash = await getFingerprint();
      const res = await fetch('/api/auth/confirm-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: this.state.operationId,
          idempotencyKey,
          preference,
          fingerprintHash,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        this.setState({
          isConfirming: false,
          result: 'failure',
          error: data.error ?? 'Merge failed',
        });
        return;
      }

      try {
        deleteCookie(GUEST_UID_COOKIE);
      } catch {
        // ignored
      }

      this.setState({
        isConfirming: false,
        isOpen: true,
        reason: 'merge_success',
        result: 'success',
        receiptId: data.receiptId,
        survivingUserId: data.survivingUserId,
      });
    } catch (err) {
      this.setState({
        isConfirming: false,
        result: 'failure',
        error: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  cancelMerge(): void {
    this.setState(INITIAL);
  }

  closeMerge(): void {
    this.setState(INITIAL);
  }

  retryMerge(): void {
    this.setState({
      result: 'idle',
      error: null,
      reason: 'merge_conflict',
    });
  }

  reset(): void {
    this.state = INITIAL;
    this.notify();
  }
}