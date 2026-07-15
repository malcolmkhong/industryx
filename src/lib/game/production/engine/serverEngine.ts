// ============================================
// FACTORY DOMINION: Server-Side Game Engine
// Compatibility barrel for split server engine modules.
// ============================================

export {
  buildMultipliersServer,
  buildWorkerDefsMap,
  computeEndgameIncomeServer,
  computePayoutServer,
  computePowerGridServer,
  computeProductionServer,
  computeSellMultiplierServer,
  getBuildingDef,
} from "./math/index.server";
export { buildProductionSnapshotServer } from "./tick/productionSnapshot";
export { runServerTicks, type TickResult } from "./tick/runServerTicks";
export { validateBuildAction } from "./validators/build";
export { validateBuyAction, validateSellAction } from "./validators/trade";
export {
  validateAddResearchToQueueAction,
  validateCancelResearchAction,
  validateRemoveResearchFromQueueAction,
  validateResearchAction,
  RESEARCH_QUEUE_MAX,
} from "./validators/research";
export { validateUpgradeAction } from "./validators/upgrade";
export { validateToggleBuildingAction } from "./validators/toggleBuilding";
export {
  validateAssignWorkerAction,
  validateHireWorkerAction,
  validateUpgradeWorkerAction,
} from "./validators/workers";
export {
  validateCollectPayoutAction,
  validateClaimQuestAction,
} from "./validators/quests";
export { validateClaimDailyRewardAction } from "./validators/rewards";
export { validateFulfillContractAction } from "./validators/contracts";
export { validateUpgradeStorageAction } from "./validators/storage";
export {
  validateTransportAction,
  validateUpgradeTransportLineAction,
} from "./validators/transport";
export {
  validateCollectDroneAction,
  validateStartDroneMissionAction,
} from "./validators/drones";
export { validatePrestigeAction } from "./validators/prestige";
