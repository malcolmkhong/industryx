// ============================================
// FACTORY DOMINION: PRODUCTION CALCULATOR
// Single Source of Truth for ALL economy math
// ============================================
//
// ARCHITECTURE RULES:
// 1. All values are per-tick. No /s conversion anywhere.
// 2. gameSpeed never appears in any calculation.
// 3. store.ts calls these functions, applies results, mutates state.
// 4. UI reads productionSnapshot from store — never recalculates.
// 5. ONE function per system: production, power, sell, payout.

import {
  GameState,
  BuildingInstance,
  BuildingDefinition,
  ResourceType,
  Worker,
  WorkerDefinition,
  WeatherType,
} from './types';
import {
  BUILDING_DEFS,
  WORKER_DEFS,
  WEATHER_DEFS,
  RESEARCH_TREE,
} from './configCache';
import {
  ModifierRegistry,
  ModifierEngine,
  buildModifierRegistry,
} from './modifierEngine';
import { getBalance } from './balanceConfig';

// ─── Types ───────────────────────────────────────────────────────────

/** Optional definition provider for server-side usage. */
export interface GameDefs {
  buildings: Record<string, BuildingDefinition>;
  workers: Record<string, WorkerDefinition>;
}

/** Resolve building definition: use injected defs if provided, else static import */
function getBuildingDef(type: string, defs?: GameDefs) {
  return defs ? defs.buildings[type] : BUILDING_DEFS[type];
}

/** Resolve worker definition: use injected defs if provided, else static import */
function getWorkerDef(type: string, defs?: GameDefs) {
  return defs ? defs.workers[type] : WORKER_DEFS[type];
}

/** Precomputed multipliers — derived from state, not duplicating it. */
export interface MultiplierCache {
  // Modifier engine (new architecture)
  modifierEngine: ModifierEngine | null;
  // Optional injected definitions (server-side uses Supabase config instead of static imports)
  gameDefs?: GameDefs;
  // Event multipliers
  eventProductionGlobal: number;
  eventProductionTargeted: Map<string, number>;  // buildingType → multiplier
  eventPowerConsumption: number;
  eventResearch: number;

  // Weather multipliers
  weatherProduction: number;
  weatherSolar: number;
  weatherWind: number;

  // Power
  powerEfficiency: number;  // 0.0–1.0, ratio of production/consumption

  // Transport
  transportProductionBonus: number;
  transportThroughputBonus: number;  // Total throughput bonus (research + mega combined)

  // Category bonuses (pre-summed from research + mega)
  extractorBonus: number;   // extractorSpeedBonus + advancedDrillingBonus + megaExtractionBonus
  factoryBonus: number;     // factorySpeedBonus
  t1FactoryBonus: number;   // efficientSmeltingBonus
  t2FactoryBonus: number;   // advancedElectronicsBonus
  t3FactoryBonus: number;   // metabolicEngineeringBonus

  // Building-specific bonuses (pre-summed)
  specificBuildingBonuses: Map<string, number>;  // buildingType → bonus

  // Prestige + mega (pre-summed)
  productionBonus: number;  // productionPrestigeBonus + megaProductionBonus
  powerBonus: number;       // powerPrestigeBonus + megaPowerBonus
  researchBonus: number;    // researchPrestigeBonus + megaResearchBonus
  extractionBonus: number;  // megaExtractionBonus (included in extractorBonus above, kept for endgame)
  workerEfficiencyTotal: number;  // workerEfficiencyResearchBonus + megaWorkerBonus
  workerEfficiencyResearchBonus: number;  // Research-only portion (for worker XP calc)
  transportMegaBonus: number;
  marketBonus: number;      // marketResearch + prestigeMarket + megaMarket
  storageCapacityBonus: number;  // Total storage capacity bonus (research + mega)

  // Research flags
  hasMarketAnalysis: boolean;
  hasEnergyEfficiency: boolean;
  hasPowerOptimization: boolean;

  // Worker lookup (pre-built Map)
  workersByBuilding: Map<string, Worker[]>;

  // Endgame
  megaFactoryUnlocked: boolean;

  // Source tracking: which architecture produced this cache
  _source: 'legacy' | 'modifierEngine';
}

