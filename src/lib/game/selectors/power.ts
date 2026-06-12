// ============================================
// Named Selectors: Power
// ============================================
//
// Power grid related selectors. Compute efficiency, overload, and
// per-plant output.
// ============================================

import type { GameState, BuildingInstance } from '../types';

// --- Raw access ---

export const selectPowerGrid = (s: GameState) => s.powerGrid;

// --- Computed selectors ---

/** Power production efficiency (0-1). 1.0 = enough power for all consumers. */
export const selectPowerEfficiency = (s: GameState): number => {
  if (s.powerGrid.totalProduction === 0) return 0;
  return Math.min(1, s.powerGrid.totalProduction / Math.max(1, s.powerGrid.totalConsumption));
};

/** Power utilization as a percentage (0-100). 100 = at capacity. */
export const selectPowerPercent = (s: GameState): number => {
  if (s.powerGrid.totalProduction === 0) return 0;
  return Math.min(100, (s.powerGrid.totalConsumption / s.powerGrid.totalProduction) * 100);
};

/** Power deficit: positive = need more, negative = surplus. */
export const selectPowerDeficit = (s: GameState): number =>
  s.powerGrid.totalConsumption - s.powerGrid.totalProduction;

/** Is the grid overloaded? (consumption > production) */
export const selectPowerOverloaded = (s: GameState): boolean =>
  s.powerGrid.totalConsumption > s.powerGrid.totalProduction;

// --- Per-plant selectors ---

/** Returns all power plant buildings (subset of power category). */
export const selectPowerPlants = (s: GameState): BuildingInstance[] =>
  s.powerGrid.plants || [];

/** Returns active power plants only. */
export const selectActivePowerPlants = (s: GameState): BuildingInstance[] =>
  (s.powerGrid.plants || []).filter(p => p.active);
