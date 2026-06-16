// Phase 2.3: Wraps store action mutations with server validation.
// This is now BLOCKING (await) — callers must wait for the server response
// before applying the local mutation. If the server rejects, the caller
// must NOT apply the action.
//
// The server validates against server_game_state (authoritative), not the
// client-sent gameState. Replay protection is provided by `requestId`.

'use client';

import { submitActionToServer } from './serverActions';

export type ValidatedActionType =
  | 'build'
  | 'sell'
  | 'buy'
  | 'research'
  | 'upgrade'
  | 'transport'
  | 'toggle_building'
  | 'hire_worker'
  | 'assign_worker'
  | 'do_prestige'
  | 'set_game_speed'
  | 'buy_market'
  | 'sell_market'
  | 'bulk_build'
  | 'bulk_sell'
  | 'start_drone_mission'
  | 'collect_drone'
  | 'claim_quest';

export interface ValidatedActionResult {
  approved: boolean;
  error?: string;
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
  const validation = await submitActionToServer(actionType, payload, requestId);

  if (!validation.valid) {
    return {
      approved: false,
      error: validation.error ?? 'Action rejected by server',
    };
  }

  return { approved: true };
}
