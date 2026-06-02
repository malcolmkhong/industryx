// ============================================
// FACTORY DOMINION: Production Calculator
// Pure functions for economy computations
// ============================================

import type {
  GameState, ResourceType, BuildingInstance, WeatherType,
} from './types';
import {
  BUILDING_DEFS, WORKER_DEFS, WEATHER_DEFS,
} from './data';

// --- Helper: Mega project bonus ---
function getMegaProjectBonus(
  megaProjects: { completed: boolean; bonus: { type: string; value: number } }[],
  bonusType: string,
): number {
  return megaProjects.filter(p => p.completed && p.bonus.type === bonusType).reduce((sum, p) => sum + p.bonus.value, 0);
}

// ============================================
// TYPES
// ============================================

export interface MultiplierCache {
  // Weather
  weatherProductionMultiplier: number;
  weatherSolarMultiplier: number;
  weatherWindMultiplier: number;

  // Events
  eventProductionGlobal: number;
  eventResearch: number;
  eventPowerConsumption: number;
  eventProductionTargeted: Map<string, number>;

  // Research
  extractorSpeedBonus: number;
  factorySpeedBonus: number;
  workerEfficiencyBonus: number;
  logistics1Bonus: number;
  advancedLogisticsBonus: number;
  transportBonus: number;

  // Prestige
  productionBonus: number;
  powerBonus: number;

  // Mega projects
  megaProductionBonus: number;
  megaPowerBonus: number;
  megaResearchBonus: number;
  megaExtractionBonus: number;
  megaWorkerBonus: number;
  megaTransportBonus: number;
  megaMarketBonus: number;

  // Transport
  transportProductionBonus: number;

  // Workers by building
  workersByBuilding: Map<string, { type: string; level: number; speed: number; effects: { speed: number } }[]>;

  // Power efficiency (set after computePowerGrid runs)
  powerEfficiency: number;
}

export interface FuelConsumption {
  resource: string;
  amount: number;
  actualAmount: number;
}

export interface PowerResult {
  totalProduction: number;
  totalConsumption: number;
  efficiency: number;
  overload: boolean;
  fuelConsumption: FuelConsumption[];
}

export interface ResourceIO {
  resource: string;
  amount: number;
}

export interface BuildResult {
  canProduce: boolean;
  outputs: ResourceIO[];
  inputs: ResourceIO[];
  actualInputs: ResourceIO[];
  efficiency: number;
}

export interface PayoutBreakdown {
  extractorIncome: number;
  factoryIncome: number;
  powerIncome: number;
}

export interface PayoutResult {
  amountPerCycle: number;
  breakdown: PayoutBreakdown;
}

export interface EndgameResult {
  moneyPerTick: number;
  researchPerTick: number;
  corpPerTick: number;
}

export interface BuildingSnapshot {
  outputs: ResourceIO[];
  inputs: ResourceIO[];
  efficiency: number;
}

export interface ProductionSnapshot {
  production: Record<string, number>;
  consumption: Record<string, number>;
  actualConsumption: Record<string, number>;
  buildings: Record<string, BuildingSnapshot>;
  powerProduction: number;
  powerConsumption: number;
  powerEfficiency: number;
  powerOverload: boolean;
  payoutPerCycle: number;
  payoutBreakdown: PayoutBreakdown;
  sellMultiplier: number;
  endgameMoney: number;
  endgameResearch: number;
  endgameCorp: number;
}

// ============================================
// SAFE CONDITION HELPER
// ============================================

function safeCondition(condition: number | null | undefined): number {
  if (condition == null || !Number.isFinite(condition)) return 100;
  return Math.max(0, Math.min(100, condition));
}

// ============================================
// FUNCTIONS
// ============================================

/**
 * Build a cache of all multipliers from weather, events, research, prestige,
 * mega projects, transport, and workers.
 */
