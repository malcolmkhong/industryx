/**
 * orchestrator/state — client orchestrator state machine.
 *
 * Implements plan §5 from AUTH_ORCHESTRATOR_REDESIGN_PLAN.md.
 *
 * States (8 total):
 *   idle                 no bootstrap started.
 *   resolving_session    waiting for Supabase session result.
 *   bootstrapping        latest bootstrap request in flight.
 *   ready                validated state applied.
 *   conflict             identity/account conflict requires user resolution.
 *   recovery_required    unsafe saved state; ordinary retry must not loop.
 *   temporary_error      retry may succeed.
 *   signed_out           temporary transition state after sign-out.
 *
 * Transitions (decision table):
 *   idle -> resolving_session                on STARTUP (mount)
 *   resolving_session -> bootstrapping       on SESSION_RESOLVED
 *   bootstrapping -> ready                   on RESPONSE_BOOTSTRAP_READY (200)
 *   bootstrapping -> conflict                on RESPONSE_CONFLICT (409)
 *   bootstrapping -> recovery_required       on RESPONSE_RECOVERY (422)
 *   bootstrapping -> temporary_error         on RESPONSE_TEMPORARY (429/503/5xx)
 *   ready -> signed_out                      on SIGN_OUT (user clicks sign-out)
 *   ready -> resolving_session               on AUTH_USER_CHANGED (e.g., OAuth callback, account switch)
 *   signed_out -> resolving_session          on SIGN_OUT_COMPLETE (after server sign-out, guest bootstrap triggered)
 *   temporary_error -> resolving_session     on RETRY
 *   conflict / recovery_required stay sticky (no auto-recovery)
 *
 * Hard rules:
 *   - Only the latest in-flight request may apply state. Stale-response
 *     rejection is the caller's responsibility (version guard).
 *   - Guest bootstrap response must not overwrite a later authenticated
 *     response. The orchestrator tracks previousAuthUserId on the body.
 *   - When the resolved user changes, the orchestrator must clear the
 *     previous user's game state BEFORE applying new state.
 */

import type { BootstrapResponseBody, OrchestratorStatus } from "./types";

// ─── Transition events ──────────────────────────────────────────────────

export type TransitionEvent =
  | { type: "STARTUP" }
  | { type: "SESSION_RESOLVED" }
  | {
      type: "RESPONSE_BOOTSTRAP_READY";
      response: Extract<BootstrapResponseBody, { code: "BOOTSTRAP_READY" }>;
    }
  | {
      type: "RESPONSE_CONFLICT";
      response: Extract<
        BootstrapResponseBody,
        { code: "ACCOUNT_PROGRESS_CONFLICT" | "DEVICE_BOUND_TO_OTHER_USER" }
      >;
    }
  | {
      type: "RESPONSE_RECOVERY";
      response: Extract<
        BootstrapResponseBody,
        { code: "STATE_RECOVERY_REQUIRED" }
      >;
    }
  | {
      type: "RESPONSE_TEMPORARY";
      response: Extract<
        BootstrapResponseBody,
        {
          code:
            | "BOOTSTRAP_RATE_LIMITED"
            | "BOOTSTRAP_UNAVAILABLE"
            | "INTERNAL_BOOTSTRAP_ERROR"
            | "INVALID_BOOTSTRAP_REQUEST"
            | "INVALID_SESSION";
        }
      >;
    }
  | { type: "AUTH_USER_CHANGED"; userId: string | null }
  | { type: "SIGN_OUT" }
  | { type: "SIGN_OUT_COMPLETE" }
  | { type: "RETRY" };

// ─── Side effect hints ──────────────────────────────────────────────────

export type TransitionEffect =
  | "block_gameplay"
  | "clear_previous_user_state"
  | "apply_ready_response"
  | "apply_conflict_response"
  | "apply_recovery_response"
  | "apply_temporary_error_response"
  | "trigger_sign_out_bootstrap";

export interface TransitionOutcome {
  nextStatus: OrchestratorStatus;
  effects: TransitionEffect[];
}

// ─── Decision table ─────────────────────────────────────────────────────

/**
 * Pure function. Caller passes the current status + an event; receives the
 * next status and the list of side effects the caller must apply.
 *
 * IMPORTANT: This function does NOT mutate any state and does NOT throw.
 * It is the orchestrator's responsibility to wire effects back into the
 * state machine (e.g., calling applyServerState after a ready response).
 */
