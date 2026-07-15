import { BUILDING_DEFS } from "../../../config/configCache";
import { MAX_TIER } from "../../../progression/tiers";
import type { BuildingInstance } from "../../../shared/types/types";
import type { GetFn } from "../_actionTypes";

export function getPlayerGameTierState(get: GetFn) {
  const state = get();
  if (state.buildings.length === 0) return 0;

  const highestBuildingTier = Math.max(
    0,
    ...state.buildings.map(
      (building: BuildingInstance) => BUILDING_DEFS[building.type]?.tier ?? 0,
    ),
  );
  const researchTier = Math.floor(state.completedResearch.length / 3);

  return Math.min(MAX_TIER, Math.max(highestBuildingTier, researchTier));
}
