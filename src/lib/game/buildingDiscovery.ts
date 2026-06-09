// ============================================
// FACTORY DOMINION: Dynamic Building Discovery
// ============================================
//
// Instead of hardcoding building type arrays in each panel, we derive
// them dynamically from BUILDING_DEFS. This ensures all buildings —
// including those added by Supabase configCache — are visible in the UI.
//
// Categories are determined by the building's `category` and `tier` fields.
// ============================================

import { BUILDING_DEFS } from './configCache';
import type { BuildingType } from './types';

/**
 * Get all extractor building types from BUILDING_DEFS.
 * Sorted by tier, then by name for consistent ordering.
 */
export function getExtractorTypes(): BuildingType[] {
  return Object.keys(BUILDING_DEFS)
    .filter(id => BUILDING_DEFS[id]?.category === 'extractor')
    .sort((a, b) => {
      const defA = BUILDING_DEFS[a];
      const defB = BUILDING_DEFS[b];
      // Sort by tier first, then by name
      if (defA.tier !== defB.tier) return defA.tier - defB.tier;
      return defA.name.localeCompare(defB.name);
    }) as BuildingType[];
}

/**
 * Categorize extractors into sub-tabs.
 * - Basic: Tier 0 extractors without research requirements (iron, copper, coal, oil, water, sand)
 * - Advanced: Tier 0-1 extractors with research requirements (bauxite, wolframite, rare earth, lithium)
 * - Specialized: Extractors for precious/rare resources (silver, gold, etc.)
 */
export function getBasicExtractors(): BuildingType[] {
  return getExtractorTypes().filter(id => {
    const def = BUILDING_DEFS[id];
    if (!def) return false;
    // Basic = tier 0 + no research requirement
    return def.tier === 0 && !def.unlockRequirement?.research;
  });
}

export function getAdvancedExtractors(): BuildingType[] {
  return getExtractorTypes().filter(id => {
    const def = BUILDING_DEFS[id];
    if (!def) return false;
    // Advanced = has research requirement OR tier > 0, but not precious metals
    const isPrecious = id === 'silverMine' || id === 'goldMine' ||
      def.outputs?.some(o => o.resource === 'silver' || o.resource === 'gold');
    if (isPrecious) return false;
    return (def.tier > 0 || !!def.unlockRequirement?.research);
  });
}

export function getSpecializedExtractors(): BuildingType[] {
  return getExtractorTypes().filter(id => {
    const def = BUILDING_DEFS[id];
    if (!def) return false;
    // Specialized = precious metals or rare resources
    const isPrecious = id === 'silverMine' || id === 'goldMine' ||
      def.outputs?.some(o => o.resource === 'silver' || o.resource === 'gold');
    return isPrecious;
  });
}

/**
 * Get all factory building types from BUILDING_DEFS, grouped by tier.
 */
export function getFactoryTypesByTier(): Record<number, BuildingType[]> {
  const tiers: Record<number, BuildingType[]> = { 1: [], 2: [], 3: [], 4: [] };
  Object.keys(BUILDING_DEFS)
    .filter(id => BUILDING_DEFS[id]?.category === 'factory')
    .forEach(id => {
      const def = BUILDING_DEFS[id];
      const tier = def.tier;
      if (tiers[tier]) {
        tiers[tier].push(id as BuildingType);
      } else if (tier > 4) {
        // Higher tiers go into tier 4
        tiers[4].push(id as BuildingType);
      }
    });
  // Sort each tier by name
  for (const tier of Object.keys(tiers)) {
    tiers[Number(tier)].sort((a, b) => BUILDING_DEFS[a].name.localeCompare(BUILDING_DEFS[b].name));
  }
  return tiers;
}

/**
 * Get all power building types from BUILDING_DEFS.
 */
export function getPowerPlantTypes(): BuildingType[] {
  return Object.keys(BUILDING_DEFS)
    .filter(id => BUILDING_DEFS[id]?.category === 'power')
    .sort((a, b) => {
      const defA = BUILDING_DEFS[a];
      const defB = BUILDING_DEFS[b];
      if (defA.tier !== defB.tier) return defA.tier - defB.tier;
      return defA.name.localeCompare(defB.name);
    }) as BuildingType[];
}

/**
 * Get all building types across all categories.
 */
export function getAllBuildingTypes(): BuildingType[] {
  return Object.keys(BUILDING_DEFS) as BuildingType[];
}

/**
 * Get building count by category.
 */
export function getBuildingCountsByCategory(): { extractors: number; factories: number; power: number; total: number } {
  let extractors = 0;
  let factories = 0;
  let power = 0;
  for (const id of Object.keys(BUILDING_DEFS)) {
    const cat = BUILDING_DEFS[id]?.category;
    if (cat === 'extractor') extractors++;
    else if (cat === 'factory') factories++;
    else if (cat === 'power') power++;
  }
  return { extractors, factories, power, total: extractors + factories + power };
}
