/**
 * Sector Definitions — Industry Standard
 *
 * Resources are grouped into sectors. Resources in the same sector tend to
 * move together. Sectors drive news categories, color theming, and
 * trend aggregation.
 *
 * Pure data + display helpers. No I/O. No side effects.
 *
 * Architecture-Standard: Pure functions only. Used by:
 *   - marketTick.ts (sector momentum, price correlation)
 *   - mvil.ts (macro injection targeting)
 *   - narratives.ts (sector info in narrative text)
 *   - MarketPanel.tsx (display)
 *   - eventArchetypes.ts (sector key for events)
 *   - newsBuilder.ts (type re-export)
 */

import type { ResourceType } from '../types';

// ─── Market Sector Type ────────────────────────────────────────────────────
// Resources in the same sector move together

export type MarketSector =
  | 'raw_minerals'    // iron, copper, coal, sand, lithium, clay, limestone, gravel, bauxite, wolframite
  | 'raw_organic'     // oil, water, rareEarth
  | 'basic_materials' // ironPlate, copperWire, plastic, glass, carbon, bricks, concrete, steel, aluminium
  | 'components'      // gear, circuit, battery, coolant, fiberOptics, solarCell, copperIngot, silicon
  | 'advanced'        // engine, advancedAlloy, electronics, tungsten, titanium, weapons, medicalTech, jewellery
  | 'high_tech'       // aiChip, robotics, neuralNetwork, scanDrone, artifactDetector, quantumPart
  | 'endgame'         // singularityCore, darkMatterCell, warpDrive, antimatter, chronoPart, plasmaCore, megaStructure, voidCrystal, nanoMaterial
  | 'agriculture';    // fertilizer, insecticide, fossilFuel

// ─── Resource → Sector Map ─────────────────────────────────────────────────

export const RESOURCE_SECTOR: Record<ResourceType, MarketSector> = {
  // Raw minerals
  iron: 'raw_minerals', copper: 'raw_minerals', coal: 'raw_minerals',
  sand: 'raw_minerals', lithium: 'raw_minerals', clay: 'raw_minerals',
  limestone: 'raw_minerals', gravel: 'raw_minerals', bauxite: 'raw_minerals',
  wolframite: 'raw_minerals', silver: 'raw_minerals', gold: 'raw_minerals',
  // Raw organic
  oil: 'raw_organic', water: 'raw_organic', rareEarth: 'raw_organic',
  // Basic materials
  ironPlate: 'basic_materials', copperWire: 'basic_materials',
  plastic: 'basic_materials', glass: 'basic_materials',
  carbon: 'basic_materials', bricks: 'basic_materials',
  concrete: 'basic_materials', steel: 'basic_materials',
  aluminium: 'basic_materials',
  // Components
  gear: 'components', circuit: 'components', battery: 'components',
  coolant: 'components', fiberOptics: 'components', solarCell: 'components',
  copperIngot: 'components', silicon: 'components',
  powerCell: 'components', refinedSilver: 'components', refinedGold: 'components',
  reinforcedConcrete: 'basic_materials',
  // Advanced
  engine: 'advanced', advancedAlloy: 'advanced', electronics: 'advanced',
  tungsten: 'advanced', titanium: 'advanced', weapons: 'advanced',
  medicalTech: 'advanced', jewellery: 'advanced',
  carbonComposite: 'advanced', structuralFrame: 'advanced',
  fusionCell: 'advanced', solarPanel: 'components', creditChip: 'advanced',
  // High tech
  aiChip: 'high_tech', robotics: 'high_tech', neuralNetwork: 'high_tech',
  scanDrone: 'high_tech', artifactDetector: 'high_tech', quantumPart: 'high_tech',
  // Endgame
  singularityCore: 'endgame', darkMatterCell: 'endgame', warpDrive: 'endgame',
  antimatter: 'endgame', chronoPart: 'endgame', plasmaCore: 'endgame',
  megaStructure: 'endgame', voidCrystal: 'endgame', nanoMaterial: 'endgame',
  arcologyModule: 'endgame', habitatModule: 'endgame', stellarEnergy: 'endgame',
  luxuryGoods: 'endgame', tradeContract: 'endgame', teleporterNode: 'endgame',
  // Tier 5 — Transcendent
  researchMatrix: 'endgame', worldCore: 'endgame', shieldMatrix: 'endgame',
  stellarForge: 'endgame', voidEnergy: 'endgame', marketDominance: 'endgame',
  corpCapital: 'endgame', dimensionalGate: 'endgame', armadaFleet: 'endgame',
  // Agriculture
  fertilizer: 'agriculture', insecticide: 'agriculture', fossilFuel: 'agriculture',
};

