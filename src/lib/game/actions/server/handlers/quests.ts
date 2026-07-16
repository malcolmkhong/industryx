import { validateClaimQuestAction } from "@/lib/game/production/engine/serverEngine.server";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handleClaimQuestAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const questId = payload.questId as string;
  if (!questId) {
    return { valid: false, error: "Missing questId in payload" };
  }
  return validateClaimQuestAction(questId, gameState);
}