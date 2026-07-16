// ============================================
// FACTORY DOMINION: Server-Side Game Engine
// Compatibility barrel for split server engine modules.
// ============================================
//
// P2-10 (BUILDING_PRODUCTION_AUDIT §10.4, 2026-07-16):
// The thin `*.server.ts` math wrappers and their `math/index.server`
// barrel were removed; the underlying functions are now imported
// directly from `productionCalculator`. `multipliers.server.ts` is
// kept because it does real server-specific work (cache builder,
// worker-defs map).
//
// 2026-07-16: Renamed from `serverEngine.ts` → `serverEngine.server.ts`
// so the Next.js bundler enforces server-only execution. The barrel
// transitively re-exports `validators/prestige`, which imports
// `initialState.server` → `getDbClient.server` → `next/headers`.
// A `.server.ts` suffix keeps the whole graph out of the client bundle.
// Client code that needs client-safe constants from this barrel
// (e.g. `RESEARCH_QUEUE_MAX`) should import them directly from the
// `validators/*.ts` source module instead of going through this barrel.

export {
  buildMultipliersServer,
  buildWorkerDefsMap,
  getBuildingDef,
} from "./math/multipliers.server";
export {
  computeProduction,
  computePowerGrid,
  computePayout,
  computeSellMultiplier,
  computeEndgameIncome,
} from "../productionCalculator";
export { buildProductionSnapshotServer } from "./tick/productionSnapshot";
export { runServerTicks, type TickResult } from "./tick/runServerTicks";
export { validateBuildAction } from "./validators/build";
export { validateBuyAction, validateSellAction } from "./validators/trade";
export {
  validateAddResearchToQueueAction,
  validateCancelResearchAction,
  validateRemoveResearchFromQueueAction,
  validateResearchAction,
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
