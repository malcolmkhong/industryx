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
  ResourceType,
  Worker,
  MegaProjectBonusType,
  WeatherType,
} from './types';
import {
  BUILDING_DEFS,
  WORKER_DEFS,
  WEATHER_DEFS,
} from './configCache';

// ─── Types ───────────────────────────────────────────────────────────

/** Precomputed multipliers — derived from state, not duplicating it. */
export interface MultiplierCache {
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
  transportMegaBonus: number;
  marketBonus: number;      // marketResearch + prestigeMarket + megaMarket

  // Research flags
  hasMarketAnalysis: boolean;
  hasEnergyEfficiency: boolean;
  hasPowerOptimization: boolean;

  // Worker lookup (pre-built Map)
  workersByBuilding: Map<string, Worker[]>;

  // Endgame
  megaFactoryUnlocked: boolean;
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
    sellMultiplier: 0.9,
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
  const researchSet = new Set(state.completedResearch);

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

  const weatherDef = WEATHER_DEFS[state.weather.current as WeatherType];
  const weatherProduction = weatherDef?.productionMultiplier ?? 1;
  const weatherSolar = weatherDef?.solarMultiplier ?? 1;
  const weatherWind = weatherDef?.windMultiplier ?? 1;

  const extractorSpeedBonus = researchSet.has('basicAutomation') ? 0.15 : 0;
  const factorySpeedBonus = researchSet.has('advancedAutomation') ? 0.25 : 0;
  const workerEfficiencyResearchBonus = researchSet.has('workerTraining') ? 0.25 : 0;
  const logistics1Bonus = researchSet.has('logistics1') ? 0.2 : 0;
  const advancedLogisticsBonus = researchSet.has('advancedLogistics') ? 0.3 : 0;
  const cargoDronesBonus = researchSet.has('cargoDrones') ? 0.25 : 0;
  const transportBonus = logistics1Bonus + advancedLogisticsBonus + cargoDronesBonus;
  const advancedDrillingBonus = researchSet.has('advancedDrilling') ? 0.20 : 0;
  const efficientSmeltingBonus = researchSet.has('efficientSmelting') ? 0.15 : 0;
  const advancedElectronicsBonus = researchSet.has('advancedElectronics') ? 0.15 : 0;
  const metabolicEngineeringBonus = researchSet.has('metabolicEngineering') ? 0.20 : 0;
  const aiOptimizationBonus = researchSet.has('aiOptimization') ? 0.20 : 0;
  const advancedRoboticsBonus = researchSet.has('advancedRobotics') ? 0.25 : 0;
  const quantumComputingBonus = researchSet.has('quantumComputing') ? 0.30 : 0;

  const productionPrestigeBonus = state.prestigeState.bonuses
    .filter(b => b.purchased && b.effect.type === 'productionMultiplier')
    .reduce((sum, b) => sum + b.effect.value, 0);
  const powerPrestigeBonus = state.prestigeState.bonuses
    .filter(b => b.purchased && b.effect.type === 'powerMultiplier')
    .reduce((sum, b) => sum + b.effect.value, 0);
  const researchPrestigeBonus = state.prestigeState.bonuses
    .filter(b => b.purchased && b.effect.type === 'researchMultiplier')
    .reduce((sum, b) => sum + b.effect.value, 0);
  const prestigeMarketBonus = state.prestigeState.bonuses
    .filter(b => b.purchased && b.effect.type === 'marketMultiplier')
    .reduce((sum, b) => sum + b.effect.value, 0);

  let megaProductionBonus = 0;
  let megaPowerBonus = 0;
  let megaResearchBonus = 0;
  let megaExtractionBonus = 0;
  let megaWorkerBonus = 0;
  let megaTransportBonus = 0;
  let megaMarketBonus = 0;

