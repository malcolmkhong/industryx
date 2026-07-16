import { validateFulfillContractAction } from "@/lib/game/production/engine/serverEngine.server";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handleFulfillContractAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const contractId = payload.contractId as string;
  if (!contractId) {
    return { valid: false, error: "Missing contractId in payload" };
  }
  return validateFulfillContractAction(contractId, gameState);
}