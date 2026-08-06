/**
 * AuthOrchestrator types — PR4-4A rewrite.
 *
 * Public state machine surface, identity enum, bootstrap request/response
 * types, and event union. Aligned with plan §5 + §15 from
 * AUTH_ORCHESTRATOR_REDESIGN_PLAN.md.
 */

import type { Session } from "@supabase/supabase-js";

// ─── State machine (plan §5) ────────────────────────────────────────────

/**
 * Client orchestrator status. 8 states matching plan §5.
 *
 * NOTE: this is a breaking change from the prior 6-state enum. The prior
 * values `initializing | recovering | signing_out | blocked` are gone — they
 * collapse into the new lifecycle:
 *   - initializing -> resolving_session + bootstrapping
 *   - recovering   -> bootstrapping
 *   - signing_out  -> signed_out
 *   - blocked      -> recovery_required
 *
 * Consumers that read `status` directly must update.
 */
export type OrchestratorStatus =
  | "idle"
  | "resolving_session"
  | "bootstrapping"
  | "ready"
  | "conflict"
  | "recovery_required"
  | "temporary_error"
  | "signed_out";

export type IdentityKind =
  | "unauthenticated"
  | "anonymous"
  | "authenticated"
  | "locked_to_account";

// ─── Bootstrap request/response (matches /api/auth/bootstrap) ───────────

export interface BootstrapRequestBody {
  deviceId: string;
  fingerprintHash?: string | null;
  previousAuthUserId?: string | null;
  /**
   * Migration 079: per-request auth-merge policy forwarded to the
   * server. Default 'auth_wins_archive_guest' (server-side). Set
   * 'explicit_conflict' for users who opted into the legacy 409 prompt.
   */
  mergePolicy?: "auth_wins_archive_guest" | "explicit_conflict";
}

/**
 * Discriminated union for the POST /api/auth/bootstrap response. Mirrors
 * plan §15 status codes exactly + Migration 079 archive metadata.
 * The orchestrator never sees raw HTTP — the deps' `callBootstrap`
 * parses JSON into this shape.
 */
export type BootstrapResponseBody =
  | {
      code: "BOOTSTRAP_READY";
      userId: string;
      isGuest: boolean;
      isNewUser: boolean;
      source: string;
      hasGameState: boolean;
      needsStateLoad: boolean;
      gameState?: Record<string, unknown>;
      /**
       * Migration 079: when the default 'auth_wins_archive_guest' policy
       * archived guest progress at sign-in, this id points to the
       * recoverable snapshot row in `guest_state_archive`. UI can
       * render a one-time banner.
       */
      archiveReceiptId?: string | null;
      archivedGuestId?: string | null;
    }
  | {
      code: "ACCOUNT_PROGRESS_CONFLICT" | "DEVICE_BOUND_TO_OTHER_USER";
      conflictReason: string;
      survivingUserId: string | null;
      archivedGuestId: string | null;
    }
  | {
      code: "STATE_RECOVERY_REQUIRED";
    }
  | {
      code: "BOOTSTRAP_RATE_LIMITED" | "BOOTSTRAP_UNAVAILABLE";
      message?: string;
    }
  | {
      code: "INTERNAL_BOOTSTRAP_ERROR";
      message?: string;
    }
  | {
      code: "INVALID_BOOTSTRAP_REQUEST" | "INVALID_SESSION";
      message?: string;
    };

// ─── Typed orchestrator result payload (plan §5) ────────────────────────

export type BootstrapSource =
  | "deviceId"
  | "auth"
  | "fresh"
  | "sign_out_to_guest";

export interface BootstrapReadyResult {
  status: "ready";
  userId: string;
  isGuest: boolean;
  isNewUser: boolean;
  source: BootstrapSource;
  hasGameState: boolean;
  needsStateLoad: boolean;
  gameState?: Record<string, unknown>;
  /** Migration 079: archive receipt id (recoverable guest snapshot). */
  archiveReceiptId?: string | null;
  archivedGuestId?: string | null;
}

export interface BootstrapConflictResult {
  status: "conflict";
  reason: "DEVICE_BOUND_TO_OTHER_USER" | "ACCOUNT_PROGRESS_CONFLICT";
  survivingUserId: string | null;
  archivedGuestId: string | null;
}

export interface BootstrapRecoveryResult {
  status: "recovery_required";
}

