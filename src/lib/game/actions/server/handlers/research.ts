import type { GameConfig } from "@/lib/game/config/config";
import {
  validateAddResearchToQueueAction,
  validateCancelResearchAction,
  validateRemoveResearchFromQueueAction,
  validateResearchAction,
} from "@/lib/game/production/engine/serverEngine";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handleResearchAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const researchId = payload.researchId as string;
  if (!researchId) {
    return { valid: false, error: "Missing researchId in payload" };
  }

  return validateResearchAction(researchId, gameState, config);
}

/**
 * Cancel an in-flight research. Server-authoritative:
 *   - `researchId` is required and must match `state.activeResearch`
 *   - The validator rejects if no research is active or it's already
 *     been completed
 *   - Cost refund is computed inside the validator from
 *     `config.research` — never trust a client-supplied cost
 */
export function handleCancelResearchAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const researchId = payload.researchId as string;
  if (!researchId) {
    return { valid: false, error: "Missing researchId in payload" };
  }
  const refundFractionRaw = payload.refundFraction;
  const refundFraction =
    typeof refundFractionRaw === "number"
      ? refundFractionRaw
      : 1;

  return validateCancelResearchAction(
    researchId,
    gameState,
    config,
    refundFraction,
  );
}

/**
 * Queue the given research id. Server-authoritative; the validator
 * looks up `cost` from `config.research` and refuses if the queue
 * is full, the id is already active/queued/completed, or RP is
 * insufficient.
 */
export function handleAddResearchToQueueAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const researchId = payload.researchId as string;
  if (!researchId) {
    return { valid: false, error: "Missing researchId in payload" };
  }
  return validateAddResearchToQueueAction(researchId, gameState, config);
}

/**
 * Remove a queued research id. Refunds the pre-paid RP cost.
 */
export function handleRemoveResearchFromQueueAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const researchId = payload.researchId as string;
  if (!researchId) {
    return { valid: false, error: "Missing researchId in payload" };
  }
  return validateRemoveResearchFromQueueAction(researchId, gameState, config);
}