/** Per-building production result (per tick). */
export interface BuildResult {
  outputs: { resource: string; amount: number }[];       // per tick
  inputs: { resource: string; amount: number }[];        // per tick (demand)
  actualInputs: { resource: string; amount: number }[];  // per tick (what was actually consumed)
  efficiency: number;    // final efficiency multiplier applied
  canProduce: boolean;
  workerPowerSavings: number;  // power saved by worker maintenance (for this building)
}

/** Power grid result (per tick). */
export interface PowerResult {
  totalProduction: number;
  totalConsumption: number;
  efficiency: number;  // 0.0–1.0
  overload: boolean;
  /** Per-building fuel consumption details (for rate tracking) */
  fuelConsumption: { resource: string; amount: number; actualAmount: number }[];
}

/** Payout result (per payout cycle). */
export interface PayoutResult {
  amountPerCycle: number;
  breakdown: { extractors: number; factories: number; power: number };
}

/** Endgame building passive income result (per tick). */
export interface EndgameResult {
  moneyPerTick: number;
  researchPerTick: number;
  corpPerTick: number;
}

/** Single runtime truth snapshot — written once per tick, read by all UI. */
export interface ProductionSnapshot {
  // Per-resource totals (per tick)
  production: Record<string, number>;
  consumption: Record<string, number>;       // demand (includes stalled factories)
  actualConsumption: Record<string, number>; // actual consumption (excludes stalled)

  // Per-building detail (per tick)
  buildings: Record<string, {
    outputs: { resource: string; amount: number }[];
    inputs: { resource: string; amount: number }[];
    efficiency: number;
  }>;

  // Power grid
  powerProduction: number;
  powerConsumption: number;
  powerEfficiency: number;
  powerOverload: boolean;

  // Payout (per cycle)
  payoutPerCycle: number;
  payoutBreakdown: { extractors: number; factories: number; power: number };

  // Sell multiplier
  sellMultiplier: number;

  // Endgame passive income (per tick)
  endgameMoney: number;
  endgameResearch: number;
  endgameCorp: number;

  // Currency income/expense rates (per tick)
  moneyIncomeRate: number;
  moneyExpenseRate: number;
  rpIncomeRate: number;
  rpExpenseRate: number;
  cpIncomeRate: number;
  cpExpenseRate: number;
}

// ─── Empty / Default ─────────────────────────────────────────────────

export function emptyProductionSnapshot(): ProductionSnapshot {
  return {
    production: {},
    consumption: {},
    actualConsumption: {},
    buildings: {},
    powerProduction: 0,
    powerConsumption: 0,
    powerEfficiency: 1,
    powerOverload: false,
    payoutPerCycle: 0,
    payoutBreakdown: { extractors: 0, factories: 0, power: 0 },
    sellMultiplier: getBalance().market.baseSellMultiplier,
    endgameMoney: 0,
    endgameResearch: 0,
    endgameCorp: 0,
    moneyIncomeRate: 0,
    moneyExpenseRate: 0,
    rpIncomeRate: 0,
    rpExpenseRate: 0,
    cpIncomeRate: 0,
    cpExpenseRate: 0,
  };
}

// ─── Cache Builder ───────────────────────────────────────────────────