// ─── Elasticity per Resource ───────────────────────────────────────────────
// How much price responds to supply/demand imbalance
// High = luxury (price swings a lot), Low = necessity (price stays stable)

export const RESOURCE_ELASTICITY: Record<ResourceType, number> = {
  // Raw minerals — inelastic (always needed)
  iron: 0.3, copper: 0.3, coal: 0.25, sand: 0.2, lithium: 0.4,
  clay: 0.15, limestone: 0.15, gravel: 0.1, bauxite: 0.35, wolframite: 0.5,
  silver: 0.5, gold: 0.6,
  // Raw organic — moderately elastic
  oil: 0.45, water: 0.1, rareEarth: 0.55,
  // Basic materials — slightly elastic
  ironPlate: 0.35, copperWire: 0.35, plastic: 0.4, glass: 0.3,
  carbon: 0.35, bricks: 0.2, concrete: 0.2, steel: 0.4, aluminium: 0.4,
  reinforcedConcrete: 0.25,
  // Components — moderately elastic
  gear: 0.45, circuit: 0.5, battery: 0.45, coolant: 0.3,
  fiberOptics: 0.5, solarCell: 0.5, copperIngot: 0.35, silicon: 0.45,
  powerCell: 0.5, refinedSilver: 0.55, refinedGold: 0.6,
  // Advanced — elastic (specialized markets)
  engine: 0.6, advancedAlloy: 0.6, electronics: 0.55,
  tungsten: 0.55, titanium: 0.55, weapons: 0.65,
  medicalTech: 0.6, jewellery: 0.8,  // Jewellery is very elastic (luxury)
  carbonComposite: 0.6, structuralFrame: 0.55,
  fusionCell: 0.7, solarPanel: 0.5, creditChip: 0.75,
  // High tech — very elastic
  aiChip: 0.7, robotics: 0.7, neuralNetwork: 0.7,
  scanDrone: 0.65, artifactDetector: 0.7, quantumPart: 0.8,
  // Endgame — extremely elastic (speculative)
  singularityCore: 0.9, darkMatterCell: 0.95, warpDrive: 0.95,
  antimatter: 0.85, chronoPart: 1.0, plasmaCore: 0.8,
  megaStructure: 0.75, voidCrystal: 0.95, nanoMaterial: 0.9,
  arcologyModule: 0.85, habitatModule: 0.8, stellarEnergy: 0.9,
  luxuryGoods: 0.95, tradeContract: 0.85, teleporterNode: 0.9,
  // Tier 5 — Transcendent
  researchMatrix: 1.0, worldCore: 0.95, shieldMatrix: 0.9,
  stellarForge: 0.95, voidEnergy: 1.0, marketDominance: 0.95,
  corpCapital: 1.0, dimensionalGate: 1.0, armadaFleet: 1.0,
  // Agriculture — inelastic
  fertilizer: 0.25, insecticide: 0.3, fossilFuel: 0.4,
};

// ─── Sector Display Info ───────────────────────────────────────────────────
// Used by UI components (MarketPanel). Color matches Tailwind theme tokens.

export function getSectorInfo(sector: MarketSector): { name: string; color: string; icon: string } {
  switch (sector) {
    case 'raw_minerals':    return { name: 'Raw Minerals', color: 'text-warning', icon: 'gi:ore' };
    case 'raw_organic':     return { name: 'Organic & Rare', color: 'text-success', icon: 'gi:oil-rig' };
    case 'basic_materials': return { name: 'Basic Materials', color: 'text-brand/80', icon: 'gi:metal-bar' };
    case 'components':      return { name: 'Components', color: 'text-research', icon: 'gi:circuitry' };
    case 'advanced':        return { name: 'Advanced Goods', color: 'text-danger', icon: 'gi:gear-hammer' };
    case 'high_tech':       return { name: 'High Tech', color: 'text-premium', icon: 'gi:processor' };
    case 'endgame':         return { name: 'Endgame', color: 'text-research', icon: 'gi:atomic-slashes' };
    case 'agriculture':     return { name: 'Agriculture', color: 'text-success', icon: 'gi:fertilizer-bag' };
  }
}
