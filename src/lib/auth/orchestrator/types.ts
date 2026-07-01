/**
 * AuthOrchestrator types — Phase 1 skeleton.
 *
 * Defines the public state machine surface, identity enum, and event union
 * that the orchestrator consumes. Phase 1 does not change behavior — only
 * introduces these types so future phases can wire transitions.
 */

import type { Session } from '@supabase/supabase-js';
import type { LoginPromptReason } from '@/components/game/LoginFloatingPanel';
import type { GameTab } from '@/lib/game/types';

export type { LoginPromptReason };
export type { GameTab };

export type IdentityKind =
  | 'unauthenticated'
  | 'anonymous'
  | 'authenticated'
  | 'locked_to_account';

export type OrchestratorStatus =
  | 'idle'
  | 'initializing'
  | 'recovering'
  | 'ready'
  | 'signing_out'
  | 'blocked';

export interface OrchestratorState {
  status: OrchestratorStatus;
  identity: IdentityKind;
  userId: string | null;
  deviceId: string | null;
  isGuest: boolean;
}

export type AuthEvent =
  | { type: 'STARTUP' }
  | { type: 'RECOVERED'; userId: string }
  | { type: 'NO_RECOVERY' }
  | { type: 'OAUTH_CALLBACK'; provider: 'google' | 'github' }
  | { type: 'OAUTH_SUCCESS'; provider: 'google' | 'github' }
  | { type: 'OAUTH_FAILURE'; provider: 'google' | 'github'; error: string }
  | { type: 'BIND_REQUEST'; reason: LoginPromptReason; pendingTab?: GameTab }
  | { type: 'SIGN_OUT' }
  | { type: 'WAITLIST_REQUIRED' }
  | { type: 'AUTH_STATE_CHANGED'; session: Session | null };

export type AuthEventListener = (event: AuthEvent) => void;
export type StateListener = (state: OrchestratorState) => void;
export { Session };

export interface AuthOrchestratorDeps {
  isSupabaseConfigured: boolean;
  getDeviceId: () => string;
  getSession: () => Promise<Session | null>;
  recoverByDevice: (
    deviceId: string,
    fingerprintHash: string | null,
  ) => Promise<{ recovered: boolean; userId: string | null }>;
  claimGuest: (
    newUserId: string,
    deviceId: string,
  ) => Promise<{ ok: boolean; error: string | null }>;
  /** Combined guest creation: creates anon user + initializes game state in one server call.
   *  @param existingUserId - if provided, reuses that user instead of creating new (recovery path) */
  quickstart: (
    deviceId: string,
    fingerprintHash: string | null,
    existingUserId?: string | null,
  ) => Promise<{ userId: string | null; error: string | null }>;
  signInWithOAuth: (
    provider: 'google' | 'github',
    redirectTo: string,
  ) => Promise<{ error: string | null }>;
  registerDevice: (
    deviceId: string,
    fingerprint: string | null,
    fingerprintHash: string | null,
  ) => Promise<{ ok: boolean; alreadyExists: boolean; reason?: string }>;
  onAuthStateChange: (handler: (session: Session | null) => void) => () => void;
  signOutSupabase: () => Promise<{ error: string | null }>;
  disableServerValidation: () => void;
  initServerValidation: (userId: string) => void;
  // Phase 5: cloud sync trigger. Orchestrator owns load/save timing.
  onReady: (userId: string) => void;
  // Phase 10: identity transition between two non-null userIds
  // (OAuth upgrade, account switch). Does NOT re-load — load is
  // one-shot via onReady.
  onIdentityChanged: (userId: string) => void;
  onSignedOut: () => void;
  // Phase 6: merge flow trigger. Orchestrator owns merge-check timing.
  runMergeCheck: (userId: string, deviceId: string) => Promise<void>;
  resetMerge: () => void;
  // Phase 7: soft prompt trigger. Orchestrator owns prompt timing.
  startLoginPrompts: (requestLogin: (reason: LoginPromptReason, tab?: GameTab) => void) => void;
  stopLoginPrompts: () => void;
}