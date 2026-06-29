/**
 * utils/gameMath.ts — Pure math helpers extracted from store.ts
 *
 * These functions have ZERO dependencies on the Zustand store.
 * They only read data from GameState objects passed as parameters.
 */

import type { ResourceType, GameState, MegaProjectBonusType } from '@/lib/game/types';

/**
 * Get the current price of a resource from server market or local market.
 */
export function getGlobalPrice(state: GameState, resource: ResourceType): number {
  const global = state.serverMarket?.prices?.find(p => p.resource === resource);
  if (global) return global.currentPrice;
  const local = state.market.find(m => m.resource === resource);
  return local?.currentPrice ?? 0;
}

/**
 * Compute total bonus value from completed mega projects for a given bonus type.
 */
export function getMegaProjectBonus(
  megaProjects: { completed: boolean; bonus: { type: MegaProjectBonusType; value: number } }[],
  bonusType: MegaProjectBonusType,
): number {
  return megaProjects
    .filter(p => p.completed && p.bonus.type === bonusType)
    .reduce((sum, p) => sum + p.bonus.value, 0);
}
