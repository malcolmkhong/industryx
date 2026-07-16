import { validateClaimDailyRewardAction } from "@/lib/game/production/engine/serverEngine.server";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handleClaimDailyRewardAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const day = payload.day as number;
  if (typeof day !== "number") {
    return { valid: false, error: "Missing 'day' number in payload" };
  }
  return validateClaimDailyRewardAction(day, gameState);
}