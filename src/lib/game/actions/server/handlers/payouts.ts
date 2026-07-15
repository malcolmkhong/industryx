import { validateCollectPayoutAction } from "@/lib/game/production/engine/serverEngine";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handleCollectPayoutAction(
  gameState: Partial<GameState>,
): ActionResponse {
  return validateCollectPayoutAction(gameState);
}