export function buildMultipliers(state: GameState): MultiplierCache {
  // ─── Build Modifier Registry ───────────────────────────────────────
  // The modifier engine is now the PRIMARY source of all bonus calculations.
  // No more hardcoded researchSet.has() checks — everything flows through
  // the modifier pipeline: Research/Prestige/Mega/Event/Weather → Modifier[] → Registry → Engine
  const registry = buildModifierRegistry(state, RESEARCH_TREE, WEATHER_DEFS);
  const engine = new ModifierEngine(registry);

  // ─── Resolve All Bonuses via Modifier Engine ───────────────────────
  // Each resolve() call replaces the old hardcoded research bonus calculation.
  // resolve(target, baseValue) returns the final value after all modifiers.
  // We subtract the base (1) to get the bonus portion for backward-compatible
  // MultiplierCache fields that expect additive bonuses (e.g., extractorBonus = 0.15).

  // Production bonuses (research + prestige + mega combined)
  const extractorBonus = engine.resolve('production.extractor', 1) - 1;
  const factoryBonus = engine.resolve('production.factory', 1) - 1;
  const t1FactoryBonus = engine.resolve('production.factory.t1', 1) - 1;
  const t2FactoryBonus = engine.resolve('production.factory.t2', 1) - 1;
  const t3FactoryBonus = engine.resolve('production.factory.t3', 1) - 1;

  // Prestige + mega production bonus (target: production.payout)
  const productionBonus = engine.resolve('production.payout', 1) - 1;

  // Power bonus (prestige + mega)
  const powerBonus = engine.resolve('power.production', 1) - 1;

  // Research speed bonus (prestige + mega)
  const researchBonus = engine.resolve('research.speed', 1) - 1;

  // Worker efficiency (research + mega)
  const workerEfficiencyTotal = engine.resolve('worker.efficiency', 1) - 1;
  const workerEfficiencyResearchBonus = registry.getModifiers('worker.efficiency')
    .filter(m => m.source === 'research')
    .reduce((sum, m) => sum + (m.value - 1), 0);

  // Market sell price (research + prestige + mega)
  const marketBonus = engine.resolve('market.sellPrice', 1) - 1;

  // Storage capacity (research + mega)
  const storageCapacityBonus = engine.resolve('storage.capacity', 1) - 1;

  // ─── Source-Specific Breakdowns ────────────────────────────────────
  // Some MultiplierCache fields need breakdown by source for backward compat.
  // We derive these from the registry by filtering modifiers.

  // Extraction bonus (mega-only portion, for endgame calc)
  const extractionBonus = registry.getModifiers('production.extractor')
    .filter(m => m.source === 'megaProject')
    .reduce((sum, m) => sum + (m.value - 1), 0);

  // Transport bonus (research + mega combined)
  const transportMultiplier = engine.resolve('transport.throughput', 1);
  const transportThroughputBonus = transportMultiplier - 1;
  const transportMegaBonus = registry.getModifiers('transport.throughput')
    .filter(m => m.source === 'megaProject')
    .reduce((sum, m) => sum + (m.value - 1), 0);

  // Transport production bonus formula (same as before: 1 + 0.25 * max(0, efficiency - 1))
  const transportEfficiency = state.transportLines.length > 0
    ? (state.transportLines.filter(t => t.active).length / Math.max(1, state.transportLines.length)) * transportMultiplier
    : 1;
  const transportProductionBonus = 1 + getBalance().transport.productionBonusCoeff * Math.max(0, transportEfficiency - 1);

  // ─── Boolean Flags via Modifier Engine ─────────────────────────────
  // These research flags are now checked via the modifier registry instead of researchSet.has()
  const hasMarketAnalysis = engine.hasModifier('market.sellPrice', 'research');
  const hasEnergyEfficiency = registry.getModifiers('power.consumption')
    .some(m => m.source === 'research' && m.sourceId === 'energyEfficiency');
  const hasPowerOptimization = registry.getModifiers('power.consumption')
    .some(m => m.source === 'research' && m.sourceId === 'powerOptimization');

  // ─── Event Modifiers ───────────────────────────────────────────────
  // Events are already registered in the modifier engine, but we also need
  // them as separate fields for backward compatibility (used directly in computeProduction)
  let eventProductionGlobal = 1;
  let eventResearch = 1;
  let eventPowerConsumption = 1;
  const eventProductionTargeted = new Map<string, number>();

  for (const event of state.activeEvents) {
    for (const effect of event.effects) {
      if (effect.type === 'productionMultiplier') {
        if (effect.target) {
          const existing = eventProductionTargeted.get(effect.target) ?? 1;
          eventProductionTargeted.set(effect.target, existing * effect.value);
        } else {
          eventProductionGlobal *= effect.value;
        }
      }
      if (effect.type === 'researchSpeed') eventResearch *= effect.value;
      if (effect.type === 'powerMultiplier') eventPowerConsumption *= effect.value;
    }
  }

  // ─── Weather Modifiers ─────────────────────────────────────────────
  // Resolved from modifier engine (weather uses 'override' operation)
  const weatherProduction = engine.resolve('weather.production', 1);
  const weatherSolar = engine.resolve('weather.solar', 1);
  const weatherWind = engine.resolve('weather.wind', 1);

  // ─── Worker Lookup ─────────────────────────────────────────────────
  const workersByBuilding = new Map<string, Worker[]>();
  for (const w of state.workers) {
    if (w.assignedTo) {
      const list = workersByBuilding.get(w.assignedTo);
      if (list) list.push(w);
      else workersByBuilding.set(w.assignedTo, [w]);
    }
  }

  // ─── Building-Specific Bonuses ─────────────────────────────────────
  // Derived from modifier registry (production.building.* targets)
  const specificBuildingBonuses = new Map<string, number>();
  for (const mod of registry.getAll()) {
    if (mod.target.startsWith('production.building.') && mod.operation === 'multiply') {
      const buildingType = mod.subTarget ?? mod.target.replace('production.building.', '');
      const existing = specificBuildingBonuses.get(buildingType) ?? 0;
      specificBuildingBonuses.set(buildingType, existing + (mod.value - 1));
    }
  }

  return {
    modifierEngine: engine,
    gameDefs: undefined,  // client side uses static imports
    eventProductionGlobal,
    eventProductionTargeted,
    eventPowerConsumption,
    eventResearch,
    weatherProduction,
    weatherSolar,
    weatherWind,
    powerEfficiency: 1,
    transportProductionBonus,
    transportThroughputBonus,
    extractorBonus,
    factoryBonus,
    t1FactoryBonus,
    t2FactoryBonus,
    t3FactoryBonus,
    specificBuildingBonuses,
    productionBonus,
    powerBonus,
    researchBonus,
    extractionBonus,
    workerEfficiencyTotal,
    workerEfficiencyResearchBonus,
    transportMegaBonus,
    marketBonus,
    storageCapacityBonus,
    hasMarketAnalysis,
    hasEnergyEfficiency,
    hasPowerOptimization,
    workersByBuilding,
    megaFactoryUnlocked: state.prestigeState.megaFactoryUnlocked,
    _source: 'modifierEngine' as const,
  };
}

