// ============================================
// FACTORY DOMINION: Production Calculator
// Compatibility barrel for split production math modules.
// ============================================

export type { GameDefs } from "./definitions";
export { getBuildingDef, getWorkerDef } from "./definitions";
export type { MultiplierCache } from "./math/multipliers";
export { buildMultipliers } from "./math/multipliers";
export type { PowerResult } from "./math/power";
export { computePowerGrid } from "./math/power";
export type { BuildResult } from "./math/production";
export { computeProduction } from "./math/production";
export { computeSellMultiplier } from "./math/sell";
export type { PayoutResult } from "./math/payout";
export { computePayout } from "./math/payout";
export type { EndgameResult } from "./math/endgame";
export { computeEndgameIncome } from "./math/endgame";
export type { ProductionSnapshot } from "./snapshot/productionSnapshot";
export { emptyProductionSnapshot } from "./snapshot/emptyProductionSnapshot";
