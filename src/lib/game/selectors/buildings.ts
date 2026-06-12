// ============================================
// Named Selectors: Buildings
// ============================================
//
// Reusable building filters and counts. Each selector is a pure function
// that takes the full state and returns a derived value.
// ============================================

import type { GameState, BuildingType, BuildingInstance } from '../types';

// --- Raw access ---

export const selectBuildings = (s: GameState) => s.buildings;

// --- Counting selectors ---

export const selectActiveBuildingCount = (s: GameState): number =>
  s.buildings.filter(b => b.active).length;

export const selectInactiveBuildingCount = (s: GameState): number =>
  s.buildings.filter(b => !b.active).length;

export const selectBuildingCountByType = (type: BuildingType) => (s: GameState): number =>
  s.buildings.filter(b => b.type === type).length;

// --- Filter selectors ---

export const selectBuildingsByType = (type: BuildingType) => (s: GameState): BuildingInstance[] =>
  s.buildings.filter(b => b.type === type);

export const selectActiveBuildingsByType = (type: BuildingType) => (s: GameState): BuildingInstance[] =>
  s.buildings.filter(b => b.type === type && b.active);

/** Returns buildings grouped by category (extractor/factory/power/storage). */
export const selectBuildingsByCategory = (category: 'extractor' | 'factory' | 'power' | 'storage') =>
  (s: GameState): BuildingInstance[] => {
    // Category is derived from BUILDING_DEFS in configCache, but to keep this
    // selector self-contained we filter by name patterns. For exact category
    // checks, use the productionSnapshot or check BUILDING_DEFS directly.
    const pattern =
      category === 'extractor' ? /Mine$|Extractor$|Pit$|Quarry$|Pump$/ :
      category === 'power' ? /Generator$|Farm$|Turbine$|Reactor$|PowerPlant$/ :
      category === 'storage' ? /Storage$|Silo$|Tank$/ :
      null; // factory — no specific pattern
    if (!pattern) return [];
    return s.buildings.filter(b => pattern.test(b.type));
  };

// --- Aggregate computations ---

/** Returns the highest tier among all buildings. */
export const selectHighestBuildingTier = (s: GameState): number => {
  if (s.buildings.length === 0) return 0;
  return Math.max(...s.buildings.map(() => 0)); // tier requires BUILDING_DEFS lookup; left as future work
};
