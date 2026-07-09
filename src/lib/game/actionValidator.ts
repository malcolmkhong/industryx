// Phase 2.3: Wraps store action mutations with server validation.
// This is now BLOCKING (await) — callers must wait for the server response
// before applying the local mutation. If the server rejects, the caller
// must NOT apply the action.
//
// The server validates against server_game_state (authoritative), not the
// client-sent gameState. Replay protection is provided by `requestId`.

"use client";

import type { ServerGameData } from "@/lib/game/types";
import { gateIfLimited } from "@/lib/auth/limitedMode";
import { submitActionToServer } from "./serverActions";

export type ValidatedActionType =
  | "build"
  | "sell"
  | "buy"
  | "research"
  | "upgrade"
  | "transport"
  | "toggle_building"
  | "hire_worker"
  | "assign_worker"
  | "do_prestige"
  | "set_game_speed"
  | "buy_market"
  | "sell_market"
  | "bulk_build"
  | "bulk_sell"
  | "start_drone_mission"
  | "collect_drone"
  | "claim_quest"
  | "upgrade_storage"
  | "collect_payout"
  | "fulfill_contract"
  | "claim_daily_reward"
  | "upgrade_transport_line";

export interface ValidatedActionResult {
  approved: boolean;
  error?: string;
  /**
   * When the server is authoritative on the action result, it returns
   * the authoritative post-action state to apply on the client. Callers
   * SHOULD use these fields to update local state rather than computing
   * cost/deductions locally — this prevents client/server divergence
   * when the cost formula, mega-project bonuses, or scaled-cost exponent
   * differs between the two sides.
   *
   * Phase 13 (2026-07-10, Option C): this is now a precise
   * Partial<ServerGameData>. UI fields (hydrated, activeTab, etc.)
   * NEVER appear here — server-authoritative data only.
   */
  correctedState?: Partial<ServerGameData>;
}

/**
 * Phase 2.3: Validate an action with the server (BLOCKING).
 *
 * Returns { approved: true } if server approves (caller should apply the action).
 * Returns { approved: false, error } if server rejects (caller should NOT apply).
 *
 * If the server is unreachable, `submitActionToServer` returns { valid: true }
 * (degraded mode) so the local action still proceeds — this preserves offline
 * tolerance. The catch-up will happen on the next 120s cloud save.
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

  // Surface the server-authoritative correctedState (if any) to callers.
  // Only present for actions where the server computes the authoritative
  // outcome (e.g., build, upgrade). Other actions just get { approved: true }.
  // Phase 13: correctedState is now strictly Partial<ServerGameData>;
  // serverActions.ts is responsible for typing the API response correctly.
  return {
    approved: true,
    correctedState: validation.correctedState,
  };
}
