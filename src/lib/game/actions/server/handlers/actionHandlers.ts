import { saveServerGameStateOptimistic } from "@/lib/db/game/serverGameState";
import type { GameConfig } from "@/lib/game/config/config";
import {
  validateAssignWorkerAction,
  validateBuildAction,
  validateBuyAction,
  validateClaimDailyRewardAction,
  validateClaimQuestAction,
  validateCollectDroneAction,
  validateCollectPayoutAction,
  validateFulfillContractAction,
  validateHireWorkerAction,
  validatePrestigeAction,
  validateResearchAction,
  validateSellAction,
  validateStartDroneMissionAction,
  validateToggleBuildingAction,
  validateTransportAction,
  validateUpgradeAction,
  validateUpgradeStorageAction,
  validateUpgradeTransportLineAction,
  validateUpgradeWorkerAction,
} from "@/lib/game/production/engine/serverEngine";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse, ActionType } from "../shared/actionTypes";

interface DispatchActionInput {
  action: ActionType;
  payload: Record<string, unknown>;
  gameState: Partial<GameState>;
  config: GameConfig;
  serverState: { state_version: number };
  userId: string;
}

function handleBuildAction(
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

function handleSellAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const resource = payload.resource as string;
  const amount = payload.amount as number;

  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (!amount || amount <= 0) {
    return { valid: false, error: "Invalid amount in payload" };
  }

  return validateSellAction(resource, amount, gameState);
}

function handleBuyAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const resource = payload.resource as string;
  const amount = payload.amount as number;

  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (!amount || amount <= 0) {
    return { valid: false, error: "Invalid amount in payload" };
  }

  return validateBuyAction(resource, amount, gameState);
}

function handleResearchAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const researchId = payload.researchId as string;
  if (!researchId) {
    return { valid: false, error: "Missing researchId in payload" };
  }

  return validateResearchAction(researchId, gameState, config);
}

function handleUpgradeAction(
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

function handleTransportAction(
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

function handleUpgradeTransportLineAction(
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

function handlePrestigeAction(
  _payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): Promise<ActionResponse> {
  return validatePrestigeAction(gameState);
}

function handleStartDroneMissionAction(
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

function handleCollectDroneAction(
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

function handleToggleBuildingAction(
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

function handleUpgradeStorageAction(
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

function handleHireWorkerAction(
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

function handleAssignWorkerAction(
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

function handleUpgradeWorkerAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const workerId = payload.workerId as string;
  if (!workerId || typeof workerId !== "string") {
    return { valid: false, error: "Missing or invalid workerId in payload" };
  }
  return validateUpgradeWorkerAction(workerId, gameState);
}

function handleCollectPayoutAction(
  gameState: Partial<GameState>,
): ActionResponse {
  return validateCollectPayoutAction(gameState);
}

function handleClaimQuestAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const questId = payload.questId as string;
  if (!questId) {
    return { valid: false, error: "Missing questId in payload" };
  }
  return validateClaimQuestAction(questId, gameState);
}

function handleClaimDailyRewardAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const day = payload.day as number;
  if (typeof day !== "number") {
    return { valid: false, error: "Missing 'day' number in payload" };
  }
  return validateClaimDailyRewardAction(day, gameState);
}

function handleFulfillContractAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const contractId = payload.contractId as string;
  if (!contractId) {
    return { valid: false, error: "Missing contractId in payload" };
  }
  return validateFulfillContractAction(contractId, gameState);
}

function handleSetGameSpeed(
  payload: Record<string, unknown>,
  serverState: { state_version: number },
  userId: string,
): ActionResponse {
  const speed = payload.speed as number;
  const allowedSpeeds = [1, 2, 5, 10];

  if (typeof speed !== "number" || !allowedSpeeds.includes(speed)) {
    return {
      valid: false,
      error: `Invalid game speed: ${speed}. Allowed: ${allowedSpeeds.join(", ")}`,
    };
  }

  const currentVersion = Number(serverState.state_version);
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    console.error(
      "[ActionAPI] Invalid state_version for set_game_speed:",
      serverState.state_version,
    );
    return {
      valid: false,
      error: "Invalid server state version",
    };
  }
  saveServerGameStateOptimistic(userId, currentVersion, {
    game_speed: speed,
    state_version: currentVersion + 1,
  }).catch((err) => {
    console.error("[ActionAPI] Failed to persist game_speed:", err);
  });

  return { valid: true };
}

export function dispatchAction({
  action,
  payload,
  gameState,
  config,
  serverState,
  userId,
}: DispatchActionInput): ActionResponse | Promise<ActionResponse> {
  switch (action) {
    case "build":
      return handleBuildAction(payload, gameState, config);
    case "sell":
      return handleSellAction(payload, gameState);
    case "buy":
      return handleBuyAction(payload, gameState);
    case "research":
      return handleResearchAction(payload, gameState, config);
    case "upgrade":
      return handleUpgradeAction(payload, gameState, config);
    case "transport":
      return handleTransportAction(payload, gameState, config);
    case "set_game_speed":
      return handleSetGameSpeed(payload, serverState, userId);
    case "toggle_building":
      return handleToggleBuildingAction(payload, gameState);
    case "upgrade_storage":
      return handleUpgradeStorageAction(payload, gameState);
    case "hire_worker":
      return handleHireWorkerAction(payload, gameState, config);
    case "assign_worker":
      return handleAssignWorkerAction(payload, gameState);
    case "upgrade_worker":
      return handleUpgradeWorkerAction(payload, gameState);
    case "collect_payout":
      return handleCollectPayoutAction(gameState);
    case "claim_quest":
      return handleClaimQuestAction(payload, gameState);
    case "claim_daily_reward":
      return handleClaimDailyRewardAction(payload, gameState);
    case "fulfill_contract":
      return handleFulfillContractAction(payload, gameState);
    case "start_drone_mission":
      return handleStartDroneMissionAction(payload, gameState);
    case "collect_drone":
      return handleCollectDroneAction(payload, gameState);
    case "upgrade_transport_line":
      return handleUpgradeTransportLineAction(payload, gameState, config);
    case "do_prestige":
      return handlePrestigeAction(payload, gameState);
    default:
      return { valid: false, error: `Unhandled action: ${action}` };
  }
}
