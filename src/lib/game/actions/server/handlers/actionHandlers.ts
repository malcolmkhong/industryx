import type { GameConfig } from "@/lib/game/config/config";
import type { GameState } from "@/lib/game/shared/types/types";
import type { ActionResponse, ActionType } from "../shared/actionTypes";
import {
  handleBuildAction,
  handleToggleBuildingAction,
  handleUpgradeAction,
} from "./buildings";
import { handleFulfillContractAction } from "./contracts";
import {
  handleCollectDroneAction,
  handleStartDroneMissionAction,
} from "./drones";
import { handleBuyAction, handleSellAction } from "./market";
import { handleCollectPayoutAction } from "./payouts";
import { handlePrestigeAction } from "./prestige";
import { handleClaimQuestAction } from "./quests";
import { handleClaimDailyRewardAction } from "./rewards";
import { handleAddResearchToQueueAction, handleCancelResearchAction, handleRemoveResearchFromQueueAction, handleResearchAction } from "./research";
import { handleSetGameSpeed } from "./speed";
import { handleUpgradeStorageAction } from "./storage";
import {
  handleTransportAction,
  handleUpgradeTransportLineAction,
} from "./transport";
import {
  handleAssignWorkerAction,
  handleHireWorkerAction,
  handleUpgradeWorkerAction,
} from "./workers";

interface DispatchActionInput {
  action: ActionType;
  payload: Record<string, unknown>;
  gameState: Partial<GameState>;
  config: GameConfig;
  serverState: { state_version: number };
  userId: string;
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
    case "cancel_research":
      return handleCancelResearchAction(payload, gameState, config);
    case "add_research_to_queue":
      return handleAddResearchToQueueAction(payload, gameState, config);
    case "remove_research_from_queue":
      return handleRemoveResearchFromQueueAction(payload, gameState, config);
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
