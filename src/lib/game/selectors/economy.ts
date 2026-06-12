// ============================================
// Named Selectors: Economy
// ============================================
//
// Reusable selector functions for economy-related state slices.
// Use with: useGameStore(selectMoney) instead of useGameStore(s => s.money)
//
// Benefits over inline selectors:
// - Testable in isolation (pure functions)
// - Reusable across multiple components
// - Named intent (selectActiveFactoryCount vs s => s.buildings.filter(b => b.active).length)
// - Easier to profile (named in React DevTools)
//
// Selector signature convention: each selector takes the full state (s) and
// returns a derived value. They are pure functions with no side effects.
// ============================================

import type { GameState } from '../types';
import type { ResourceType } from '../types';

// --- Money & Income ---

export const selectMoney = (s: GameState) => s.money;
export const selectTotalMoneyEarned = (s: GameState) => s.totalMoneyEarned;

// --- Game Loop ---

export const selectGameTick = (s: GameState) => s.gameTick;
export const selectGameSpeed = (s: GameState) => s.gameSpeed;
export const selectPaused = (s: GameState) => s.paused;

// --- Resources ---

export const selectResources = (s: GameState) => s.resources;
export const selectResourceCapacity = (s: GameState) => s.resourceCapacity;
export const selectAutoSellResources = (s: GameState) => s.autoSellResources;
export const selectStorageUpgradeLevels = (s: GameState) => s.storageUpgradeLevels;

// --- Production (delegates to productionSnapshot) ---

export const selectProductionSnapshot = (s: GameState) => s.productionSnapshot;
export const selectResearchPointsPerTick = (s: GameState) =>
  s.productionSnapshot?.researchPointsPerTick ?? 0;

// --- Resource filtering helpers ---

/** Returns resources below 50% capacity (low resources that need attention). */
export const selectLowResources = (s: GameState): ResourceType[] => {
  const result: ResourceType[] = [];
  for (const [key, amount] of Object.entries(s.resources) as [ResourceType, number][]) {
    const capacity = s.resourceCapacity[key] ?? 0;
    if (capacity > 0 && amount < capacity * 0.5) {
      result.push(key);
    }
  }
  return result;
};

/** Returns top N resources by amount (for topResources display, replaces L3). */
export const selectTopResources = (n: number) => (s: GameState): ResourceType[] => {
  const entries = Object.entries(s.resources) as [ResourceType, number][];
  return entries
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([key]) => key);
};
