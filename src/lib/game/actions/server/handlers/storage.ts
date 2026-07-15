import { validateUpgradeStorageAction } from "@/lib/game/production/engine/serverEngine";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handleUpgradeStorageAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const resource = payload.resource as string;
  const levels = payload.levels as number;

  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (typeof levels !== "number") {
    return { valid: false, error: "Missing 'levels' number in payload" };
  }

  return validateUpgradeStorageAction(resource, levels, gameState);
}