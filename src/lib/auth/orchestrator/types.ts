/**
 * AuthOrchestrator types — Phase 1 skeleton.
 *
 * Defines the public state machine surface, identity enum, and event union
 * that the orchestrator consumes. Phase 1 does not change behavior — only
 * introduces these types so future phases can wire transitions.
 */

import type { Session } from "@supabase/supabase-js";
import type { LoginPromptReason } from "@/components/game/LoginFloatingPanel";
import type { GameTab } from "@/lib/game/types";

export type { LoginPromptReason };
export type { GameTab };

export type IdentityKind =
  "unauthenticated" | "anonymous" | "authenticated" | "locked_to_account";

export type OrchestratorStatus =
  "idle" | "initializing" | "recovering" | "ready" | "signing_out" | "blocked";

/**
 * Why the user is in `limitedMode`. Future-ready: 'oauth_required',
 * 'maintenance', 'guest_only', 'network' all fit here.
 */
export type LimitedReason =
  | "fingerprint_unavailable"
  | "oauth_required"
  | "maintenance"
  | "guest_only"
  | "network";

export interface OrchestratorState {
  status: OrchestratorStatus;
  identity: IdentityKind;
  userId: string | null;
  deviceId: string | null;
  isGuest: boolean;
  /** True when the user can play but some feature is degraded. */
  limitedMode: boolean;
  /** Why limitedMode is set; null when not in limited mode. */
  limitedReason: LimitedReason | null;
}

export type AuthEvent =
  | { type: "STARTUP" }
  | { type: "RECOVERED"; userId: string; source: "deviceId" | "fingerprint" }
  | { type: "NO_RECOVERY" }
  | { type: "OAUTH_CALLBACK"; provider: "google" | "github" }
  | { type: "OAUTH_SUCCESS"; provider: "google" | "github" }
  | { type: "OAUTH_FAILURE"; provider: "google" | "github"; error: string }
  | { type: "BIND_REQUEST"; reason: LoginPromptReason; pendingTab?: GameTab }
  | { type: "SIGN_OUT" }
  | { type: "WAITLIST_REQUIRED" }
  | { type: "AUTH_STATE_CHANGED"; session: Session | null };

export type AuthEventListener = (event: AuthEvent) => void;
export type StateListener = (state: OrchestratorState) => void;
export { Session };

export interface AuthOrchestratorDeps {
  isSupabaseConfigured: boolean;
  getDeviceId: () => string;
  getSession: () => Promise<Session | null>;
  /**
   * Compute browser fingerprint. The orchestrator calls this ONLY when
   * a session is missing (i.e., an anon startup flow actually needs it).
   * Returning 'unknown' causes the orchestrator to skip the quickstart
   * call entirely, since fingerprint is a required field.
   */
  getFingerprint: () => Promise<string | null>;
  /** SINGLE entry point for anon startup. Server-side consolidated:
   *  - deviceId primary lookup
   *  - fingerprint fallback lookup
   *  - create user if no match
   *  - init game state if new
   *  - register/update guest identity
   *  Source lets the client log/telemetry know how the user was resolved. */
  quickstart: (
    deviceId: string,
    fingerprint: string | null,
  ) => Promise<{
    userId: string | null;
    source?: "deviceId" | "fingerprint" | "fresh" | null;
    isNewUser?: boolean | null;
    /** True when quickstart was forced to use the unavailable-fingerprint
     *  sentinel AND Step 1 (deviceId) did NOT match. UI shows the
     *  limited-mode modal. Step 1 match + sentinel = full recovery, no modal. */
    limited?: boolean | null;
    error: string | null;
  }>;
  signInWithOAuth: (
    provider: "google" | "github",
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
  startLoginPrompts: (
    requestLogin: (reason: LoginPromptReason, tab?: GameTab) => void,
  ) => void;
  stopLoginPrompts: () => void;
}
