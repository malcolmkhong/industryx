/**
 * Market Simulator — Supply-Demand Model (Industry Standard)
 *
 * Philosophy:
 * - Player production creates supply → more you produce, lower the sell price
 * - Player consumption creates demand → more you buy, higher the buy price
 * - Resources are correlated → oil spike ripples through plastic, carbon, etc.
 * - Events shift markets → oil crisis spikes energy prices
 * - Price has memory → trends emerge, enabling strategic timing
 * - Elasticity per resource → luxuries are elastic, basics are inelastic
 *
 * NO gameSpeed multiplication — ticks already fire faster.
 */

import { GameState, MarketPrice, ResourceType } from './types';
import { RESOURCE_META, BUILDING_DEFS } from './data';

// ─── Sector Definitions ────────────────────────────────────────────────────
// Resources in the same sector move together

export type MarketSector =
  | 'raw_minerals'    // iron, copper, coal, sand, lithium, clay, limestone, gravel, bauxite, wolframite
  | 'raw_organic'     // oil, water, rareEarth
  | 'basic_materials' // ironPlate, copperWire, plastic, glass, carbon, bricks, concrete, steel, aluminium
  | 'components'      // gear, circuit, battery, coolant, fiberOptics, solarCell, copperIngot, silicon
  | 'advanced'        // engine, advancedAlloy, electronics, tungsten, titanium, weapons, medicalTech, jewellery
  | 'high_tech'       // aiChip, robotics, neuralNetwork, scanDrone, artifactDetector, quantumPart
  | 'endgame'         // singularityCore, darkMatterCell, warpDrive, antimatter, chronoPart, plasmaCore, megaStructure, voidCrystal, nanoMaterial
  | 'agriculture'     // fertilizer, insecticide, fossilFuel;

export const RESOURCE_SECTOR: Record<ResourceType, MarketSector> = {
  // Raw minerals
  iron: 'raw_minerals', copper: 'raw_minerals', coal: 'raw_minerals',
  sand: 'raw_minerals', lithium: 'raw_minerals', clay: 'raw_minerals',
  limestone: 'raw_minerals', gravel: 'raw_minerals', bauxite: 'raw_minerals',
  wolframite: 'raw_minerals',
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
  // Advanced
  engine: 'advanced', advancedAlloy: 'advanced', electronics: 'advanced',
  tungsten: 'advanced', titanium: 'advanced', weapons: 'advanced',
  medicalTech: 'advanced', jewellery: 'advanced',
  // High tech
  aiChip: 'high_tech', robotics: 'high_tech', neuralNetwork: 'high_tech',
  scanDrone: 'high_tech', artifactDetector: 'high_tech', quantumPart: 'high_tech',
  // Endgame
  singularityCore: 'endgame', darkMatterCell: 'endgame', warpDrive: 'endgame',
  antimatter: 'endgame', chronoPart: 'endgame', plasmaCore: 'endgame',
  megaStructure: 'endgame', voidCrystal: 'endgame', nanoMaterial: 'endgame',
  // Agriculture
  fertilizer: 'agriculture', insecticide: 'agriculture', fossilFuel: 'agriculture',
};

// ─── Elasticity ────────────────────────────────────────────────────────────
// How much price responds to supply/demand imbalance
// High = luxury (price swings a lot), Low = necessity (price stays stable)

export const RESOURCE_ELASTICITY: Record<ResourceType, number> = {
  // Raw minerals — inelastic (always needed)
  iron: 0.3, copper: 0.3, coal: 0.25, sand: 0.2, lithium: 0.4,
  clay: 0.15, limestone: 0.15, gravel: 0.1, bauxite: 0.35, wolframite: 0.5,
  // Raw organic — moderately elastic
  oil: 0.45, water: 0.1, rareEarth: 0.55,
  // Basic materials — slightly elastic
  ironPlate: 0.35, copperWire: 0.35, plastic: 0.4, glass: 0.3,
  carbon: 0.35, bricks: 0.2, concrete: 0.2, steel: 0.4, aluminium: 0.4,
  // Components — moderately elastic
  gear: 0.45, circuit: 0.5, battery: 0.45, coolant: 0.3,
  fiberOptics: 0.5, solarCell: 0.5, copperIngot: 0.35, silicon: 0.45,
  // Advanced — elastic (specialized markets)
  engine: 0.6, advancedAlloy: 0.6, electronics: 0.55,
  tungsten: 0.55, titanium: 0.55, weapons: 0.65,
  medicalTech: 0.6, jewellery: 0.8,  // Jewellery is very elastic (luxury)
  // High tech — very elastic
  aiChip: 0.7, robotics: 0.7, neuralNetwork: 0.7,
  scanDrone: 0.65, artifactDetector: 0.7, quantumPart: 0.8,
  // Endgame — extremely elastic (speculative)
  singularityCore: 0.9, darkMatterCell: 0.95, warpDrive: 0.95,
  antimatter: 0.85, chronoPart: 1.0, plasmaCore: 0.8,
  megaStructure: 0.75, voidCrystal: 0.95, nanoMaterial: 0.9,
  // Agriculture — inelastic
  fertilizer: 0.25, insecticide: 0.3, fossilFuel: 0.4,
};

