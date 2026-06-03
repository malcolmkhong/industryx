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
 * Overlay Layers (ADD-ON ONLY — base system untouched):
 * - MVIL: Market Volatility Injection Layer — short-term dynamism
 * - News: Market News System — human-readable explanations
 * - Narrative: Player-driven Market Narrative — player impact storytelling
 *
 * NO gameSpeed multiplication — ticks already fire faster.
 */

import { GameState, MarketPrice, ResourceType } from './types';
import { RESOURCE_META, BUILDING_DEFS } from './data';
import {
  buildEventPacketFromPriceMove,
  buildEventPacketFromVolatility,
  buildEventPacketFromSector,
  buildEventPacketFromTrade,
  generateFallbackText,
  generateNewsId,
  EventPacket,
  NEWS_CONFIG,
} from './newsBuilder';

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
  | 'agriculture';    // fertilizer, insecticide, fossilFuel

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

// ═══════════════════════════════════════════════════════════════════════════
// OVERLAY LAYER 1: MVIL — Market Volatility Injection Layer
// ═══════════════════════════════════════════════════════════════════════════

export interface VolatilityInjection {
  intensity: number;      // 0-1
  direction: number;      // -1 to +1
  decay: number;          // per simulation step decay rate
  duration: number;       // simulation steps remaining
  source: 'micro' | 'macro' | 'chain';
  label?: string;         // short description for news
}

// MVIL probability constants
const MICRO_EVENT_CHANCE = 0.03;          // 3% per resource per step
const MACRO_EVENT_CHANCE = 0.015;         // 1.5% per step globally
const MAX_INJECTION_EFFECT = 0.05;        // ±5% max per tick

// ── News Throttling & Simulation Constants ──────────────────────────────────
// All tunable game-balance thresholds come from NEWS_CONFIG in newsBuilder.ts.
// Only non-game-balance MVIL internals remain hardcoded here.

const CHAIN_REACTION_THRESHOLD = NEWS_CONFIG.simulation.chainReactionThreshold;
const MAX_NEWS_ITEMS = NEWS_CONFIG.simulation.maxNewsItems;
const MAX_NARRATIVE_ITEMS = NEWS_CONFIG.simulation.maxNarrativeItems;
const RESOURCE_NEWS_COOLDOWN_TICKS = NEWS_CONFIG.simulation.resourceCooldownTicks;
const SECTOR_NEWS_COOLDOWN_TICKS = NEWS_CONFIG.simulation.sectorCooldownTicks;
const CATEGORY_NEWS_COOLDOWN_TICKS = NEWS_CONFIG.simulation.categoryCooldownTicks;
const MAX_NEWS_PER_TICK = NEWS_CONFIG.simulation.maxNewsPerTick;
const MAX_NARRATIVES_PER_TICK = NEWS_CONFIG.simulation.maxNarrativesPerTick;
const PRICE_MOVE_THRESHOLD_HIGH = NEWS_CONFIG.simulation.priceMoveThresholdHigh;
const VOLATILITY_NEWS_MIN_INTENSITY = NEWS_CONFIG.volatility.minIntensity;
const GAME_DAY_TICKS = NEWS_CONFIG.simulation.gameDayTicks;

function generateMicroInjection(resource: ResourceType): VolatilityInjection {
  const direction = Math.random() > 0.5 ? 1 : -1;
  const intensity = 0.05 + Math.random() * 0.15; // 0.05–0.20
  const duration = 1 + Math.floor(Math.random() * 3); // 1–3 steps
  const labels = direction > 0
    ? ['Supply disruption', 'Demand spike', 'Logistics delay', 'Quality premium']
    : ['Oversupply detected', 'Demand softening', 'Import surge', 'Storage overflow'];
  return {
    intensity,
    direction,
    decay: 0.15 + Math.random() * 0.1,
    duration,
    source: 'micro',
    label: labels[Math.floor(Math.random() * labels.length)],
  };
}