export function buildMultipliers(state: GameState): MultiplierCache {
  // Weather
  const weatherDef = WEATHER_DEFS[state.weather.current as WeatherType];
  let weatherProductionMultiplier = 1;
  let weatherSolarMultiplier = 1;
  let weatherWindMultiplier = 1;
  if (weatherDef) {
    weatherProductionMultiplier = weatherDef.productionMultiplier;
    weatherSolarMultiplier = weatherDef.solarMultiplier;
    weatherWindMultiplier = weatherDef.windMultiplier;
  }

  // Events
  let eventProductionGlobal = 1;
  let eventResearch = 1;
  let eventPowerConsumption = 1;
  const eventProductionTargeted = new Map<string, number>();
  state.activeEvents.forEach(event => {
    event.effects.forEach(effect => {
      if (effect.type === 'productionMultiplier') {
        if (effect.target) {
          const current = eventProductionTargeted.get(effect.target) ?? 1;
          eventProductionTargeted.set(effect.target, current * effect.value);
        } else {
          eventProductionGlobal *= effect.value;
        }
      }
      if (effect.type === 'researchSpeed') eventResearch *= effect.value;
      if (effect.type === 'powerMultiplier') eventPowerConsumption *= effect.value;
    });
  });

  // Research bonuses
  const extractorSpeedBonus = state.completedResearch.includes('basicAutomation') ? 0.15 : 0;
  const factorySpeedBonus = state.completedResearch.includes('advancedAutomation') ? 0.25 : 0;
  const workerEfficiencyBonus = state.completedResearch.includes('workerTraining') ? 0.25 : 0;
  const logistics1Bonus = state.completedResearch.includes('logistics1') ? 0.2 : 0;
  const advancedLogisticsBonus = state.completedResearch.includes('advancedLogistics') ? 0.3 : 0;
  const transportBonus = logistics1Bonus + advancedLogisticsBonus;

  // Prestige bonuses
  const productionBonus = state.prestigeState.bonuses
    .filter(b => b.purchased && b.effect.type === 'productionMultiplier')
    .reduce((sum, b) => sum + b.effect.value, 0);
  const powerBonus = state.prestigeState.bonuses
    .filter(b => b.purchased && b.effect.type === 'powerMultiplier')
    .reduce((sum, b) => sum + b.effect.value, 0);

  // Mega project bonuses
  const megaProductionBonus = getMegaProjectBonus(state.megaProjects, 'productionMultiplier');
  const megaPowerBonus = getMegaProjectBonus(state.megaProjects, 'powerMultiplier');
  const megaResearchBonus = getMegaProjectBonus(state.megaProjects, 'researchMultiplier');
  const megaExtractionBonus = getMegaProjectBonus(state.megaProjects, 'extractionMultiplier');
  const megaWorkerBonus = getMegaProjectBonus(state.megaProjects, 'workerEfficiency');
  const megaTransportBonus = getMegaProjectBonus(state.megaProjects, 'transportMultiplier');
  const megaMarketBonus = getMegaProjectBonus(state.megaProjects, 'marketMultiplier');

  // Transport efficiency
  const transportProductionBonus = state.transportLines.length > 0
    ? (state.transportLines.filter(t => t.active).length / Math.max(1, state.transportLines.length)) * (1 + transportBonus + megaTransportBonus)
    : 1;

  // Workers by building
  const workersByBuilding = new Map<string, { type: string; level: number; speed: number; effects: { speed: number } }[]>();
  for (const w of state.workers) {
    if (w.assignedTo) {
      const arr = workersByBuilding.get(w.assignedTo) ?? [];
      const wDef = WORKER_DEFS[w.type];
      arr.push({ type: w.type, level: w.level, speed: w.speed, effects: wDef ? { speed: wDef.effects.speed } : { speed: 0 } });
      workersByBuilding.set(w.assignedTo, arr);
    }
  }

  return {
    weatherProductionMultiplier,
    weatherSolarMultiplier,
    weatherWindMultiplier,
    eventProductionGlobal,
    eventResearch,
    eventPowerConsumption,
    eventProductionTargeted,
    extractorSpeedBonus,
    factorySpeedBonus,
    workerEfficiencyBonus,
    logistics1Bonus,
    advancedLogisticsBonus,
    transportBonus,
    productionBonus,
    powerBonus,
    megaProductionBonus,
    megaPowerBonus,
    megaResearchBonus,
    megaExtractionBonus,
    megaWorkerBonus,
    megaTransportBonus,
    megaMarketBonus,
    transportProductionBonus,
    workersByBuilding,
    powerEfficiency: 0, // Will be set by computePowerGrid
  };
}