// ─── Power Grid ──────────────────────────────────────────────────────

export function computePowerGrid(
  state: GameState,
  cache: MultiplierCache,
  resources: Record<string, number>,
  currentTick: number,
  defs?: GameDefs,
): PowerResult {
  const _defs = defs ?? cache.gameDefs;
  let totalProduction = 0;
  let totalConsumption = 0;
  const fuelConsumption: { resource: string; amount: number; actualAmount: number }[] = [];

  const powerBuildings = state.buildings.filter(
    b => getBuildingDef(b.type, _defs)?.category === 'power' && b.active
  );

  for (const b of powerBuildings) {
    const def = getBuildingDef(b.type, _defs);
    if (!def) continue;
    let production = def.basePowerProduction * b.level * b.efficiency;

    if (def.fuel && def.fuelRate) {
      const fuelConsumed = def.fuelRate * b.level;
      if (resources[def.fuel] >= fuelConsumed) {
        resources[def.fuel] -= fuelConsumed;
        totalProduction += production;
        fuelConsumption.push({ resource: def.fuel, amount: fuelConsumed, actualAmount: fuelConsumed });
      } else {
        production *= getBalance().power.fuelStarvedOutputRatio;
        totalProduction += production;
        const actuallyConsumed = resources[def.fuel] || 0;
        fuelConsumption.push({ resource: def.fuel, amount: fuelConsumed, actualAmount: actuallyConsumed });
        // NOTE: Do NOT drain remaining fuel — store leaves it untouched when supply is insufficient
      }
    } else {
      if (b.type === 'solarPanel') {
        const bal = getBalance();
        const dayFactor = bal.power.solarAmplitudeBase + bal.power.solarAmplitudeSwing * Math.sin(currentTick * bal.power.solarOscillationFreq);
        production *= Math.max(bal.power.solarMinOutput, dayFactor) * cache.weatherSolar;
      }
      if (b.type === 'windTurbine') {
        const windFactor = bal.power.windAmplitudeBase + bal.power.windAmplitudeSwing * Math.sin(currentTick * bal.power.windOscillationFreq + Math.PI / 3);
        production *= Math.max(bal.power.windMinOutput, windFactor) * cache.weatherWind;
      }
      totalProduction += production;
    }
  }

  const consumingBuildings = state.buildings.filter(
    b => { const d = getBuildingDef(b.type, _defs); return d && d.category !== 'power' && b.active; }
  );

  for (const b of consumingBuildings) {
    const def = getBuildingDef(b.type, _defs);
    if (!def) continue;
    totalConsumption += def.basePowerConsumption * b.level * b.efficiency;
  }

  const bal = getBalance();
  const energyEfficiencyReduction = cache.hasEnergyEfficiency ? bal.research.energyEfficiencyReduction : 0;
  const powerOptimizationReduction = cache.hasPowerOptimization ? bal.research.powerOptimizationReduction : 0;
  totalConsumption *= (1 - energyEfficiencyReduction) * (1 - powerOptimizationReduction) * cache.eventPowerConsumption;

  totalProduction *= (1 + cache.powerBonus);

  // Compute efficiency BEFORE worker savings (matches store.ts behavior)
  const efficiency = totalProduction > 0
    ? Math.max(bal.power.minEfficiency, Math.min(1, totalProduction / Math.max(0.001, totalConsumption)))
    : bal.power.minEfficiency;
  const overload = totalConsumption > totalProduction;

  // Worker power savings (applied AFTER efficiency)
  let workerPowerSavings = 0;
  for (const b of state.buildings) {
    if (!b.active) continue;
    const def = getBuildingDef(b.type, _defs);
    if (!def || def.basePowerConsumption <= 0) continue;

    const assignedWorkers = cache.workersByBuilding.get(b.id) ?? [];
    let workerMaintenanceReduction = 0;
    for (const w of assignedWorkers) {
      const wDef = getWorkerDef(w.type, _defs);
      if (wDef) {
        workerMaintenanceReduction += wDef.effects.maintenance * w.level * (1 + cache.workerEfficiencyTotal);
      }
    }
    const buildingPowerReduction = Math.min(bal.worker.maxPowerReductionPerBuilding, workerMaintenanceReduction);
    if (buildingPowerReduction > 0) {
      workerPowerSavings += def.basePowerConsumption * b.level * b.efficiency * buildingPowerReduction;
    }
  }

  const adjustedWorkerPowerSavings = workerPowerSavings * (1 - energyEfficiencyReduction) * (1 - powerOptimizationReduction) * cache.eventPowerConsumption;
  totalConsumption = Math.max(0, totalConsumption - adjustedWorkerPowerSavings);

  return {
    totalProduction,
    totalConsumption,
    efficiency,
    overload,
    fuelConsumption,
  };
}