// ─── Correlation Chains ────────────────────────────────────────────────────
// When a resource price changes, correlated resources are dragged along
// input → output (1.0 = 100% pass-through)

export interface PriceCorrelation {
  from: ResourceType;  // upstream resource
  to: ResourceType;    // downstream resource
  strength: number;    // 0-1, how much of the price change passes through
}

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

// ─── Market Cycle Phases ───────────────────────────────────────────────────
// Simulates macro-economic cycles (boom → peak → recession → recovery)

export type CyclePhase = 'expansion' | 'peak' | 'recession' | 'recovery';

export interface MarketCycle {
  phase: CyclePhase;
  phaseProgress: number;   // 0-1, how far into current phase
  globalMultiplier: number; // affects all prices
}

// Phase durations in ticks (approximate)
const PHASE_DURATIONS: Record<CyclePhase, [number, number]> = {
  expansion: [300, 600],  // 5-10 minutes at 1x
  peak:      [100, 200],   // 1.5-3 minutes
  recession: [200, 400],   // 3-7 minutes
  recovery:  [150, 300],   // 2.5-5 minutes
};

const PHASE_MULTIPLIERS: Record<CyclePhase, number> = {
  expansion: 1.15,  // prices tend up 15%
  peak:      1.30,   // prices peak at +30%
  recession: 0.75,   // prices dip to -25%
  recovery:  0.95,   // prices recovering, near base
};

// ─── Simulation State ──────────────────────────────────────────────────────

export interface MarketSimulationState {
  cycle: MarketCycle;
  sectorMomentum: Record<MarketSector, number>;   // -1 to 1, sector trend strength
  lastCorrelationImpact: Record<ResourceType, number>; // accumulated correlation pressure
  recentPlayerSells: Record<ResourceType, number>;     // total units sold by player recently (rolling window)
  recentPlayerBuys: Record<ResourceType, number>;      // total units bought by player recently
  ticksInPhase: number;
}

export function createInitialSimState(): MarketSimulationState {
  const sectors: MarketSector[] = ['raw_minerals', 'raw_organic', 'basic_materials', 'components', 'advanced', 'high_tech', 'endgame', 'agriculture'];
  const momentum: Record<string, number> = {};
  sectors.forEach(s => { momentum[s] = 0; });

  return {
    cycle: { phase: 'expansion', phaseProgress: 0, globalMultiplier: 1.0 },
    sectorMomentum: momentum as Record<MarketSector, number>,
    lastCorrelationImpact: {},
    recentPlayerSells: {},
    recentPlayerBuys: {},
    ticksInPhase: 0,
  };
}

// ─── Core Simulation ───────────────────────────────────────────────────────

export interface MarketSimulationInput {
  market: MarketPrice[];
  production: Partial<Record<ResourceType, number>>;  // player production rate per tick
  consumption: Partial<Record<ResourceType, number>>; // player consumption rate per tick
  activeEvents: Array<{ effects: Array<{ type: string; target?: string; value: number }> }>;
  simState: MarketSimulationState;
}

export interface MarketSimulationOutput {
  market: MarketPrice[];
  simState: MarketSimulationState;
  sectorTrends: Record<MarketSector, 'up' | 'down' | 'stable'>;
}

/**
 * Run one tick of market simulation.
 * Called from the game tick, throttled to every 5 ticks for performance.
 */