export interface BootstrapTemporaryErrorResult {
  status: "temporary_error";
  reason:
    | "rate_limited"
    | "service_unavailable"
    | "network"
    | "internal_error"
    | "invalid_request"
    | "invalid_session";
  retryable: boolean;
}

export type OrchestratorResult =
  | BootstrapReadyResult
  | BootstrapConflictResult
  | BootstrapRecoveryResult
  | BootstrapTemporaryErrorResult
  | { status: "idle" };

// ─── Fingerprint status (telemetry only — plan §10) ─────────────────────

export type FingerprintStatus =
  | "pending"
  | "available"
  | "unavailable"
  | "timeout"
  | "blocked";

// ─── Orchestrator state shape ───────────────────────────────────────────

export interface OrchestratorState {
  status: OrchestratorStatus;
  identity: IdentityKind;
  userId: string | null;
  deviceId: string | null;
  isGuest: boolean;
  /**
   * Latest typed bootstrap result. `null` when no bootstrap has completed
   * yet. The status and result together describe the orchestrator's view
   * of the world: status tells the UI which screen to render, result
   * carries the payload the screen needs.
   */
  result: OrchestratorResult | null;
  /**
   * Authenticated user id captured BEFORE sign-out. Cleared on the next
   * bootstrap that consumes it. The orchestrator passes this to
   * /api/auth/bootstrap as `previousAuthUserId` so the server can route
   * the request to the create_signed_out_guest_after_signout RPC.
   */
  previousAuthUserId: string | null;
  fingerprintStatus: FingerprintStatus;
  /**
   * Kept for legacy consumers (FingerprintUnavailableModal reads these).
   * Will be removed in PR4-4B once the modal migrates to `result` + status.
   */
  limitedMode: boolean;
  limitedReason: LimitedReason | null;
}

/**
 * Legacy limitedReason enum. Kept so external consumers that read
 * `state.limitedMode` / `state.limitedReason` keep compiling.
 */
export type LimitedReason =
  | "fingerprint_unavailable"
  | "oauth_required"
  | "maintenance"
  | "guest_only"
  | "network";

// ─── Events ─────────────────────────────────────────────────────────────

export type AuthEvent =
  | { type: "STARTUP" }
  | {
      type: "BOOTSTRAP_READY";
      userId: string;
      isGuest: boolean;
      isNewUser: boolean;
      source: BootstrapSource;
    }
  | {
      type: "BOOTSTRAP_CONFLICT";
      reason: "DEVICE_BOUND_TO_OTHER_USER" | "ACCOUNT_PROGRESS_CONFLICT";
      survivingUserId: string | null;
      archivedGuestId: string | null;
    }
  | { type: "BOOTSTRAP_RECOVERY_REQUIRED" }
  | { type: "BOOTSTRAP_TEMPORARY_ERROR"; retryable: boolean }
  | { type: "OAUTH_CALLBACK"; provider: "google" | "github" }
  | { type: "OAUTH_SUCCESS"; provider: "google" | "github" }
  | { type: "OAUTH_FAILURE"; provider: "google" | "github"; error: string }
  | { type: "SIGN_OUT_STARTED" }
  | { type: "SIGN_OUT_COMPLETE" }
  | { type: "WAITLIST_REQUIRED" }
  | { type: "AUTH_STATE_CHANGED"; session: Session | null };

export type AuthEventListener = (event: AuthEvent) => void;
export type StateListener = (state: OrchestratorState) => void;
export { Session };

// ─── Deps — NEW minimal interface for the bootstrap flow ────────────────

/**
 * AuthOrchestrator deps for the post-PR4-4A bootstrap flow. The
 * legacy `AuthOrchestratorDeps` interface (quickstart/registerDevice/etc.)
 * was removed; callers must use this canonical name.
 *
 * Each callback is wrapped in try/catch by the orchestrator so a buggy
 * provider cannot prevent subsequent cleanup steps from running.
 */
export interface AuthOrchestratorBootstrapDeps {
  /** True when Supabase env vars exist. False short-circuits bootstrap. */
  isSupabaseConfigured: boolean;

  /** Persistent device id (UUID). The orchestrator owns creation. */
  getDeviceId: () => string;

  /**
   * Read the current Supabase session. Returning `null` is valid (no
   * session, i.e. guest bootstrap).
   */
  getSession: () => Promise<Session | null>;