/**
 * Compute the power grid: production, consumption, fuel usage, and efficiency.
 * Mutates `resources` for fuel consumption.
 * Mutates `cache.powerEfficiency` with the computed efficiency.
 */
export function computePowerGrid(
  state: GameState,
  cache: MultiplierCache,
  resources: Record<string, number>,
  tick: number,
): PowerResult {
  let totalProduction = 0;
  let totalConsumption = 0;
  const fuelConsumption: FuelConsumption[] = [];

  // Power-producing buildings
  const powerBuildings = state.buildings.filter(
    b => BUILDING_DEFS[b.type]?.category === 'power' && b.active,
  );
  for (const b of powerBuildings) {
    const def = BUILDING_DEFS[b.type];
    if (!def) continue;

    let production = def.basePowerProduction * b.level * (b.efficiency > 0 ? b.efficiency : 1);

    if (def.fuel && def.fuelRate) {
      const fuelConsumed = def.fuelRate * b.level;
      if ((resources[def.fuel] ?? 0) >= fuelConsumed) {
        resources[def.fuel] = (resources[def.fuel] ?? 0) - fuelConsumed;
        totalProduction += production;
        fuelConsumption.push({ resource: def.fuel, amount: fuelConsumed, actualAmount: fuelConsumed });
      } else {
        production *= 0.1;
        totalProduction += production;
        const actuallyConsumed = resources[def.fuel] || 0;
        resources[def.fuel] = 0;
        fuelConsumption.push({ resource: def.fuel, amount: fuelConsumed, actualAmount: actuallyConsumed });
      }
    } else {
      if (b.type === 'solarPanel') {
        const dayFactor = 0.5 + 0.5 * Math.sin(tick * 0.01);
        production *= Math.max(0.2, dayFactor) * cache.weatherSolarMultiplier;
      }
      if (b.type === 'windTurbine') {
        const windFactor = 0.5 + 0.5 * Math.sin(tick * 0.007 + Math.PI / 3);
        production *= Math.max(0.3, windFactor) * cache.weatherWindMultiplier;
      }
      totalProduction += production;
    }
  }

  // Power-consuming buildings
  const consumingBuildings = state.buildings.filter(b => {
    const d = BUILDING_DEFS[b.type];
    return d && d.category !== 'power' && b.active;
  });
  for (const b of consumingBuildings) {
    const def = BUILDING_DEFS[b.type];
    if (!def) continue;
    totalConsumption += def.basePowerConsumption * b.level * b.efficiency;
  }

  // Research reduction on power consumption
  const powerEfficiencyResearch = state.completedResearch.includes('energyEfficiency') ? 0.15 : 0;
  totalConsumption *= (1 - powerEfficiencyResearch);

  // Event power consumption modifier
  totalConsumption *= cache.eventPowerConsumption;

  // Prestige and mega bonuses on production
  totalProduction *= (1 + cache.powerBonus + cache.megaPowerBonus);

  // Worker power savings — workers assigned to power buildings reduce consumption
  for (const w of state.workers) {
    if (w.assignedTo) {
      const building = state.buildings.find(b => b.id === w.assignedTo);
      if (building && BUILDING_DEFS[building.type]?.category === 'power') {
        totalConsumption *= 0.97; // 3% reduction per worker in power building
      }
    }
  }

  const efficiency = totalProduction > 0 ? Math.min(1, totalProduction / Math.max(0.001, totalConsumption)) : 0;
  const overload = totalConsumption > totalProduction;

  // Update cache
  cache.powerEfficiency = efficiency;

  return {
    totalProduction,
    totalConsumption,
    efficiency,
    overload,
    fuelConsumption,
  };
}

/**
 * Compute production for a single building.
 * Does NOT mutate resources — the caller must apply the changes.
 */