  for (const p of state.megaProjects) {
    if (!p.completed) continue;
    switch (p.bonus.type as MegaProjectBonusType) {
      case 'productionMultiplier': megaProductionBonus += p.bonus.value; break;
      case 'powerMultiplier': megaPowerBonus += p.bonus.value; break;
      case 'researchMultiplier': megaResearchBonus += p.bonus.value; break;
      case 'extractionMultiplier': megaExtractionBonus += p.bonus.value; break;
      case 'workerEfficiency': megaWorkerBonus += p.bonus.value; break;
      case 'transportMultiplier': megaTransportBonus += p.bonus.value; break;
      case 'marketMultiplier': megaMarketBonus += p.bonus.value; break;
      case 'buildingCostReduction': break;
      case 'unlimitedStorage': break;
    }
  }

  const transportEfficiency = state.transportLines.length > 0
    ? (state.transportLines.filter(t => t.active).length / Math.max(1, state.transportLines.length)) * (1 + transportBonus + megaTransportBonus)
    : 1;
  const transportProductionBonus = 1 + 0.25 * Math.max(0, transportEfficiency - 1);

  const hasMarketAnalysis = researchSet.has('marketAnalysis');
  const marketResearchBonus = hasMarketAnalysis ? 0.2 : 0;

  const hasEnergyEfficiency = researchSet.has('energyEfficiency');
  const hasPowerOptimization = researchSet.has('powerOptimization');

  const workersByBuilding = new Map<string, Worker[]>();
  for (const w of state.workers) {
    if (w.assignedTo) {
      const list = workersByBuilding.get(w.assignedTo);
      if (list) list.push(w);
      else workersByBuilding.set(w.assignedTo, [w]);
    }
  }

  const specificBuildingBonuses = new Map<string, number>();
  specificBuildingBonuses.set('aiLab', aiOptimizationBonus);
  specificBuildingBonuses.set('neuralLab', aiOptimizationBonus);
  specificBuildingBonuses.set('roboticsBay', advancedRoboticsBonus);
  specificBuildingBonuses.set('droneShipyard', advancedRoboticsBonus);
  specificBuildingBonuses.set('quantumLab', quantumComputingBonus);

  return {
    eventProductionGlobal,
    eventProductionTargeted,
    eventPowerConsumption,
    eventResearch,
    weatherProduction,
    weatherSolar,
    weatherWind,
    powerEfficiency: 1,
    transportProductionBonus,
    extractorBonus: extractorSpeedBonus + advancedDrillingBonus + megaExtractionBonus,
    factoryBonus: factorySpeedBonus,
    t1FactoryBonus: efficientSmeltingBonus,
    t2FactoryBonus: advancedElectronicsBonus,
    t3FactoryBonus: metabolicEngineeringBonus,
    specificBuildingBonuses,
    productionBonus: productionPrestigeBonus + megaProductionBonus,
    powerBonus: powerPrestigeBonus + megaPowerBonus,
    researchBonus: researchPrestigeBonus + megaResearchBonus,
    extractionBonus: megaExtractionBonus,
    workerEfficiencyTotal: workerEfficiencyResearchBonus + megaWorkerBonus,
    transportMegaBonus: megaTransportBonus,
    marketBonus: marketResearchBonus + prestigeMarketBonus + megaMarketBonus,
    hasMarketAnalysis,
    hasEnergyEfficiency,
    hasPowerOptimization,
    workersByBuilding,
    megaFactoryUnlocked: state.prestigeState.megaFactoryUnlocked,
  };
}

// ─── Power Grid ──────────────────────────────────────────────────────