export function transition(
  current: OrchestratorStatus,
  event: TransitionEvent,
): TransitionOutcome {
  switch (event.type) {
    case "STARTUP": {
      // Only valid from idle. Any other state is a no-op (do not re-enter
      // resolving_session if startup is somehow re-fired).
      if (current === "idle") {
        return {
          nextStatus: "resolving_session",
          effects: ["block_gameplay"],
        };
      }
      return { nextStatus: current, effects: [] };
    }

    case "SESSION_RESOLVED": {
      if (current === "resolving_session") {
        return {
          nextStatus: "bootstrapping",
          effects: [],
        };
      }
      // Idempotent: re-entering SESSION_RESOLVED from a later state is a no-op.
      return { nextStatus: current, effects: [] };
    }

    case "RESPONSE_BOOTSTRAP_READY": {
      // The CALLER must guarantee this is the latest response (version guard).
      // If a stale response somehow reaches us, we still apply — but the
      // orchestrator will drop the result via its own stale check before
      // calling this transition.
      if (current === "bootstrapping" || current === "signed_out") {
        return {
          nextStatus: "ready",
          effects: ["apply_ready_response"],
        };
      }
      return { nextStatus: current, effects: [] };
    }

    case "RESPONSE_CONFLICT": {
      if (current === "bootstrapping") {
        return {
          nextStatus: "conflict",
          effects: ["apply_conflict_response", "block_gameplay"],
        };
      }
      return { nextStatus: current, effects: [] };
    }

    case "RESPONSE_RECOVERY": {
      if (current === "bootstrapping") {
        return {
          nextStatus: "recovery_required",
          effects: ["apply_recovery_response", "block_gameplay"],
        };
      }
      return { nextStatus: current, effects: [] };
    }

    case "RESPONSE_TEMPORARY": {
      if (current === "bootstrapping") {
        return {
          nextStatus: "temporary_error",
          effects: ["apply_temporary_error_response"],
        };
      }
      return { nextStatus: current, effects: [] };
    }

    case "AUTH_USER_CHANGED": {
      // Plan §5: ready -> resolving_session when auth user changes (e.g.,
      // OAuth completed, account switched, token refreshed with new user).
      if (current === "ready" || current === "signed_out") {
        return {
          nextStatus: "resolving_session",
          effects: ["clear_previous_user_state", "block_gameplay"],
        };
      }
      return { nextStatus: current, effects: [] };
    }

    case "SIGN_OUT": {
      // User clicked sign-out. Move to signed_out so the UI can show a
      // spinner and so the orchestrator can run guest bootstrap next.
      if (current === "ready") {
        return {
          nextStatus: "signed_out",
          effects: ["block_gameplay"],
        };
      }
      // If sign-out is fired while still bootstrapping or from another
      // state, treat as no-op (caller should wait for ready first).
      return { nextStatus: current, effects: [] };
    }

    case "SIGN_OUT_COMPLETE": {
      // After Supabase sign-out completes, trigger guest bootstrap.
      // signed_out -> resolving_session, then the bootstrap pipeline takes
      // over with previousAuthUserId in the body.
      if (current === "signed_out") {
        return {
          nextStatus: "resolving_session",
          effects: ["trigger_sign_out_bootstrap"],
        };
      }
      return { nextStatus: current, effects: [] };
    }

    case "RETRY": {
      // Only temporary_error can recover via RETRY. Conflict and
      // recovery_required are sticky — they require explicit user action
      // (sign-out, switch account, support) — so RETRY is intentionally
      // ignored for them.
      if (current === "temporary_error") {
        return {
          nextStatus: "resolving_session",
          effects: ["block_gameplay"],
        };
      }
      return { nextStatus: current, effects: [] };
    }

    default: {
      // Exhaustive — if a new event type is added, this forces a compile error.
      const _exhaustive: never = event;
      void _exhaustive;
      return { nextStatus: current, effects: [] };
    }
  }
}

/**
 * Maps a raw bootstrap HTTP response body to a transition event. Network
 * failures (fetch threw, JSON parse failed, 5xx without body) are mapped to
 * RESPONSE_TEMPORARY so the orchestrator surfaces temporary_error and the
 * UI can offer retry.
 */
export function responseBodyToEvent(
  body: BootstrapResponseBody | null,
  fallbackReason: "network" | "internal" = "network",
): TransitionEvent | null {
  if (!body) {
    return {
      type: "RESPONSE_TEMPORARY",
      response: {
        code:
          fallbackReason === "network"
            ? "BOOTSTRAP_UNAVAILABLE"
            : "INTERNAL_BOOTSTRAP_ERROR",
      },
    };
  }
  switch (body.code) {
    case "BOOTSTRAP_READY":
      return { type: "RESPONSE_BOOTSTRAP_READY", response: body };
    case "ACCOUNT_PROGRESS_CONFLICT":
    case "DEVICE_BOUND_TO_OTHER_USER":
      return { type: "RESPONSE_CONFLICT", response: body };
    case "STATE_RECOVERY_REQUIRED":
      return { type: "RESPONSE_RECOVERY", response: body };
    case "BOOTSTRAP_RATE_LIMITED":
    case "BOOTSTRAP_UNAVAILABLE":
    case "INTERNAL_BOOTSTRAP_ERROR":
    case "INVALID_SESSION":
      // Retryable: rate-limit, transient outage, or 500 from a
      // request the user can re-fire. Retrying with the same body
      // may succeed if the failure was transient.
      return { type: "RESPONSE_TEMPORARY", response: body };
    case "INVALID_BOOTSTRAP_REQUEST":
      // L4 audit fix: 400 client errors are NOT retryable. Mapping
      // this to RESPONSE_TEMPORARY caused a retry loop in dev when
      // a malformed body was sent. Map to RECOVERY (sticky) so the
      // user sees a recovery screen and has to refresh / clear
      // localStorage to recover.
      //
      // The orchestrator's RESPONSE_RECOVERY.response requires
      // `code: "STATE_RECOVERY_REQUIRED"` (see types.ts:88). The
      // raw INVALID_BOOTSTRAP_REQUEST body has a different code
      // so we translate to the canonical recovery shape.
      return {
        type: "RESPONSE_RECOVERY",
        response: { code: "STATE_RECOVERY_REQUIRED" },
      };
    default: {
      const _exhaustive: never = body;
      void _exhaustive;
      return null;
    }
  }
}