export function simulateMarketTick(input: MarketSimulationInput): MarketSimulationOutput {
  const { market, production, consumption, activeEvents, simState } = input;

  // ── 1. Advance Market Cycle ──
  const newSimState = { ...simState };
  newSimState.ticksInPhase += 5; // since we run every 5 ticks
  const [minDur, maxDur] = PHASE_DURATIONS[simState.cycle.phase];
  const phaseDuration = (minDur + maxDur) / 2; // simplified: use midpoint
  const phaseProgress = Math.min(1, newSimState.ticksInPhase / phaseDuration);
  newSimState.cycle = { ...simState.cycle, phaseProgress };

  // Phase transition
  if (phaseProgress >= 1) {
    const nextPhase: Record<CyclePhase, CyclePhase> = {
      expansion: 'peak',
      peak: 'recession',
      recession: 'recovery',
      recovery: 'expansion',
    };
    newSimState.cycle = {
      phase: nextPhase[simState.cycle.phase],
      phaseProgress: 0,
      globalMultiplier: PHASE_MULTIPLIERS[nextPhase[simState.cycle.phase]],
    };
    newSimState.ticksInPhase = 0;
  } else {
    // Interpolate multiplier toward target
    const target = PHASE_MULTIPLIERS[simState.cycle.phase];
    const current = simState.cycle.globalMultiplier;
    newSimState.cycle.globalMultiplier = current + (target - current) * 0.02;
  }

  // ── 2. Compute Player Supply/Demand Pressure ──
  const playerPressure: Record<string, number> = {};
  for (const m of market) {
    const prod = production[m.resource] ?? 0;
    const cons = consumption[m.resource] ?? 0;
    // Net supply: positive = player is producing more (supply pressure, price ↓)
    //             negative = player is consuming more (demand pressure, price ↑)
    playerPressure[m.resource] = (prod - cons) * 0.01; // scale factor
  }

  // ── 3. Decay recent player trades (rolling window) ──
  const decayedSells: Record<string, number> = {};
  const decayedBuys: Record<string, number> = {};
  for (const m of market) {
    decayedSells[m.resource] = (newSimState.recentPlayerSells[m.resource] ?? 0) * 0.95;
    decayedBuys[m.resource] = (newSimState.recentPlayerBuys[m.resource] ?? 0) * 0.95;
  }
  newSimState.recentPlayerSells = decayedSells as Record<ResourceType, number>;
  newSimState.recentPlayerBuys = decayedBuys as Record<ResourceType, number>;

  // ── 4. Compute correlation impacts from previous tick ──
  const correlationImpact: Record<string, number> = {};
  for (const m of market) {
    correlationImpact[m.resource] = 0;
  }
  for (const corr of PRICE_CORRELATIONS) {
    const fromMarket = market.find(m => m.resource === corr.from);
    if (!fromMarket) continue;
    // How much did the source price change recently?
    const hist = fromMarket.priceHistory;
    if (hist.length < 2) continue;
    const prevPrice = hist[hist.length - 1];
    const priceChangeRatio = fromMarket.currentPrice / prevPrice - 1; // fractional change
    correlationImpact[corr.to] = (correlationImpact[corr.to] ?? 0) + priceChangeRatio * corr.strength * 0.3;
  }
  newSimState.lastCorrelationImpact = correlationImpact as Record<ResourceType, number>;

  // ── 5. Update sector momentum ──
  const sectorResources: Partial<Record<MarketSector, ResourceType[]>> = {};
  for (const m of market) {
    const sector = RESOURCE_SECTOR[m.resource];
    if (!sectorResources[sector]) sectorResources[sector] = [];
    sectorResources[sector]!.push(m.resource);
  }

  const newMomentum = { ...newSimState.sectorMomentum };
  for (const sector of Object.keys(sectorResources) as MarketSector[]) {
    const resources = sectorResources[sector] ?? [];
    let sectorPriceChange = 0;
    let count = 0;
    for (const res of resources) {
      const m = market.find(x => x.resource === res);
      if (!m || m.priceHistory.length < 2) continue;
      const prev = m.priceHistory[m.priceHistory.length - 1];
      sectorPriceChange += (m.currentPrice / prev - 1);
      count++;
    }
    if (count > 0) {
      const avgChange = sectorPriceChange / count;
      // Momentum: blend recent change with existing momentum
      newMomentum[sector] = (newMomentum[sector] ?? 0) * 0.8 + avgChange * 0.2;
    }
  }
  newSimState.sectorMomentum = newMomentum;

  // ── 6. Compute new prices ──
  const newMarket = market.map(m => {
    const elasticity = RESOURCE_ELASTICITY[m.resource];
    const sector = RESOURCE_SECTOR[m.resource];
    const sectorMom = newMomentum[sector] ?? 0;
    const netPlayerPressure = playerPressure[m.resource] ?? 0;
    const corrImpact = correlationImpact[m.resource] ?? 0;
    const recentSells = newSimState.recentPlayerSells[m.resource] ?? 0;
    const recentBuys = newSimState.recentPlayerBuys[m.resource] ?? 0;

    // A) Base random noise (reduced from original — market is now more structured)
    const noise = (Math.random() - 0.5) * 2 * m.volatility * 0.03;

    // B) Market cycle influence
    const cycleEffect = (newSimState.cycle.globalMultiplier - 1.0) * 0.02;

    // C) Sector momentum (trend-following)
    const momentumEffect = sectorMom * 0.15;

    // D) Player supply/demand pressure
    // Producing a lot → price goes down; Consuming a lot → price goes up
    const productionPressure = -netPlayerPressure * elasticity * 0.05;

    // E) Recent player trades impact
    // Selling floods market → price drops; Buying drains market → price rises
    const tradeImpact = (-recentSells * 0.001 + recentBuys * 0.001) * elasticity;

    // F) Correlation chain impact
    const corrEffect = corrImpact * elasticity;

    // G) Event effects
    let eventEffect = 0;
    let eventOverride = 0;
    for (const event of activeEvents) {
      for (const effect of event.effects) {
        if (effect.type === 'marketPriceMultiplier') {
          if (!effect.target || effect.target === m.resource) {
            // Events now set a target price instead of randomizing
            eventOverride = m.basePrice * effect.value;
          }
        }
      }
    }

    // Total fractional price change this tick
    const totalChange = noise + cycleEffect + momentumEffect + productionPressure + tradeImpact + corrEffect;

    let newPrice = m.currentPrice * (1 + totalChange);

    // Apply event override (blend toward event price, not instant jump)
    if (eventOverride > 0) {
      newPrice = newPrice * 0.7 + eventOverride * 0.3;
    }

    // H) Mean reversion (gentle — 3% pull toward base price)
    // Prevents prices from wandering too far permanently
    newPrice = newPrice * 0.97 + m.basePrice * 0.03;

    // I) Hard bounds: 20% to 500% of base price
    newPrice = Math.max(m.basePrice * 0.2, Math.min(m.basePrice * 5, newPrice));

    // ── Update demand/supply based on actual player activity ──
    const prod = production[m.resource] ?? 0;
    const cons = consumption[m.resource] ?? 0;
    const newDemand = Math.max(0.3, Math.min(2.0,
      1.0 + (cons * 0.02) + (recentBuys * 0.001) + (Math.random() - 0.5) * 0.02
    ));
    const newSupply = Math.max(0.3, Math.min(2.0,
      1.0 + (prod * 0.02) + (recentSells * 0.001) + (Math.random() - 0.5) * 0.02
    ));

    // ── Determine trend ──
    const newHistory = [...m.priceHistory, m.currentPrice].slice(-50);
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (newHistory.length >= 5) {
      const recent = newHistory.slice(-5);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      if (newPrice > avg * 1.05) trend = 'up';
      else if (newPrice < avg * 0.95) trend = 'down';
    }

    return {
      ...m,
      currentPrice: Math.round(newPrice * 100) / 100,
      priceHistory: newHistory,
      demand: Math.round(newDemand * 100) / 100,
      supply: Math.round(newSupply * 100) / 100,
      trend,
    };
  });

  // ── 7. Compute sector trends for UI ──
  const sectorTrends: Record<string, 'up' | 'down' | 'stable'> = {};
  for (const sector of Object.keys(newMomentum) as MarketSector[]) {
    const mom = newMomentum[sector];
    if (mom > 0.005) sectorTrends[sector] = 'up';
    else if (mom < -0.005) sectorTrends[sector] = 'down';
    else sectorTrends[sector] = 'stable';
  }

  return {
    market: newMarket,
    simState: newSimState,
    sectorTrends: sectorTrends as Record<MarketSector, 'up' | 'down' | 'stable'>,
  };
}

