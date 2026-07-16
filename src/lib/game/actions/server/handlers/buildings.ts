import type { GameConfig } from "@/lib/game/config/config";
import {
  validateBuildAction,
  validateToggleBuildingAction,
  validateUpgradeAction,
} from "@/lib/game/production/engine/serverEngine.server";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handleBuildAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const buildingType = payload.buildingType as string;
  if (!buildingType) {
    return { valid: false, error: "Missing buildingType in payload" };
  }

  return validateBuildAction(buildingType, gameState, config);
}

export function handleUpgradeAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const buildingId = payload.buildingId as string;
  if (!buildingId) {
    return { valid: false, error: "Missing buildingId in payload" };
  }

  return validateUpgradeAction(buildingId, gameState, config);
}

export function handleToggleBuildingAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const buildingId = payload.buildingId as string;
  const enabled = payload.enabled as boolean;

  if (!buildingId) {
    return { valid: false, error: "Missing buildingId in payload" };
  }
  if (typeof enabled !== "boolean") {
    return {
      valid: false,
      error: "Missing 'enabled' boolean in payload",
    };
  }

  return validateToggleBuildingAction(buildingId, enabled, gameState);
}