export function computePowerGrid(
  state: GameState,
  cache: MultiplierCache,
  resources: Record<string, number>,
  currentTick: number,
): PowerResult {
  let totalProduction = 0;
  let totalConsumption = 0;
  const fuelConsumption: { resource: string; amount: number; actualAmount: number }[] = [];

  const powerBuildings = state.buildings.filter(
    b => BUILDING_DEFS[b.type]?.category === 'power' && b.active
  );

  for (const b of powerBuildings) {
    const def = BUILDING_DEFS[b.type];
    if (!def) continue;
    let production = def.basePowerProduction * b.level * b.efficiency;

    if (def.fuel && def.fuelRate) {
      const fuelConsumed = def.fuelRate * b.level;
      if (resources[def.fuel] >= fuelConsumed) {
        resources[def.fuel] -= fuelConsumed;
        totalProduction += production;
        fuelConsumption.push({ resource: def.fuel, amount: fuelConsumed, actualAmount: fuelConsumed });
      } else {
        production *= 0.1;
        totalProduction += production;
        const actuallyConsumed = resources[def.fuel] || 0;
        fuelConsumption.push({ resource: def.fuel, amount: fuelConsumed, actualAmount: actuallyConsumed });
        // NOTE: Do NOT drain remaining fuel — store leaves it untouched when supply is insufficient
      }
    } else {
      if (b.type === 'solarPanel') {
        const dayFactor = 0.5 + 0.5 * Math.sin(currentTick * 0.01);
        production *= Math.max(0.2, dayFactor) * cache.weatherSolar;
      }
      if (b.type === 'windTurbine') {
        const windFactor = 0.5 + 0.5 * Math.sin(currentTick * 0.007 + Math.PI / 3);
        production *= Math.max(0.3, windFactor) * cache.weatherWind;
      }
      totalProduction += production;
    }
  }

  const consumingBuildings = state.buildings.filter(
    b => { const d = BUILDING_DEFS[b.type]; return d && d.category !== 'power' && b.active; }
  );

  for (const b of consumingBuildings) {
    const def = BUILDING_DEFS[b.type];
    if (!def) continue;
    totalConsumption += def.basePowerConsumption * b.level * b.efficiency;
  }

  const energyEfficiencyReduction = cache.hasEnergyEfficiency ? 0.15 : 0;
  const powerOptimizationReduction = cache.hasPowerOptimization ? 0.10 : 0;
  totalConsumption *= (1 - energyEfficiencyReduction) * (1 - powerOptimizationReduction) * cache.eventPowerConsumption;

  totalProduction *= (1 + cache.powerBonus);

  // Compute efficiency BEFORE worker savings (matches store.ts behavior)
  const efficiency = totalProduction > 0
    ? Math.max(0.10, Math.min(1, totalProduction / Math.max(0.001, totalConsumption)))
    : 0.10;
  const overload = totalConsumption > totalProduction;

  // Worker power savings (applied AFTER efficiency)
  let workerPowerSavings = 0;
  for (const b of state.buildings) {
    if (!b.active) continue;
    const def = BUILDING_DEFS[b.type];
    if (!def || def.basePowerConsumption <= 0) continue;

    const assignedWorkers = cache.workersByBuilding.get(b.id) ?? [];
    let workerMaintenanceReduction = 0;
    for (const w of assignedWorkers) {
      const wDef = WORKER_DEFS[w.type];
      if (wDef) {
        workerMaintenanceReduction += wDef.effects.maintenance * w.level * (1 + cache.workerEfficiencyTotal);
      }
    }
    const buildingPowerReduction = Math.min(0.5, workerMaintenanceReduction);
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
): BuildResult {
  const def = BUILDING_DEFS[building.type];
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
    const wDef = WORKER_DEFS[w.type];
    if (wDef) {
      efficiency *= (1 + wDef.effects.speed * w.level * (1 + cache.workerEfficiencyTotal));
      efficiency *= (1 + wDef.effects.efficiency * w.level * (1 + cache.workerEfficiencyTotal));
      workerMaintenanceReduction += wDef.effects.maintenance * w.level * (1 + cache.workerEfficiencyTotal);
    }
  }

  const buildingPowerReduction = Math.min(0.5, workerMaintenanceReduction);
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
  return 0.9 + cache.marketBonus;
}

// ─── Payout ──────────────────────────────────────────────────────────

export function computePayout(
  state: GameState,
  cache: MultiplierCache,
): PayoutResult {
  const activeBuildings = state.buildings.filter(b => b.active);
  const extractors = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor');
  const factories = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory');
  const powerPlants = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power');

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
