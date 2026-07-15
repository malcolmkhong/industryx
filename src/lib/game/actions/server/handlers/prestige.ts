import { validatePrestigeAction } from "@/lib/game/production/engine/serverEngine";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handlePrestigeAction(
  _payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): Promise<ActionResponse> {
  return validatePrestigeAction(gameState);
}