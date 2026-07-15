import type { GameConfig } from "@/lib/game/config/config";
import {
  validateTransportAction,
  validateUpgradeTransportLineAction,
} from "@/lib/game/production/engine/serverEngine";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handleTransportAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const transportType = payload.transportType as string;
  const fromBuildingId = payload.fromBuildingId as string;
  const toBuildingId = payload.toBuildingId as string;
  const resource = payload.resource as string;

  if (!transportType) {
    return { valid: false, error: "Missing transportType in payload" };
  }
  if (!fromBuildingId || !toBuildingId) {
    return {
      valid: false,
      error: "Missing fromBuildingId or toBuildingId in payload",
    };
  }
  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }

  return validateTransportAction(
    transportType,
    fromBuildingId,
    toBuildingId,
    resource,
    gameState,
    config,
  );
}

export function handleUpgradeTransportLineAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const lineId = payload.lineId as string;
  if (!lineId) {
    return { valid: false, error: "Missing lineId in payload" };
  }
  return validateUpgradeTransportLineAction(lineId, gameState, config);
}