// ─── Production ──────────────────────────────────────────────────────

export function computeProduction(
  building: BuildingInstance,
  cache: MultiplierCache,
  availableResources: Record<string, number>,
  defs?: GameDefs,
): BuildResult {
  const _defs = defs ?? cache.gameDefs;
  const def = getBuildingDef(building.type, _defs);
  if (!def || !building.active) {
    return { outputs: [], inputs: [], actualInputs: [], efficiency: 0, canProduce: false, workerPowerSavings: 0 };
  }

  let efficiency = building.efficiency
    * cache.powerEfficiency
    * cache.eventProductionGlobal
    * cache.weatherProduction
    * cache.transportProductionBonus;

  const targetedEventMult = cache.eventProductionTargeted.get(building.type);
  if (targetedEventMult) efficiency *= targetedEventMult;

  if (def.category === 'extractor') efficiency *= (1 + cache.extractorBonus);
  if (def.category === 'factory') efficiency *= (1 + cache.factoryBonus);
  if (def.category === 'factory' && def.tier === 1) efficiency *= (1 + cache.t1FactoryBonus);
  if (def.category === 'factory' && def.tier === 2) efficiency *= (1 + cache.t2FactoryBonus);
  if (def.category === 'factory' && def.tier === 3) efficiency *= (1 + cache.t3FactoryBonus);

  const specificBonus = cache.specificBuildingBonuses.get(building.type);
  if (specificBonus) efficiency *= (1 + specificBonus);

  const assignedWorkers = cache.workersByBuilding.get(building.id) ?? [];
  let workerMaintenanceReduction = 0;
  for (const w of assignedWorkers) {
    const wDef = getWorkerDef(w.type, _defs);
    if (wDef) {
      efficiency *= (1 + wDef.effects.speed * w.level * (1 + cache.workerEfficiencyTotal));
      efficiency *= (1 + wDef.effects.efficiency * w.level * (1 + cache.workerEfficiencyTotal));
      workerMaintenanceReduction += wDef.effects.maintenance * w.level * (1 + cache.workerEfficiencyTotal);
    }
  }

  const buildingPowerReduction = Math.min(getBalance().worker.maxPowerReductionPerBuilding, workerMaintenanceReduction);
  const workerPowerSavings = (buildingPowerReduction > 0 && def.basePowerConsumption > 0)
    ? def.basePowerConsumption * building.level * building.efficiency * buildingPowerReduction
    : 0;

  efficiency *= (1 + cache.productionBonus);

  if (def.category === 'extractor' && def.outputs) {
    const outputs = def.outputs
      .filter(o => o.resource !== 'money')
      .map(o => ({
        resource: o.resource,
        amount: o.amount * def.baseProductionRate * building.level * efficiency,
      }));
    return { outputs, inputs: [], actualInputs: [], efficiency, canProduce: true, workerPowerSavings };
  }

  if (def.category === 'factory' && def.inputs && def.outputs) {
    const adjustedInputs = def.inputs
      .filter(i => i.resource !== 'money')
      .map(i => ({
        resource: i.resource,
        amount: i.amount * building.level * efficiency,
      }));

    let canProduce = true;
    for (const input of adjustedInputs) {
      if ((availableResources[input.resource] ?? 0) < input.amount) {
        canProduce = false;
        break;
      }
    }

    const outputs = def.outputs
      .filter(o => o.resource !== 'money')
      .map(o => ({
        resource: o.resource,
        amount: o.amount * def.baseProductionRate * building.level * efficiency,
      }));

    return {
      outputs,
      inputs: adjustedInputs,
      actualInputs: canProduce ? adjustedInputs : [],
      efficiency,
      canProduce,
      workerPowerSavings,
    };
  }

  return { outputs: [], inputs: [], actualInputs: [], efficiency, canProduce: true, workerPowerSavings };
}