// ─── Helper: Record a player trade ─────────────────────────────────────────

export function recordPlayerSell(simState: MarketSimulationState, resource: ResourceType, amount: number): MarketSimulationState {
  return {
    ...simState,
    recentPlayerSells: {
      ...simState.recentPlayerSells,
      [resource]: (simState.recentPlayerSells[resource] ?? 0) + amount,
    },
  };
}

export function recordPlayerBuy(simState: MarketSimulationState, resource: ResourceType, amount: number): MarketSimulationState {
  return {
    ...simState,
    recentPlayerBuys: {
      ...simState.recentPlayerBuys,
      [resource]: (simState.recentPlayerBuys[resource] ?? 0) + amount,
    },
  };
}

// ─── Helper: Get sector display info ───────────────────────────────────────

export function getSectorInfo(sector: MarketSector): { name: string; color: string; icon: string } {
  switch (sector) {
    case 'raw_minerals':    return { name: 'Raw Minerals', color: 'text-amber-400', icon: 'gi:ore' };
    case 'raw_organic':     return { name: 'Organic & Rare', color: 'text-emerald-400', icon: 'gi:oil-rig' };
    case 'basic_materials': return { name: 'Basic Materials', color: 'text-sky-400', icon: 'gi:metal-bar' };
    case 'components':      return { name: 'Components', color: 'text-violet-400', icon: 'gi:circuitry' };
    case 'advanced':        return { name: 'Advanced Goods', color: 'text-rose-400', icon: 'gi:gear-hammer' };
    case 'high_tech':       return { name: 'High Tech', color: 'text-fuchsia-400', icon: 'gi:processor' };
    case 'endgame':         return { name: 'Endgame', color: 'text-purple-400', icon: 'gi:atomic-slashes' };
    case 'agriculture':     return { name: 'Agriculture', color: 'text-lime-400', icon: 'gi:fertilizer-bag' };
  }
}
