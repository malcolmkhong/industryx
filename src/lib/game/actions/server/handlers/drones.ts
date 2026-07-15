import {
  validateCollectDroneAction,
  validateStartDroneMissionAction,
} from "@/lib/game/production/engine/serverEngine";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse } from "../shared/actionTypes";

export function handleStartDroneMissionAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const missionId = payload.missionId as string;
  const droneId = payload.droneId as string;
  const missionFuelCost = Number(payload.missionFuelCost);
  const missionBaseTicks = Number(payload.missionBaseTicks);

  if (!missionId) {
    return { valid: false, error: "Missing missionId in payload" };
  }
  if (!droneId) {
    return { valid: false, error: "Missing droneId in payload" };
  }

  return validateStartDroneMissionAction(missionId, droneId, {
    ...gameState,
    _missionFuelCost: Number.isFinite(missionFuelCost) ? missionFuelCost : 0,
    _missionBaseTicks:
      Number.isFinite(missionBaseTicks) && missionBaseTicks > 0
        ? missionBaseTicks
        : 60,
  } as Partial<GameState>);
}

export function handleCollectDroneAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const droneId = payload.droneId as string;
  const rewardMoney = Number(payload.rewardMoney);
  const rewardResearchPoints = Number(payload.rewardResearchPoints);
  const rewardResources = Array.isArray(payload.rewardResources)
    ? (payload.rewardResources as Array<{ resource: string; amount: number }>)
    : undefined;

  if (!droneId) {
    return { valid: false, error: "Missing droneId in payload" };
  }

  return validateCollectDroneAction(droneId, {
    ...gameState,
    _missionRewardMoney: Number.isFinite(rewardMoney) ? rewardMoney : 0,
    _missionRewardResearchPoints: Number.isFinite(rewardResearchPoints)
      ? rewardResearchPoints
      : 0,
    _missionRewardResources: rewardResources,
  } as Partial<GameState>);
}