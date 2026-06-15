// Phase 2.2: Wraps store action mutations with server validation
// Calls /api/game/action and only applies the local change if server approves.

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
 * Phase 2.2: Validate an action with the server before applying locally.
 * Returns { approved: true } if server approves (caller should apply the action).
 * Returns { approved: false, error } if server rejects (caller should NOT apply).
 *
 * The current server validation API only validates the action shape and
 * affordability against the client's claim. Phase 2.3 will make the server
 * load server_game_state for actual validation. Phase 7 will add periodic
 * server-side checks for gradual cheaters.
 */
export async function validateActionWithServer(
  actionType: ValidatedActionType,
  payload: Record<string, unknown>
): Promise<ValidatedActionResult> {
  const validation = await submitActionToServer(actionType, payload);

  if (!validation.valid) {
    return {
      approved: false,
      error: validation.error ?? 'Action rejected by server',
    };
  }

  return { approved: true };
}