function generateMacroInjection(sector: MarketSector): Array<{ resource: ResourceType; injection: VolatilityInjection }> {
  const direction = Math.random() > 0.4 ? 1 : -1; // slight positive bias
  const intensity = 0.3 + Math.random() * 0.4; // 0.3–0.7
  const duration = 4 + Math.floor(Math.random() * 8); // 4–11 steps
  const sectorResources = Object.entries(RESOURCE_SECTOR)
    .filter(([, s]) => s === sector)
    .map(([r]) => r as ResourceType);
  const labels = direction > 0
    ? [`${getSectorInfo(sector).name} boom`, 'Trade agreement signed', 'Subsidy program launched', 'Infrastructure investment']
    : [`${getSectorInfo(sector).name} downturn`, 'Trade restrictions imposed', 'Regulatory crackdown', 'Global demand slump'];
  const label = labels[Math.floor(Math.random() * labels.length)];
  return sectorResources.map(resource => ({
    resource,
    injection: {
      intensity: intensity * (0.7 + Math.random() * 0.3), // per-resource variance
      direction,
      decay: 0.08 + Math.random() * 0.05,
      duration,
      source: 'macro',
      label,
    },
  }));
}

function generateChainInjections(
  triggerResource: ResourceType,
  priceChangeRatio: number,
): Array<{ resource: ResourceType; injection: VolatilityInjection }> {
  const direction = priceChangeRatio > 0 ? 1 : -1;
  const results: Array<{ resource: ResourceType; injection: VolatilityInjection }> = [];

  // Find downstream correlations
  for (const corr of PRICE_CORRELATIONS) {
    if (corr.from !== triggerResource) continue;
    const chainIntensity = Math.min(0.5, Math.abs(priceChangeRatio) * corr.strength * 0.6);
    if (chainIntensity < 0.02) continue;
    results.push({
      resource: corr.to,
      injection: {
        intensity: chainIntensity,
        direction,
        decay: 0.12,
        duration: 2 + Math.floor(Math.random() * 4), // 2–5 steps
        source: 'chain',
        label: `Cascade from ${RESOURCE_META[triggerResource]?.name ?? triggerResource}`,
      },
    });
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERLAY LAYER 2: Market News System (Explanation Layer)
// ═══════════════════════════════════════════════════════════════════════════

export interface MarketNews {
  id: string;
  title: string;
  description: string;
  affectedResources: ResourceType[];
  impactSummary: string;
  severity: 'low' | 'medium' | 'high';
  gameTick: number;
  category: 'price_move' | 'volatility' | 'correlation' | 'sector' | 'trade';
  // ── Hybrid News System fields ──
  textSource?: 'llm' | 'fallback'; // tracks which generator produced the text
  eventPacket?: import('./newsBuilder').EventPacket; // structured data for LLM re-generation
}

// NOTE: The old news template generators (generatePriceMoveNews, generateVolatilityNews,
// generateSectorNews, generateTradeNews) have been REMOVED. They were superseded by the
// EventPacket pipeline in newsBuilder.ts, which provides:
//   1. Structured EventPackets (buildEventPacketFromPriceMove, etc.)
//   2. Enhanced fallback templates (generateFallbackText)
//   3. LLM enhancement via the batch system (newsLLM.ts)
//
// The newsFromPacket() helper below bridges EventPackets → MarketNews objects.
// All news generation now flows through this single pipeline.

// ═══════════════════════════════════════════════════════════════════════════
// OVERLAY LAYER 3: Player-driven Market Narrative Layer
// ═══════════════════════════════════════════════════════════════════════════

export interface MarketNarrative {
  id: string;
  title: string;
  description: string;
  playerAction: string;
  marketEffect: string;
  severity: 'low' | 'medium' | 'high';
  gameTick: number;
}

function generateNarrativeId(): string {
  return 'nrr-' + Math.random().toString(36).substring(2, 8);
}

function generateProductionNarrative(
  resource: ResourceType,
  productionRate: number,
  gameTick: number,
): MarketNarrative | null {
  if (productionRate < 2) return null; // threshold

  const name = RESOURCE_META[resource]?.name ?? resource;
  const sector = RESOURCE_SECTOR[resource];
  const sectorInfo = getSectorInfo(sector);
  const intensity = productionRate > 20 ? 'massive' : productionRate > 8 ? 'significant' : 'moderate';

  return {
    id: generateNarrativeId(),
    title: 'Industrial Expansion Detected',
    description: `Your ${intensity} ${name} production operation is creating notable supply pressure in the ${sectorInfo.name} sector. Market prices are adjusting to your industrial output.`,
    playerAction: `Producing ${productionRate.toFixed(1)} ${name}/s`,
    marketEffect: `Increasing supply pressure → downward price pressure`,
    severity: productionRate > 20 ? 'high' : productionRate > 8 ? 'medium' : 'low',
    gameTick,
  };
}

function generateConsumptionNarrative(
  resource: ResourceType,
  consumptionRate: number,
  gameTick: number,
): MarketNarrative | null {
  if (consumptionRate < 2) return null; // threshold

  const name = RESOURCE_META[resource]?.name ?? resource;
  const intensity = consumptionRate > 20 ? 'massive' : consumptionRate > 8 ? 'significant' : 'moderate';

  return {
    id: generateNarrativeId(),
    title: 'Demand Surge Observed',
    description: `Your ${intensity} ${name} consumption is creating notable demand in the market. Supply chains are straining to keep up with your factory requirements.`,
    playerAction: `Consuming ${consumptionRate.toFixed(1)} ${name}/s`,
    marketEffect: `Increasing demand pressure → upward price pressure`,
    severity: consumptionRate > 20 ? 'high' : consumptionRate > 8 ? 'medium' : 'low',
    gameTick,
  };
}

function generateTradeNarrative(
  resource: ResourceType,
  recentSells: number,
  recentBuys: number,
  gameTick: number,
): MarketNarrative | null {
  const totalTrades = recentSells + recentBuys;
  if (totalTrades < 30) return null;

  const name = RESOURCE_META[resource]?.name ?? resource;
  const dominant = recentBuys > recentSells ? 'buying' : 'selling';

  return {
    id: generateNarrativeId(),
    title: 'Speculative Trading Activity Rising',
    description: `Unusual ${dominant} volume in ${name} market detected from your trading activity. Market participants are adjusting their positions in response.`,
    playerAction: `${dominant === 'buying' ? 'Bought' : 'Sold'} ${totalTrades.toFixed(0)} units of ${name}`,
    marketEffect: `Trade-driven ${dominant === 'buying' ? 'demand' : 'supply'} shock → volatility spike`,
    severity: totalTrades > 100 ? 'high' : 'medium',
    gameTick,
  };
}

function generateHoardingNarrative(
  resource: ResourceType,
  held: number,
  capacity: number,
  gameTick: number,
): MarketNarrative | null {
  const fillRatio = capacity > 0 ? held / capacity : 0;
  if (fillRatio < 0.9 || held < 20) return null;

  const name = RESOURCE_META[resource]?.name ?? resource;

  return {
    id: generateNarrativeId(),
    title: 'Resource Stockpiling Detected',
    description: `Your ${name} reserves are at ${(fillRatio * 100).toFixed(0)}% capacity. Market observers note your strategic accumulation of ${name}.`,
    playerAction: `Holding ${held.toFixed(0)}/${capacity} ${name}`,
    marketEffect: `Reduced market supply from hoarding → upward price pressure`,
    severity: fillRatio > 0.95 ? 'high' : 'medium',
    gameTick,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface MarketSimulationState {
  cycle: MarketCycle;
  sectorMomentum: Record<MarketSector, number>;   // -1 to 1, sector trend strength
  lastCorrelationImpact: Record<ResourceType, number>; // accumulated correlation pressure
  recentPlayerSells: Record<ResourceType, number>;     // total units sold by player recently (rolling window)
  recentPlayerBuys: Record<ResourceType, number>;      // total units bought by player recently
  ticksInPhase: number;
  // MVIL state
  volatilityInjections: Partial<Record<ResourceType, VolatilityInjection>>;
  // ── News Cooldown State ──
  lastNewsTick: Partial<Record<ResourceType, number>>;     // last tick each resource appeared in news
  lastSectorNewsTick: Partial<Record<MarketSector, number>>; // last tick each sector appeared in news
  lastCategoryNewsTick: Partial<Record<string, number>>;   // last tick each category emitted news
  // ── Trade Freshness Tracking ──
  lastTradeTick: Partial<Record<ResourceType, number>>;    // last tick when a sell/buy occurred (prevents stale news)
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
    volatilityInjections: {},
    lastNewsTick: {},
    lastSectorNewsTick: {},
    lastCategoryNewsTick: {},
    lastTradeTick: {},
  };
}

// ─── Core Simulation ───────────────────────────────────────────────────────

export interface MarketSimulationInput {
  market: MarketPrice[];
  production: Partial<Record<ResourceType, number>>;  // player production rate per tick
  consumption: Partial<Record<ResourceType, number>>; // player consumption rate per tick
  activeEvents: Array<{ effects: Array<{ type: string; target?: string; value: number }> }>;
  simState: MarketSimulationState;
  gameTick: number;
  resources: Partial<Record<ResourceType, number>>;
  resourceCapacity: Partial<Record<ResourceType, number>>;
}

export interface MarketSimulationOutput {
  market: MarketPrice[];
  simState: MarketSimulationState;
  sectorTrends: Record<MarketSector, 'up' | 'down' | 'stable'>;
  news: MarketNews[];
  narratives: MarketNarrative[];
}

/**
 * Run one tick of market simulation.
 * Called from the game tick, throttled to every 5 ticks for performance.
 */
export function simulateMarketTick(input: MarketSimulationInput): MarketSimulationOutput {
  const { market, production, consumption, activeEvents, simState, gameTick, resources, resourceCapacity } = input;

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
  // Decay rate 0.80 per sim step (every 5 ticks) — fast enough that a single
  // large sell decays below the trade-news threshold before the cooldown expires.
  // Old rate 0.95 was too slow: 100 units took 31 steps (155 ticks) to reach 20,
  // causing repeated "heavy selling" news long after the player stopped.
  const TRADE_DECAY_RATE = 0.80;
  const TRADE_DECAY_ZERO_THRESHOLD = 2; // below this → zero out (no lingering residuals)
  const decayedSells: Record<string, number> = {};
  const decayedBuys: Record<string, number> = {};
  for (const m of market) {
    const rawSell = (newSimState.recentPlayerSells[m.resource] ?? 0) * TRADE_DECAY_RATE;
    const rawBuy = (newSimState.recentPlayerBuys[m.resource] ?? 0) * TRADE_DECAY_RATE;
    decayedSells[m.resource] = rawSell < TRADE_DECAY_ZERO_THRESHOLD ? 0 : rawSell;
    decayedBuys[m.resource] = rawBuy < TRADE_DECAY_ZERO_THRESHOLD ? 0 : rawBuy;
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
    const resList = sectorResources[sector] ?? [];
    let sectorPriceChange = 0;
    let count = 0;
    for (const res of resList) {
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

  // ═════════════════════════════════════════════════════════════════════════
  // OVERLAY 1: MVIL — Process existing injections + generate new ones
  // ═════════════════════════════════════════════════════════════════════════

  const newInjections: Record<string, VolatilityInjection | undefined> = {
    ...(simState.volatilityInjections ?? {}),
  };

  // Decay existing injections
  for (const key of Object.keys(newInjections)) {
    const inj = newInjections[key];
    if (!inj) continue;
    inj.intensity *= (1 - inj.decay);
    inj.duration -= 1;
    if (inj.duration <= 0 || inj.intensity < 0.01) {
      newInjections[key] = undefined; // remove expired
    }
  }

  // Track newly generated injections for news
  const newInjectionEvents: Array<{ resource: ResourceType; injection: VolatilityInjection }> = [];

  // Source A: Micro random events — frequent, low intensity, single resource
  for (const m of market) {
    if (newInjections[m.resource]) continue; // max 1 per resource
    if (Math.random() < MICRO_EVENT_CHANCE) {
      const injection = generateMicroInjection(m.resource);
      newInjections[m.resource] = injection;
      newInjectionEvents.push({ resource: m.resource, injection });
    }
  }

  // Source B: Macro system events — sector-wide, medium/high intensity
  if (Math.random() < MACRO_EVENT_CHANCE) {
    const sectors: MarketSector[] = ['raw_minerals', 'raw_organic', 'basic_materials', 'components', 'advanced', 'high_tech', 'endgame', 'agriculture'];
    const targetSector = sectors[Math.floor(Math.random() * sectors.length)];
    const macroResults = generateMacroInjection(targetSector);
    for (const { resource, injection } of macroResults) {
      // Don't override existing micro injection
      if (!newInjections[resource]) {
        newInjections[resource] = injection;
        newInjectionEvents.push({ resource, injection });
      }
    }
  }

  // Source C: Chain reaction events — triggered by extreme price movement
  for (const m of market) {
    if (m.priceHistory.length < 2) continue;
    const prev = m.priceHistory[m.priceHistory.length - 1];
    const changeRatio = m.currentPrice / prev - 1;
    if (Math.abs(changeRatio) >= CHAIN_REACTION_THRESHOLD) {
      const chainResults = generateChainInjections(m.resource, changeRatio);
      for (const { resource, injection } of chainResults) {
        if (!newInjections[resource]) {
          newInjections[resource] = injection;
          newInjectionEvents.push({ resource, injection });
        }
      }
    }
  }

  // Clean up undefined entries
  const cleanInjections: Partial<Record<ResourceType, VolatilityInjection>> = {};
  for (const [key, val] of Object.entries(newInjections)) {
    if (val) cleanInjections[key as ResourceType] = val;
  }
  newSimState.volatilityInjections = cleanInjections;

  // ── 6. Compute new prices ──
  const priceChanges: Record<string, number> = {}; // for news generation
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

    // ═════════════════════════════════════════════════════════════════════
    // BASE SYSTEM totalChange (UNCHANGED from original)
    // ═════════════════════════════════════════════════════════════════════
    const baseTotalChange = noise + cycleEffect + momentumEffect + productionPressure + tradeImpact + corrEffect;

    // ═════════════════════════════════════════════════════════════════════
    // MVIL OVERLAY: Add injection effect (ADD-ON ONLY)
    // ═════════════════════════════════════════════════════════════════════
    let injectionEffect = 0;
    const injection = cleanInjections[m.resource];
    if (injection && injection.duration > 0) {
      injectionEffect = injection.intensity * injection.direction * elasticity * (0.5 + Math.random());
      // Safety clamp: ±0.05 per tick
      injectionEffect = Math.max(-MAX_INJECTION_EFFECT, Math.min(MAX_INJECTION_EFFECT, injectionEffect));
    }

    const totalChange = baseTotalChange + injectionEffect;

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

    // Track price change for news
    priceChanges[m.resource] = (newPrice - m.currentPrice) / m.currentPrice;

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

  // ═════════════════════════════════════════════════════════════════════════
  // OVERLAY 2: Generate Market News (Hybrid Pipeline with Throttling)
  // Pipeline: EventPacket → newsBuilder (fallback text) → [async LLM enhancement]
  // Throttling: Cooldowns per resource/sector/category + dedup + per-tick caps
  // ═════════════════════════════════════════════════════════════════════════
  const generatedNews: MarketNews[] = [];

  // Initialize cooldown state from previous sim state
  const lastNewsTick = { ...(simState.lastNewsTick ?? {}) };
  const lastSectorNewsTick = { ...(simState.lastSectorNewsTick ?? {}) };
  const lastCategoryNewsTick = { ...(simState.lastCategoryNewsTick ?? {}) };

  // Helper: Check if a resource/sector/category is on cooldown
  function isOnResourceCooldown(resource: string): boolean {
    const lastTick = lastNewsTick[resource as ResourceType];
    return lastTick !== undefined && (gameTick - lastTick) < RESOURCE_NEWS_COOLDOWN_TICKS;
  }
  function isOnSectorCooldown(sector: MarketSector): boolean {
    const lastTick = lastSectorNewsTick[sector];
    return lastTick !== undefined && (gameTick - lastTick) < SECTOR_NEWS_COOLDOWN_TICKS;
  }
  function isOnCategoryCooldown(category: string): boolean {
    const lastTick = lastCategoryNewsTick[category];
    return lastTick !== undefined && (gameTick - lastTick) < CATEGORY_NEWS_COOLDOWN_TICKS;
  }

  // Helper: Build MarketNews from EventPacket using enhanced templates
  function newsFromPacket(
    packet: EventPacket,
    affectedRes: ResourceType[],
    gameTick: number,
    category: MarketNews['category'],
  ): MarketNews {
    const { title, description } = generateFallbackText(packet);
    const name = RESOURCE_META[packet.resource as ResourceType]?.name ?? packet.resource;
    return {
      id: generateNewsId(),
      title,
      description,
      affectedResources: affectedRes,
      impactSummary: `${name} ${packet.delta}`,
      severity: packet.severity,
      gameTick,
      category,
      textSource: 'fallback',   // will be updated by async LLM enhancement
      eventPacket: packet,       // stored for async LLM re-generation
    };
  }

  // ── Phase 1: Collect ALL candidate news items (before throttling) ──
  const candidates: MarketNews[] = [];

  // News from significant price movements (via EventPacket)
  // RAISED THRESHOLD: Only 6%+ changes for low-severity, 4%+ for medium/high
  for (const m of newMarket) {
    const changeRatio = priceChanges[m.resource] ?? 0;
    const absChange = Math.abs(changeRatio);
    // Dynamic threshold: higher severity requires less change, low severity requires more
    if (absChange < PRICE_MOVE_THRESHOLD_HIGH) continue; // skip minor price movements
    const oldPrice = m.currentPrice / (1 + changeRatio);
    const packet = buildEventPacketFromPriceMove(m.resource, oldPrice, m.currentPrice, m.basePrice);
    if (packet) {
      candidates.push(newsFromPacket(packet, [m.resource], gameTick, 'price_move'));
    }
  }

  // News from new MVIL injection events (via EventPacket)
  // RAISED THRESHOLD: Only macro events and moderate+ intensity (0.3+)
  for (const { resource, injection } of newInjectionEvents) {
    if (injection.source === 'macro' || injection.intensity >= VOLATILITY_NEWS_MIN_INTENSITY) {
      const packet = buildEventPacketFromVolatility(resource, injection);
      candidates.push(newsFromPacket(packet, [resource], gameTick, 'volatility'));
    }
  }

  // News from sector-wide movements (via EventPacket)
  for (const sector of Object.keys(sectorTrends) as MarketSector[]) {
    const sectorRes = sectorResources[sector] ?? [];
    if (sectorRes.length === 0) continue;
    const trend = sectorTrends[sector] as 'up' | 'down' | 'stable';
    if (trend === 'stable') continue;
    let totalChange = 0;
    for (const res of sectorRes) {
      totalChange += priceChanges[res] ?? 0;
    }
    const avgChange = totalChange / sectorRes.length;
    const packet = buildEventPacketFromSector(sector, trend, avgChange);
    if (packet) {
      candidates.push(newsFromPacket(packet, sectorRes, gameTick, 'sector'));
    }
  }

  // News from trade imbalances (via EventPacket)
  // Freshness gate: only generate trade news if trades actually happened recently.
  // Without this, stale accumulated sell volume keeps generating "heavy selling" news
  // long after the player stopped trading — the decay alone wasn't fast enough.
  const TRADE_FRESHNESS_TICKS = RESOURCE_NEWS_COOLDOWN_TICKS; // must have traded within last cooldown period
  for (const m of newMarket) {
    const sells = newSimState.recentPlayerSells[m.resource] ?? 0;
    const buys = newSimState.recentPlayerBuys[m.resource] ?? 0;
    // Skip if no recent trade activity (prevents stale volume from generating news)
    const lastTrade = newSimState.lastTradeTick?.[m.resource] ?? 0;
    if (gameTick - lastTrade > TRADE_FRESHNESS_TICKS) continue;
    const packet = buildEventPacketFromTrade(m.resource, sells, buys);
    if (packet) {
      candidates.push(newsFromPacket(packet, [m.resource], gameTick, 'trade'));
    }
  }

  // ── Phase 2: Deduplication — same resource, keep highest severity ──
  // If a resource appears in multiple categories (price_move + volatility + trade),
  // keep only the most significant one (high > medium > low)
  const severityRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const bestByResource: Map<string, MarketNews> = new Map();
  const sectorNewsCandidates: MarketNews[] = []; // sector news uses sector key, not resource

  for (const news of candidates) {
    if (news.category === 'sector') {
      // Sector news keyed by sector name (from first affected resource's sector)
      sectorNewsCandidates.push(news);
      continue;
    }
    // Key by primary resource
    const key = news.affectedResources[0] ?? news.id;
    const existing = bestByResource.get(key);
    if (!existing || severityRank[news.severity] > severityRank[existing.severity]) {
      bestByResource.set(key, news);
    } else if (
      severityRank[news.severity] === severityRank[existing.severity] &&
      // Same severity — prefer price_move over volatility over trade
      (news.category === 'price_move' && existing.category !== 'price_move')
    ) {
      bestByResource.set(key, news);
    }
  }

  // ── Phase 3: Apply cooldowns and emit ──
  // Sort by severity (high first), then apply cooldowns and per-tick cap
  const deduped = [...bestByResource.values(), ...sectorNewsCandidates];
  deduped.sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0));

  for (const news of deduped) {
    if (generatedNews.length >= MAX_NEWS_PER_TICK) break;

    // Check cooldowns
    if (news.category === 'sector') {
      // Sector cooldown
      const sectorKey = news.affectedResources.length > 0
        ? RESOURCE_SECTOR[news.affectedResources[0]]
        : null;
      if (sectorKey && isOnSectorCooldown(sectorKey)) continue;
      // Also check category cooldown
      if (isOnCategoryCooldown('sector')) continue;

      generatedNews.push(news);
      if (sectorKey) lastSectorNewsTick[sectorKey] = gameTick;
      lastCategoryNewsTick['sector'] = gameTick;
    } else {
      // Resource-level cooldown
      const resource = news.affectedResources[0];
      if (resource && isOnResourceCooldown(resource)) continue;
      // Category cooldown
      if (isOnCategoryCooldown(news.category)) continue;

      generatedNews.push(news);
      if (resource) lastNewsTick[resource] = gameTick;
      lastCategoryNewsTick[news.category] = gameTick;
    }
  }

  // Store updated cooldown state
  newSimState.lastNewsTick = lastNewsTick;
  newSimState.lastSectorNewsTick = lastSectorNewsTick;
  newSimState.lastCategoryNewsTick = lastCategoryNewsTick;

  // ═════════════════════════════════════════════════════════════════════════
  // OVERLAY 3: Generate Player-driven Narratives (player behavior only)
  // Throttled: Max MAX_NARRATIVES_PER_TICK per simulation step
  // ═════════════════════════════════════════════════════════════════════════
  const generatedNarratives: MarketNarrative[] = [];

  // Production narratives (limit: only high-severity or first few)
  let productionNarratives = 0;
  for (const m of newMarket) {
    if (generatedNarratives.length >= MAX_NARRATIVES_PER_TICK) break;
    const prodRate = production[m.resource] ?? 0;
    const narrative = generateProductionNarrative(m.resource, prodRate, gameTick);
    if (narrative) {
      // Only emit production narratives for significant rates or every 100 ticks
      if (narrative.severity !== 'low' || productionNarratives === 0) {
        generatedNarratives.push(narrative);
        productionNarratives++;
      }
    }
  }

  // Consumption narratives (limit to avoid spam)
  let consumptionNarratives = 0;
  for (const m of newMarket) {
    if (generatedNarratives.length >= MAX_NARRATIVES_PER_TICK) break;
    if (consumptionNarratives >= 2) break;
    const consRate = consumption[m.resource] ?? 0;
    const narrative = generateConsumptionNarrative(m.resource, consRate, gameTick);
    if (narrative) {
      generatedNarratives.push(narrative);
      consumptionNarratives++;
    }
  }

  // Trade narratives (limit to avoid spam)
  // Same freshness gate as trade news: only for recent activity
  let tradeNarratives = 0;
  for (const m of newMarket) {
    if (generatedNarratives.length >= MAX_NARRATIVES_PER_TICK) break;
    if (tradeNarratives >= 1) break;
    const lastTrade = newSimState.lastTradeTick?.[m.resource] ?? 0;
    if (gameTick - lastTrade > TRADE_FRESHNESS_TICKS) continue;
    const sells = newSimState.recentPlayerSells[m.resource] ?? 0;
    const buys = newSimState.recentPlayerBuys[m.resource] ?? 0;
    const narrative = generateTradeNarrative(m.resource, sells, buys, gameTick);
    if (narrative) {
      generatedNarratives.push(narrative);
      tradeNarratives++;
    }
  }

  // Hoarding narratives (limit to avoid spam)
  let hoardingNarratives = 0;
  for (const m of newMarket) {
    if (generatedNarratives.length >= MAX_NARRATIVES_PER_TICK) break;
    if (hoardingNarratives >= 1) break;
    const held = resources[m.resource] ?? 0;
    const cap = resourceCapacity[m.resource] ?? 0;
    const narrative = generateHoardingNarrative(m.resource, held, cap, gameTick);
    if (narrative) {
      generatedNarratives.push(narrative);
      hoardingNarratives++;
    }
  }

  return {
    market: newMarket,
    simState: newSimState,
    sectorTrends: sectorTrends as Record<MarketSector, 'up' | 'down' | 'stable'>,
    news: generatedNews,
    narratives: generatedNarratives,
  };
}

// ─── Helper: Record a player trade ─────────────────────────────────────────

export function recordPlayerSell(simState: MarketSimulationState, resource: ResourceType, amount: number, gameTick?: number): MarketSimulationState {
  const result: MarketSimulationState = {
    ...simState,
    recentPlayerSells: {
      ...simState.recentPlayerSells,
      [resource]: (simState.recentPlayerSells[resource] ?? 0) + amount,
    },
  };
  // Track freshness: update lastTradeTick so trade news only fires for recent activity
  if (gameTick !== undefined) {
    result.lastTradeTick = {
      ...simState.lastTradeTick,
      [resource]: gameTick,
    };
  }
  return result;
}

export function recordPlayerBuy(simState: MarketSimulationState, resource: ResourceType, amount: number, gameTick?: number): MarketSimulationState {
  const result: MarketSimulationState = {
    ...simState,
    recentPlayerBuys: {
      ...simState.recentPlayerBuys,
      [resource]: (simState.recentPlayerBuys[resource] ?? 0) + amount,
    },
  };
  // Track freshness: update lastTradeTick so trade news only fires for recent activity
  if (gameTick !== undefined) {
    result.lastTradeTick = {
      ...simState.lastTradeTick,
      [resource]: gameTick,
    };
  }
  return result;
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

// ─── Helper: Get news/narrative severity color ─────────────────────────────

export function getSeverityStyle(severity: 'low' | 'medium' | 'high'): { color: string; bg: string; border: string; dot: string } {
  switch (severity) {
    case 'high':   return { color: 'text-red-400', bg: 'bg-red-900/10', border: 'border-red-500/20', dot: 'bg-red-500' };
    case 'medium': return { color: 'text-yellow-400', bg: 'bg-yellow-900/10', border: 'border-yellow-500/20', dot: 'bg-yellow-500' };
    case 'low':    return { color: 'text-gray-400', bg: 'bg-gray-900/10', border: 'border-gray-500/20', dot: 'bg-gray-500' };
  }
}

export function getCategoryIcon(category: MarketNews['category']): string {
  switch (category) {
    case 'price_move':  return '📈';
    case 'volatility':  return '⚡';
    case 'correlation': return '🔗';
    case 'sector':      return '📊';
    case 'trade':       return '💰';
  }
}
