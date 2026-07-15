/**
 * utils/costCalculator.ts — Building cost, capacity, and unlock calculations
 *
 * Extracted from store.ts top-level functions.
 * Dependencies: configCache, productionCalculator (buildMultipliers), types.
 * Zero Zustand dependencies.
 */

import type { ResourceType, BuildingType, GameState } from '@/lib/game/shared/types/types';
import { BUILDING_DEFS, RESEARCH_TREE } from '@/lib/game/config/configCache';
import { buildMultipliers, type MultiplierCache } from '@/lib/game/production/productionCalculator';

/**
 * Calculate building cost with multiplier, cost reduction, and floor.
 */
export function getBuildingCost(type: BuildingType, currentCount: number, costReduction = 0): number {
  const def = BUILDING_DEFS[type];
  if (!def) return Infinity;
  const baseMoneyCost = def.baseCost.find(c => c.resource === 'money')?.amount ?? 0;
  const rawCost = Math.floor(baseMoneyCost * Math.pow(def.costMultiplier, currentCount));
  return Math.max(1, Math.floor(rawCost * (1 - costReduction)));
}

/**
 * Check if a research is unlocked by its prerequisites.
 */
export function isResearchUnlocked(researchId: string, completedResearch: string[]): boolean {
  const node = RESEARCH_TREE.find(r => r.id === researchId);
  if (!node) return false;
  return node.prerequisites.every(pre => completedResearch.includes(pre));
}

/**
 * Check if a building is unlocked (research + prestige requirements).
 */
export function isBuildingUnlocked(
  type: BuildingType,
  completedResearch: string[],
  prestigeState: { totalPrestiges: number },
): boolean {
  const def = BUILDING_DEFS[type];
  if (!def) return false;
  if (!def.unlockRequirement) return true;
  if (def.unlockRequirement.research && !completedResearch.includes(def.unlockRequirement.research)) return false;
  if (def.unlockRequirement.prestige && prestigeState.totalPrestiges < def.unlockRequirement.prestige) return false;
  return true;
}

/**
 * Get resource storage capacity.
 */
export function getCapacity(
  state: GameState,
  resource: ResourceType,
  _researchSet?: Set<string>,
  cache?: MultiplierCache,
): number {
  // Unlimited storage from Terraforming Engine mega project
  const hasUnlimitedStorage = state.megaProjects.some(p => p.completed && p.bonus.type === 'unlimitedStorage');
  if (hasUnlimitedStorage) return Infinity;

  // V-030 / PR-BP-3 §2.11: client-side parity with §2.1 server-side
  // capacity policy. A missing `resourceCapacity` row is a DB-integrity
  // issue — fail closed (RULES.md SEC-002) rather than silently
  // returning 50, which previously created divergent client/server
  // capacity previews. Caller paths:
  //   - upgradeStorage always seeds a row before reach here
  //   - bootstrap / migrations seed every known resource
  //   - any new resource type is a config drift that should throw fast
  const baseCapacity = state.resourceCapacity[resource];
  if (typeof baseCapacity !== "number" || !Number.isFinite(baseCapacity)) {
    throw new RangeError(
      `[getCapacity] missing or non-finite resourceCapacity for "${resource}". ` +
        `Seed a finite capacity row, or complete Terraforming Engine mega project ` +
        `to grant unlimited storage.`,
    );
  }
  // Always use modifier engine for storage capacity — build cache on demand if not provided
  const effectiveCache = cache ?? buildMultipliers(state);
  return Math.floor(baseCapacity * (1 + effectiveCache.storageCapacityBonus));
}