  /**
   * Collect browser fingerprint with a STRICT timeout. The orchestrator
   * passes the timeout budget (ms). Returning `null` after timeout is
   * acceptable — bootstrap must continue. Per plan §10 fingerprint is
   * never allowed to delay bootstrap indefinitely.
   */
  getFingerprint: (timeoutMs: number) => Promise<string | null>;

  /**
   * POST /api/auth/bootstrap. Caller (the orchestrator) supplies the
   * deviceId, fingerprintHash, and optional previousAuthUserId body
   * fields. The dep is responsible for fetch + JSON parsing + HTTP
   * status → discriminated union mapping.
   *
   * MUST return `null` on network/JSON failure so the orchestrator can
   * route to RESPONSE_TEMPORARY.
   */
  callBootstrap: (
    body: BootstrapRequestBody,
  ) => Promise<BootstrapResponseBody | null>;

  /**
   * Apply server-authoritative state. Called EXACTLY ONCE per successful
   * bootstrap response (after the previous user's state has been cleared).
   * The orchestrator guarantees only the latest response triggers this.
   *
   * `applyServerState` is the dependency that wires the new userId into
   * the Zustand store via the existing `applyServerState` helper from
   * `@/lib/game/state/store`. In PR4-4A this is wired by the consumer
   * (AuthProvider) since the store lives outside the orchestrator.
   */
  applyServerState: (args: {
    userId: string;
    isGuest: boolean;
    isNewUser: boolean;
    needsStateLoad: boolean;
    gameState?: Record<string, unknown>;
  }) => void | Promise<void>;

  /**
   * Clear the previous user's game state. Called BEFORE applyServerState
   * when the resolved identity has changed. Ensures plan §5 hard rule:
   * "When the resolved user changes, immediately block gameplay + clear
   * previous user's game state before applying new state."
   */
  clearPreviousUserState: () => void;

  /** Subscribe to Supabase auth state changes. Optional — some test
   *  harnesses do not need it. */
  onAuthStateChange?: (
    handler: (session: Session | null) => void,
  ) => () => void;

  /** Supabase sign-out. Optional — PR4-4B will wire it. */
  signOutSupabase?: () => Promise<{ error: string | null }>;

  /** OAuth sign-in entry point. Optional in tests. */
  signInWithOAuth?: (
    provider: "google" | "github",
    redirectTo: string,
  ) => Promise<{ error: string | null }>;

  /**
   * Best-effort bootstrap telemetry sink. Optional — callers that don't
   * wire telemetry simply never report outcomes. The orchestrator fires
   * this EXACTLY ONCE per terminal bootstrap outcome (ready, conflict,
   * recovery_required, temporary_error, signed_out, signed_in).
   *
   * Implementations should:
   *   - Use navigator.sendBeacon if available (survives page unload).
   *   - Catch and swallow all errors. Telemetry must never crash the
   *     orchestrator state machine.
   *   - Fire-and-forget. The orchestrator does NOT await the promise.
   *
   * Server contract: POST /api/telemetry/bootstrap
   * (see `src/app/api/telemetry/bootstrap/route.ts`).
   */
  emitTelemetry?: (event: BootstrapTelemetryEvent) => void;
}

/**
 * Shape of a bootstrap telemetry event. Mirrors the validator in
 * `src/app/api/telemetry/bootstrap/route.ts`.
 */
export interface BootstrapTelemetryEvent {
  deviceId: string;
  outcome:
    | "ready"
    | "conflict"
    | "recovery_required"
    | "temporary_error"
    | "signed_out"
    | "signed_in";
  source: "deviceId" | "auth" | "fresh" | "sign_out_to_guest" | null;
  durationMs: number | null;
  fingerprintStatus: "ok" | "unavailable" | "timeout" | null;
  stateAtEmit: string | null;
  isGuest: boolean | null;
}

// ─── End of types ──────────────────────────────────────────────────────
//
// `AuthOrchestratorDeps` was a legacy alias for `AuthOrchestratorBootstrapDeps`
// kept during the PR4-4A → PR4-4B migration. It has been removed: callers
// must use `AuthOrchestratorBootstrapDeps` directly. The architecture
// test (tests/architecture/auth-orchestrator.test.ts) enforces this.
