/**
 * Price Correlation Chains — Industry Standard
 *
 * Defines upstream → downstream relationships between resources.
 * When a resource's price changes, correlated downstream resources are
 * dragged along by `strength` (0-1, percentage pass-through).
 *
 * Pure data. No I/O. No side effects.
 *
 * Architecture-Standard: Pure data only. Used by:
 *   - marketTick.ts (chain correlation effects on price)
 *   - mvil.ts (chain reaction injection generation)
 */

import type { ResourceType } from '../types';

export interface PriceCorrelation {
  from: ResourceType;  // upstream resource
  to: ResourceType;    // downstream resource
  strength: number;    // 0-1, how much of the price change passes through
}

// When a resource price changes, correlated resources are dragged along
// input → output (1.0 = 100% pass-through)
export const PRICE_CORRELATIONS: PriceCorrelation[] = [
  // Ore → Ingot/Plate
  { from: 'iron', to: 'ironPlate', strength: 0.6 },
  { from: 'iron', to: 'steel', strength: 0.5 },
  { from: 'copper', to: 'copperWire', strength: 0.6 },
  { from: 'copper', to: 'copperIngot', strength: 0.65 },
  { from: 'bauxite', to: 'aluminium', strength: 0.6 },
  { from: 'wolframite', to: 'tungsten', strength: 0.7 },
  // Oil → Plastic/Carbon
  { from: 'oil', to: 'plastic', strength: 0.55 },
  { from: 'oil', to: 'carbon', strength: 0.5 },
  { from: 'oil', to: 'fossilFuel', strength: 0.7 },
  // Sand → Glass/Silicon
  { from: 'sand', to: 'glass', strength: 0.5 },
  { from: 'sand', to: 'silicon', strength: 0.55 },
  { from: 'silicon', to: 'solarCell', strength: 0.5 },
  { from: 'silicon', to: 'fiberOptics', strength: 0.5 },
  // Lithium → Battery
  { from: 'lithium', to: 'battery', strength: 0.6 },
  // Components → Advanced
  { from: 'circuit', to: 'aiChip', strength: 0.5 },
  { from: 'circuit', to: 'electronics', strength: 0.6 },
  { from: 'circuit', to: 'medicalTech', strength: 0.4 },
  { from: 'battery', to: 'electronics', strength: 0.3 },
  { from: 'ironPlate', to: 'gear', strength: 0.5 },
  { from: 'gear', to: 'engine', strength: 0.5 },
  { from: 'steel', to: 'engine', strength: 0.4 },
  { from: 'steel', to: 'advancedAlloy', strength: 0.5 },
  { from: 'advancedAlloy', to: 'weapons', strength: 0.4 },
  { from: 'advancedAlloy', to: 'titanium', strength: 0.4 },
  // High tech chain
  { from: 'aiChip', to: 'robotics', strength: 0.5 },
  { from: 'aiChip', to: 'neuralNetwork', strength: 0.6 },
  { from: 'aiChip', to: 'scanDrone', strength: 0.4 },
  { from: 'aiChip', to: 'artifactDetector', strength: 0.5 },
  { from: 'electronics', to: 'robotics', strength: 0.3 },
  // Endgame chain
  { from: 'quantumPart', to: 'singularityCore', strength: 0.5 },
  { from: 'quantumPart', to: 'darkMatterCell', strength: 0.4 },
  { from: 'darkMatterCell', to: 'warpDrive', strength: 0.5 },
  { from: 'singularityCore', to: 'chronoPart', strength: 0.6 },
  { from: 'plasmaCore', to: 'antimatter', strength: 0.5 },
  { from: 'antimatter', to: 'voidCrystal', strength: 0.4 },
  // Agriculture
  { from: 'coal', to: 'fertilizer', strength: 0.3 },
  { from: 'oil', to: 'insecticide', strength: 0.3 },
  // Rare earth → advanced
  { from: 'rareEarth', to: 'advancedAlloy', strength: 0.4 },
  { from: 'rareEarth', to: 'quantumPart', strength: 0.3 },
  // Water → basic
  { from: 'water', to: 'coolant', strength: 0.4 },
  { from: 'water', to: 'concrete', strength: 0.3 },
  // Clay/Limestone → Building
  { from: 'clay', to: 'bricks', strength: 0.6 },
  { from: 'limestone', to: 'concrete', strength: 0.5 },
  { from: 'limestone', to: 'fertilizer', strength: 0.3 },
];