// ─── Sell Multiplier ─────────────────────────────────────────────────

export function computeSellMultiplier(
  _state: GameState,
  cache: MultiplierCache,
): number {
  return getBalance().market.baseSellMultiplier + cache.marketBonus;
}

// ─── Payout ──────────────────────────────────────────────────────────

export function computePayout(
  state: GameState,
  cache: MultiplierCache,
  defs?: GameDefs,
): PayoutResult {
  const _defs = defs ?? cache.gameDefs;
  const activeBuildings = state.buildings.filter(b => b.active);
  const extractors = activeBuildings.filter(b => getBuildingDef(b.type, _defs)?.category === 'extractor');
  const factories = activeBuildings.filter(b => getBuildingDef(b.type, _defs)?.category === 'factory');
  const powerPlants = activeBuildings.filter(b => getBuildingDef(b.type, _defs)?.category === 'power');

  const extractorRate = 20;
  const factoryRate = 50;
  const powerRate = 10;

  const extractorIncome = extractors.reduce((sum, b) => sum + extractorRate * b.level * b.efficiency, 0);
  const factoryIncome = factories.reduce((sum, b) => sum + factoryRate * b.level * b.efficiency, 0);
  const powerIncome = powerPlants.reduce((sum, b) => sum + powerRate * b.level * b.efficiency, 0);

  let amount = extractorIncome + factoryIncome + powerIncome;
  // NO gameSpeed multiplication — ticks already fire faster

  const avgEfficiency = activeBuildings.length > 0
    ? activeBuildings.reduce((sum, b) => sum + b.efficiency, 0) / activeBuildings.length
    : 0;
  amount *= avgEfficiency;

  amount *= (1 + cache.productionBonus);
  amount *= cache.eventProductionGlobal;
  amount *= cache.weatherProduction;

  return {
    amountPerCycle: Math.floor(amount),
    breakdown: { extractors: extractorIncome, factories: factoryIncome, power: powerIncome },
  };
}

// ─── Endgame Passive Income ──────────────────────────────────────────

export function computeEndgameIncome(
  state: GameState,
  cache: MultiplierCache,
): EndgameResult {
  let moneyPerTick = 0;
  let researchPerTick = 0;
  let corpPerTick = 0;

  const endgameTypes = ['dysonCollector', 'quantumTeleporter', 'dimensionalGateway', 'timeDistorter', 'galacticForge'];
  const endgameBuildings = state.buildings.filter(b => b.active && endgameTypes.includes(b.type));

  for (const b of endgameBuildings) {
    let endEff = b.efficiency * cache.powerEfficiency;

    if (cache.megaFactoryUnlocked) {
      endEff *= cache.eventProductionGlobal * cache.weatherProduction * cache.transportProductionBonus;
      endEff *= (1 + cache.productionBonus);
    }

    const rate = b.level * endEff;
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
