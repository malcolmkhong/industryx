import type { GameConfig } from "@/lib/game/config/config";
import {
  validateAssignWorkerAction,
  validateHireWorkerAction,
  validateUpgradeWorkerAction,
} from "@/lib/game/production/engine/serverEngine";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handleHireWorkerAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const workerType = payload.workerType as string;
  if (!workerType) {
    return { valid: false, error: "Missing workerType in payload" };
  }
  return validateHireWorkerAction(workerType, gameState, config);
}

export function handleAssignWorkerAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const workerId = payload.workerId as string;
  const buildingId = payload.buildingId as string | null | undefined;
  if (!workerId) {
    return { valid: false, error: "Missing workerId in payload" };
  }
  const normalizedBuildingId = buildingId === undefined ? null : buildingId;
  return validateAssignWorkerAction(workerId, normalizedBuildingId, gameState);
}

export function handleUpgradeWorkerAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const workerId = payload.workerId as string;
  if (!workerId || typeof workerId !== "string") {
    return { valid: false, error: "Missing or invalid workerId in payload" };
  }
  return validateUpgradeWorkerAction(workerId, gameState);
}