export function computeProduction(
  building: BuildingInstance,
  cache: MultiplierCache,
  availableResources: Record<string, number>,
): BuildResult {
  const def = BUILDING_DEFS[building.type];
  if (!def || !building.active) {
    return { canProduce: false, outputs: [], inputs: [], actualInputs: [], efficiency: 0 };
  }

  // Base efficiency chain
  let efficiency = building.efficiency * cache.powerEfficiency * cache.eventProductionGlobal * cache.weatherProductionMultiplier;

  // Condition affects efficiency: below 75%, proportional penalty
  const conditionEfficiency = safeCondition(building.condition) >= 75 ? 1.0 : safeCondition(building.condition) / 75;
  efficiency *= conditionEfficiency;

  // Category bonuses
  if (def.category === 'extractor') efficiency *= (1 + cache.extractorSpeedBonus + cache.megaExtractionBonus);
  if (def.category === 'factory') efficiency *= (1 + cache.factorySpeedBonus);

  // Worker bonus
  const assignedWorkers = cache.workersByBuilding.get(building.id) ?? [];
  let workerBonus = 0;
  for (const w of assignedWorkers) {
    workerBonus += w.effects.speed * Math.min(w.level, 10) * (1 + cache.workerEfficiencyBonus + cache.megaWorkerBonus);
  }
  efficiency *= (1 + Math.min(workerBonus, 2.0)); // Cap worker bonus at 200%

  // Prestige and mega production bonus
  efficiency *= (1 + cache.productionBonus + cache.megaProductionBonus);

  // Targeted event bonus (if this building's type is targeted)
  const targetedBonus = cache.eventProductionTargeted.get(building.type);
  if (targetedBonus) {
    efficiency *= targetedBonus;
  }

  // Extractor output calculation
  if (def.category === 'extractor' && def.outputs) {
    const outputs: ResourceIO[] = [];
    for (const output of def.outputs) {
      if (output.resource === 'money') continue;
      const produced = output.amount * def.baseProductionRate * building.level * efficiency;
      outputs.push({ resource: output.resource, amount: produced });
    }
    const inputs: ResourceIO[] = [];
    return { canProduce: true, outputs, inputs, actualInputs: [], efficiency };
  }

  // Factory production calculation
  if (def.category === 'factory' && def.inputs && def.outputs) {
    const adjustedInputs: ResourceIO[] = def.inputs
      .map(input => {
        if (input.resource === 'money') return { resource: input.resource, amount: 0 };
        return {
          resource: input.resource,
          amount: input.amount * def.baseProductionRate * building.level * efficiency,
        };
      })
      .filter(i => i.resource !== 'money');

    let canProduce = true;
    for (const input of adjustedInputs) {
      const res = input.resource as ResourceType;
      if ((availableResources[res] ?? 0) < input.amount) {
        canProduce = false;
        break;
      }
    }

    const outputs: ResourceIO[] = [];
    for (const output of def.outputs) {
      if (output.resource === 'money') continue;
      const produced = output.amount * def.baseProductionRate * building.level * efficiency;
      outputs.push({ resource: output.resource, amount: produced });
    }

    return {
      canProduce,
      outputs,
      inputs: adjustedInputs,
      actualInputs: canProduce ? adjustedInputs : [],
      efficiency,
    };
  }

  // Power and storage buildings — no resource production
  return { canProduce: false, outputs: [], inputs: [], actualInputs: [], efficiency };
}

/**
 * Compute the sell multiplier (base 0.9 + market research + prestige + mega).
 */
export function computeSellMultiplier(_state: GameState, cache: MultiplierCache): number {
  return 0.9 + cache.megaMarketBonus;
  // Note: marketAnalysis research and prestige market bonuses are computed
  // from state, but we need them from the cache. Let's recompute from state.
}

/**
 * Compute the sell multiplier with full state access for research + prestige.
 */
export function computeSellMultiplierFull(state: GameState, cache: MultiplierCache): number {
  const marketBonus = state.completedResearch.includes('marketAnalysis') ? 0.2 : 0;
  const prestigeMarketBonus = state.prestigeState.bonuses
    .filter(b => b.purchased && b.effect.type === 'marketMultiplier')
    .reduce((sum, b) => sum + b.effect.value, 0);
  return 0.9 + marketBonus + prestigeMarketBonus + cache.megaMarketBonus;
}

