// Map server validation response to client-ValidatedActionResult.
// Wraps the per-action server submission with the soft limited-mode
// gate and the correctedState allow-list enforcement.

"use client";

import { gateIfLimited } from "@/lib/auth/limitedMode";
import { submitActionToServer } from "./serverActions";
import {
  ACTIONS_WITH_SERVER_STATE,
  type ValidatedActionResult,
  type ValidatedActionType,
} from "./validationTypes";

/**
 * Phase 2.3: Validate an action with the server (BLOCKING).
 *
 * Returns { approved: true } if server approves (caller should apply the action).
 * Returns { approved: false, error } if server rejects (caller should NOT apply).
 *
 * If the server is unreachable, `submitActionToServer` returns
 * { valid: false }. Economy mutations fail closed; callers must show the
 * server error and must not apply a local fallback mutation.
 *
 * @param actionType The type of action being validated
 * @param payload The action-specific payload
 * @param requestId Phase 2.3: UUID v4 nonce for replay protection. If not
 *   provided, one will be generated. Reusing a requestId causes a 409 from
 *   the server.
 */
export async function validateActionWithServer(
  actionType: ValidatedActionType,
  payload: Record<string, unknown>,
  requestId?: string,
): Promise<ValidatedActionResult> {
  // Soft gate: if the user is in fingerprint-limited mode, block the
  // action and re-show the limited-mode modal. Server-side checks still
  // run, but the user never reaches them because we short-circuit here.
  if (gateIfLimited()) {
    return {
      approved: false,
      error: "limited_mode: action blocked until fingerprint or sign-in",
    };
  }

  const validation = await submitActionToServer(actionType, payload, requestId);

  if (!validation.valid) {
    return {
      approved: false,
      error: validation.error ?? "Action rejected by server",
    };
  }

  if (
    ACTIONS_WITH_SERVER_STATE.has(actionType) &&
    validation.correctedState === undefined
  ) {
    return {
      approved: false,
      error: "Server did not return authoritative state. Please retry.",
    };
  }

  // Surface the server-authoritative correctedState to callers. Economy and
  // progression actions require it; `set_game_speed` is the only current
  // exception because the server route persists the scalar directly.
  return {
    approved: true,
    correctedState: validation.correctedState,
  };
}