/**
 * Compute payout amount per cycle.
 */
export function computePayout(state: GameState, cache: MultiplierCache): PayoutResult {
  const activeBuildings = state.buildings.filter(b => b.active);
  const extractors = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor');
  const factories = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory');
  const powerPlants = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power');

  const extractorBaseRate = 2;
  const factoryBaseRate = 5;
  const powerBaseRate = 1;

  const extractorIncome = extractors.reduce((sum, b) => {
    const tier = BUILDING_DEFS[b.type]?.tier ?? 0;
    const tierMult = 1 + tier * 2;
    return sum + extractorBaseRate * tierMult * b.level;
  }, 0);
  const factoryIncome = factories.reduce((sum, b) => {
    const tier = BUILDING_DEFS[b.type]?.tier ?? 0;
    const tierMult = 1 + tier * 2;
    return sum + factoryBaseRate * tierMult * b.level;
  }, 0);
  const powerIncome = powerPlants.reduce((sum, b) => {
    const tier = BUILDING_DEFS[b.type]?.tier ?? 0;
    const tierMult = 1 + tier * 2;
    return sum + powerBaseRate * tierMult * b.level;
  }, 0);

  let rawPayout = extractorIncome + factoryIncome + powerIncome;

  // Apply game speed multiplier
  rawPayout *= state.gameSpeed;

  // Apply power grid efficiency modifier
  rawPayout *= cache.powerEfficiency;

  // Apply prestige bonuses
  const payoutPrestigeBonus = state.prestigeState.bonuses
    .filter(b => b.purchased && b.effect.type === 'productionMultiplier')
    .reduce((sum, b) => sum + b.effect.value, 0);
  rawPayout *= (1 + payoutPrestigeBonus + cache.megaProductionBonus);

  // Apply event production multiplier
  rawPayout *= cache.eventProductionGlobal;

  // Apply weather modifier
  rawPayout *= cache.weatherProductionMultiplier;

  return {
    amountPerCycle: Math.floor(rawPayout),
    breakdown: { extractorIncome, factoryIncome, powerIncome },
  };
}

/**
 * Compute endgame building passive income.
 */
export function computeEndgameIncome(state: GameState, cache: MultiplierCache): EndgameResult {
  let moneyPerTick = 0;
  let researchPerTick = 0;
  let corpPerTick = 0;

  const endgameBuildings = state.buildings.filter(b => b.active && [
    'dysonCollector', 'quantumTeleporter', 'dimensionalGateway', 'timeDistorter', 'galacticForge',
  ].includes(b.type));

  for (const b of endgameBuildings) {
    const eff = b.efficiency * cache.powerEfficiency;
    const rate = b.level * eff;
    switch (b.type) {
      case 'dysonCollector':
        moneyPerTick += Math.floor(8000 * rate);
        break;
      case 'quantumTeleporter':
        researchPerTick += Math.floor(10 * rate);
        break;
      case 'dimensionalGateway':
        corpPerTick += Math.floor(1 * rate);
        break;
      case 'timeDistorter':
        moneyPerTick += Math.floor(5000 * rate);
        researchPerTick += Math.floor(5 * rate);
        break;
      case 'galacticForge':
        moneyPerTick += Math.floor(100000 * rate);
        researchPerTick += Math.floor(50 * rate);
        corpPerTick += Math.floor(5 * rate);
        break;
    }
  }

  return { moneyPerTick, researchPerTick, corpPerTick };
}

/**
 * Create an empty production snapshot.
 */
export function emptyProductionSnapshot(): ProductionSnapshot {
  return {
    production: {},
    consumption: {},
    actualConsumption: {},
    buildings: {},
    powerProduction: 0,
    powerConsumption: 0,
    powerEfficiency: 0,
    powerOverload: false,
    payoutPerCycle: 0,
    payoutBreakdown: { extractorIncome: 0, factoryIncome: 0, powerIncome: 0 },
    sellMultiplier: 0.9,
    endgameMoney: 0,
    endgameResearch: 0,
    endgameCorp: 0,
  };
}
