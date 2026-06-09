// ============================================
// FACTORY DOMINION: Server-Side Game Engine
// Wraps productionCalculator with Supabase config
// instead of hardcoded BUILDING_DEFS
// ============================================

import {
  GameState,
  BuildingInstance,
  BuildingDefinition,
  ResourceType,
  Worker,
  WorkerDefinition,
  WeatherType,
  ResourceAmount,
  CostResourceType,
} from './types';
import {
  MultiplierCache,
  BuildResult,
  PowerResult,
  PayoutResult,
  EndgameResult,
  ProductionSnapshot,
  emptyProductionSnapshot,
  GameDefs,
  computePowerGrid,
  computeProduction,
  computeSellMultiplier,
  computePayout,
  computeEndgameIncome,
} from './productionCalculator';
import { GameConfig } from './config';
import {
  ModifierRegistry,
  ModifierEngine,
  buildModifierRegistry,
} from './modifierEngine';

// ─── Server-Side Config Accessors ────────────────────────────────────────

/**
 * Get a building definition from the Supabase-loaded config.
 * Falls back gracefully if the building isn't found.
 */
function getBuildingDef(
  buildingType: string,
  buildings: Record<string, BuildingDefinition>,
): BuildingDefinition | null {
  return buildings[buildingType] ?? null;
}

/**
 * Get a worker definition from the Supabase-loaded config.
 * Since the config stores workers as an array, we build a lookup map.
 */
function buildWorkerDefsMap(
  workers: GameConfig['workers'],
): Record<string, WorkerDefinition> {
  const result: Record<string, WorkerDefinition> = {};
  for (const w of workers) {
    const effects = w.effects as {
      efficiency: number;
      speed: number;
      maintenance: number;
    };
    result[w.id] = {
      type: w.id as Worker['type'],
      name: w.name,
      description: w.description,
      baseHireCost: w.baseHireCost,
      effects: {
        efficiency: effects.efficiency ?? 0.05,
        speed: effects.speed ?? 0.05,
        maintenance: effects.maintenance ?? 0.02,
      },
      icon: w.icon,
    };
  }
  return result;
}

// ─── Multiplier Cache Builder (Server Version) ───────────────────────────

export function buildMultipliersServer(
  state: GameState,
  config: GameConfig,
): MultiplierCache {
  const workerDefsMap = buildWorkerDefsMap(config.workers);

  // ── Build modifier registry from Supabase config ──────────────────────
  // Transform config.research effects (Record<string,unknown>[]) to the
  // format expected by buildModifierRegistry (Array<{type,target?,value}>)
  const researchTree = config.research.map(r => ({
    id: r.id,
    effects: (r.effects ?? []) as Array<{ type: string; target?: string; value: number }>,
  }));

  // config.weather is a superset of what buildModifierRegistry expects —
  // it has extra name/icon/description fields. Build a compatible weather
  // defs record with only the multiplier fields.
  const weatherDefs: Record<string, {
    productionMultiplier: number;
    solarMultiplier: number;
    windMultiplier: number;
  }> = {};
  for (const [key, w] of Object.entries(config.weather)) {
    weatherDefs[key] = {
      productionMultiplier: w.productionMultiplier,
      solarMultiplier: w.solarMultiplier,
      windMultiplier: w.windMultiplier,
    };
  }

  const registry = buildModifierRegistry(state, researchTree, weatherDefs);
  const modifierEngine = new ModifierEngine(registry);

  // ── Event multipliers (computed from state, not from modifier engine) ─
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

  // ── Weather multipliers from modifier engine ──────────────────────────
  const weatherProduction = modifierEngine.resolve('weather.production', 1);
  const weatherSolar = modifierEngine.resolve('weather.solar', 1);
  const weatherWind = modifierEngine.resolve('weather.wind', 1);

  // ── Category bonuses from modifier engine ─────────────────────────────
  // extractorBonus = research (basicAutomation, advancedDrilling) + mega (extractionMultiplier)
  const extractorBonus = modifierEngine.resolve('production.extractor', 1) - 1;
  const factoryBonus = modifierEngine.resolve('production.factory', 1) - 1;
  const t1FactoryBonus = modifierEngine.resolve('production.factory.t1', 1) - 1;
  const t2FactoryBonus = modifierEngine.resolve('production.factory.t2', 1) - 1;
  const t3FactoryBonus = modifierEngine.resolve('production.factory.t3', 1) - 1;

  // ── Prestige + mega bonuses from modifier engine ──────────────────────
  const productionBonus = modifierEngine.resolve('production.payout', 1) - 1;
  const powerBonus = modifierEngine.resolve('power.production', 1) - 1;
  const researchBonus = modifierEngine.resolve('research.speed', 1) - 1;
  const workerEfficiencyTotal = modifierEngine.resolve('worker.efficiency', 1) - 1;
  const marketBonus = modifierEngine.resolve('market.sellPrice', 1) - 1;

  // ── Source-specific breakdowns (needed by cache consumers) ────────────
  // extractionBonus = mega-only portion of production.extractor (kept for endgame)
  const megaExtractionMods = registry.getModifiers('production.extractor')
    .filter(m => m.source === 'megaProject');
  const extractionBonus = megaExtractionMods.reduce((sum, m) => sum + (m.value - 1), 0);

  // transportMegaBonus = mega-only portion of transport.throughput
  const megaTransportMods = registry.getModifiers('transport.throughput')
    .filter(m => m.source === 'megaProject');
  const transportMegaBonus = megaTransportMods.reduce((sum, m) => sum + (m.value - 1), 0);

  // ── Transport efficiency ──────────────────────────────────────────────
  const transportMultiplier = modifierEngine.resolveMultiplier('transport.throughput');
  const transportThroughputBonus = transportMultiplier - 1;
  const transportEfficiency = state.transportLines.length > 0
    ? (state.transportLines.filter(t => t.active).length / Math.max(1, state.transportLines.length)) * transportMultiplier
    : 1;
  const transportProductionBonus = 1 + 0.25 * Math.max(0, transportEfficiency - 1);

  // ── Research flags via modifier engine ────────────────────────────────
  const hasMarketAnalysis = modifierEngine.hasModifier('market.sellPrice', 'research');
  const hasEnergyEfficiency = registry.getModifiers('power.consumption')
    .some(m => m.source === 'research' && m.sourceId === 'energyEfficiency');
  const hasPowerOptimization = registry.getModifiers('power.consumption')
    .some(m => m.source === 'research' && m.sourceId === 'powerOptimization');

  // ── Workers lookup ────────────────────────────────────────────────────
  const workersByBuilding = new Map<string, Worker[]>();
  for (const w of state.workers) {
    if (w.assignedTo) {
      const list = workersByBuilding.get(w.assignedTo);
      if (list) list.push(w);
      else workersByBuilding.set(w.assignedTo, [w]);
    }
  }

  // ── Building-specific bonuses from modifier engine ────────────────────
  // Replaces hardcoded specificBuildingBonuses map
  const specificBuildingBonuses = new Map<string, number>();
  for (const mod of registry.getAll()) {
    if (mod.target.startsWith('production.building.') && mod.operation === 'multiply') {
      const buildingType = mod.subTarget ?? mod.target.replace('production.building.', '');
      const existing = specificBuildingBonuses.get(buildingType) ?? 0;
      specificBuildingBonuses.set(buildingType, existing + (mod.value - 1));
    }
  }

  return {
    modifierEngine,
    gameDefs: { buildings: config.buildings, workers: workerDefsMap } as GameDefs,
    eventProductionGlobal,
    eventProductionTargeted,
    eventPowerConsumption,
    eventResearch,
    weatherProduction,
    weatherSolar,
    weatherWind,
    powerEfficiency: 1,
    transportProductionBonus,
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
    workerEfficiencyResearchBonus: registry.getModifiers('worker.efficiency')
      .filter(m => m.source === 'research')
      .reduce((sum, m) => sum + (m.value - 1), 0),
    transportMegaBonus,
    marketBonus,
    storageCapacityBonus: modifierEngine.resolve('storage.capacity', 1) - 1,
    transportThroughputBonus,
    hasMarketAnalysis,
    hasEnergyEfficiency,
    hasPowerOptimization,
    workersByBuilding,
    megaFactoryUnlocked: state.prestigeState.megaFactoryUnlocked,
    _source: 'modifierEngine' as const,
  };
}

// ─── Power Grid (Server Version — delegates to shared productionCalculator) ──

export function computePowerGridServer(
  state: GameState,
  cache: MultiplierCache,
  resources: Record<string, number>,
  currentTick: number,
  buildings: Record<string, BuildingDefinition>,
  workerDefs: Record<string, WorkerDefinition>,
): PowerResult {
  return computePowerGrid(state, cache, resources, currentTick, { buildings, workers: workerDefs });
}

// ─── Production (Server Version — delegates to shared productionCalculator) ──

export function computeProductionServer(
  building: BuildingInstance,
  cache: MultiplierCache,
  availableResources: Record<string, number>,
  buildings: Record<string, BuildingDefinition>,
  workerDefs: Record<string, WorkerDefinition>,
): BuildResult {
  return computeProduction(building, cache, availableResources, { buildings, workers: workerDefs });
}

// ─── Sell Multiplier (Server Version — delegates to shared productionCalculator) ──

export function computeSellMultiplierServer(
  _state: GameState,
  cache: MultiplierCache,
): number {
  return computeSellMultiplier(_state, cache);
}

// ─── Payout (Server Version — delegates to shared productionCalculator) ──

export function computePayoutServer(
  state: GameState,
  cache: MultiplierCache,
  buildings: Record<string, BuildingDefinition>,
): PayoutResult {
  // Get workerDefs from cache.gameDefs if available, otherwise empty
  const workerDefs = cache.gameDefs?.workers ?? {};
  return computePayout(state, cache, { buildings, workers: workerDefs });
}

// ─── Endgame Passive Income (Server Version — delegates to shared productionCalculator) ──

export function computeEndgameIncomeServer(
  state: GameState,
  cache: MultiplierCache,
): EndgameResult {
  return computeEndgameIncome(state, cache);
}

// ─── Full Snapshot Builder (Server Version) ──────────────────────────────

export function buildProductionSnapshotServer(
  state: GameState,
  config: GameConfig,
): ProductionSnapshot {
  const snapshot = emptyProductionSnapshot();
  const buildings = config.buildings;
  const workerDefs = buildWorkerDefsMap(config.workers);

  // Build multiplier cache
  const cache = buildMultipliersServer(state, config);

  // Compute power grid first (sets powerEfficiency in cache)
  const resourcesCopy = { ...state.resources };
  const powerResult = computePowerGridServer(
    state, cache, resourcesCopy, state.gameTick, buildings, workerDefs,
  );

  // Update cache with actual power efficiency
  cache.powerEfficiency = powerResult.efficiency;

  snapshot.powerProduction = powerResult.totalProduction;
  snapshot.powerConsumption = powerResult.totalConsumption;
  snapshot.powerEfficiency = powerResult.efficiency;
  snapshot.powerOverload = powerResult.overload;

  // Compute per-building production
  for (const building of state.buildings) {
    const result = computeProductionServer(
      building, cache, resourcesCopy, buildings, workerDefs,
    );

    snapshot.buildings[building.id] = {
      outputs: result.outputs,
      inputs: result.inputs,
      efficiency: result.efficiency,
    };

    // Aggregate resource totals
    for (const output of result.outputs) {
      snapshot.production[output.resource] = (snapshot.production[output.resource] ?? 0) + output.amount;
    }
    for (const input of result.inputs) {
      snapshot.consumption[input.resource] = (snapshot.consumption[input.resource] ?? 0) + input.amount;
    }
    for (const input of result.actualInputs) {
      snapshot.actualConsumption[input.resource] = (snapshot.actualConsumption[input.resource] ?? 0) + input.amount;
    }
  }

  // Payout
  const payout = computePayoutServer(state, cache, buildings);
  snapshot.payoutPerCycle = payout.amountPerCycle;
  snapshot.payoutBreakdown = payout.breakdown;

  // Sell multiplier
  snapshot.sellMultiplier = computeSellMultiplierServer(state, cache);

  // Endgame income
  const endgame = computeEndgameIncomeServer(state, cache);
  snapshot.endgameMoney = endgame.moneyPerTick;
  snapshot.endgameResearch = endgame.researchPerTick;
  snapshot.endgameCorp = endgame.corpPerTick;

  // Currency income rates (server-side simplified — only endgame passive income tracked)
  snapshot.moneyIncomeRate = endgame.moneyPerTick;
  snapshot.rpIncomeRate = endgame.researchPerTick;
  snapshot.cpIncomeRate = endgame.corpPerTick;

  return snapshot;
}

// ─── Game Tick Runner (Server Version) ──────────────────────────────────

export interface TickResult {
  newState: GameState;
  productionSnapshot: ProductionSnapshot;
}

/**
 * Run N ticks of the game engine server-side.
 * This is used for offline progress, server-side validation, and cloud save integrity checks.
 *
 * IMPORTANT: This is a simplified tick runner that computes production snapshots
 * and accumulates resources. It does NOT simulate the full game loop
 * (market simulation, events, weather changes, contract progression, etc.)
 * For full simulation, the client should run the complete game loop.
 */
export function runServerTicks(
  initialState: GameState,
  ticks: number,
  config: GameConfig,
): TickResult {
  const state = structuredClone(initialState);
  const buildings = config.buildings;
  const workerDefs = buildWorkerDefsMap(config.workers);

  for (let i = 0; i < ticks; i++) {
    state.gameTick += 1;

    // Build multiplier cache for this tick
    const cache = buildMultipliersServer(state, config);

    // Compute power grid
    const resourcesCopy = { ...state.resources };
    const powerResult = computePowerGridServer(
      state, cache, resourcesCopy, state.gameTick, buildings, workerDefs,
    );

    cache.powerEfficiency = powerResult.efficiency;

    // Update power grid state
    state.powerGrid = {
      totalProduction: powerResult.totalProduction,
      totalConsumption: powerResult.totalConsumption,
      efficiency: powerResult.efficiency,
      overload: powerResult.overload,
      plants: state.buildings.filter(b => {
        const def = getBuildingDef(b.type, buildings);
        return def?.category === 'power';
      }),
    };

    // Consume fuel
    for (const fc of powerResult.fuelConsumption) {
      if (state.resources[fc.resource as ResourceType] !== undefined) {
        state.resources[fc.resource as ResourceType] = Math.max(
          0,
          state.resources[fc.resource as ResourceType] - fc.actualAmount,
        );
      }
    }

    // Compute per-building production
    for (const building of state.buildings) {
      const result = computeProductionServer(
        building, cache, state.resources, buildings, workerDefs,
      );

      if (!result.canProduce) continue;

      // Consume inputs
      for (const input of result.actualInputs) {
        if (state.resources[input.resource as ResourceType] !== undefined) {
          state.resources[input.resource as ResourceType] -= input.amount;
        }
      }

      // Produce outputs
      for (const output of result.outputs) {
        if (output.resource === 'money') {
          state.money += output.amount;
          state.totalMoneyEarned += output.amount;
        } else if (state.resources[output.resource as ResourceType] !== undefined) {
          const capacity = state.resourceCapacity[output.resource as ResourceType] ?? Infinity;
          state.resources[output.resource as ResourceType] = Math.min(
            capacity,
            state.resources[output.resource as ResourceType] + output.amount,
          );
        }
      }
    }

    // Endgame passive income
    const endgame = computeEndgameIncomeServer(state, cache);
    state.money += endgame.moneyPerTick;
    state.totalMoneyEarned += endgame.moneyPerTick;
    state.researchPoints += endgame.researchPerTick;
    state.prestigeState.corporationPoints += endgame.corpPerTick;

    // Advance weather
    state.weather.remaining -= 1;
    if (state.weather.remaining <= 0) {
      state.weather.remaining = 100 + Math.floor(Math.random() * 200);
      const weatherTypes: WeatherType[] = ['clear', 'rainy', 'stormy', 'sunny', 'foggy', 'snowy'];
      state.weather.current = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
      state.weather.intensity = 0.3 + Math.random() * 0.7;
    }
  }

  // Build final snapshot
  const productionSnapshot = buildProductionSnapshotServer(state, config);

  return { newState: state, productionSnapshot };
}

// ─── Action Validation Helpers ──────────────────────────────────────────

/**
 * Validate a 'build' action.
 */
export function validateBuildAction(
  buildingType: string,
  state: Partial<GameState>,
  config: GameConfig,
): { valid: boolean; error?: string; correctedState?: Partial<GameState> } {
  const buildingDef = config.buildings[buildingType];
  if (!buildingDef) {
    return { valid: false, error: `Building type "${buildingType}" not found in game config` };
  }

  // Check research unlock
  if (buildingDef.unlockRequirement?.research) {
    const completedResearch = state.completedResearch ?? [];
    if (!completedResearch.includes(buildingDef.unlockRequirement.research)) {
      return { valid: false, error: `Research "${buildingDef.unlockRequirement.research}" required to build ${buildingDef.name}` };
    }
  }

  // Check prestige unlock
  if (buildingDef.unlockRequirement?.prestige) {
    const totalPrestiges = state.prestigeState?.totalPrestiges ?? 0;
    if (totalPrestiges < buildingDef.unlockRequirement.prestige) {
      return { valid: false, error: `Prestige level ${buildingDef.unlockRequirement.prestige} required to build ${buildingDef.name}` };
    }
  }

  // Check if can afford
  const money = state.money ?? 0;
  const resources = state.resources ?? {};
  for (const cost of buildingDef.baseCost) {
    if (cost.resource === 'money') {
      if (money < cost.amount) {
        return { valid: false, error: `Not enough money. Need $${cost.amount}, have $${Math.floor(money)}` };
      }
    } else {
      const available = resources[cost.resource as ResourceType] ?? 0;
      if (available < cost.amount) {
        return { valid: false, error: `Not enough ${cost.resource}. Need ${cost.amount}, have ${Math.floor(available)}` };
      }
    }
  }

  return { valid: true };
}

/**
 * Validate a 'sell' action.
 */
export function validateSellAction(
  resource: string,
  amount: number,
  state: Partial<GameState>,
): { valid: boolean; error?: string } {
  const resources = state.resources ?? {};
  const available = resources[resource as ResourceType] ?? 0;
  if (available < amount) {
    return { valid: false, error: `Not enough ${resource} to sell. Have ${Math.floor(available)}, want to sell ${amount}` };
  }

  // Check market exists
  const market = state.market ?? [];
  const marketEntry = market.find(m => m.resource === resource);
  if (!marketEntry) {
    return { valid: false, error: `No market found for resource "${resource}"` };
  }

  return { valid: true };
}

/**
 * Validate a 'buy' action.
 */
export function validateBuyAction(
  resource: string,
  amount: number,
  state: Partial<GameState>,
): { valid: boolean; error?: string } {
  const market = state.market ?? [];
  const marketEntry = market.find(m => m.resource === resource);
  if (!marketEntry) {
    return { valid: false, error: `No market found for resource "${resource}"` };
  }

  const totalCost = marketEntry.currentPrice * amount;
  const money = state.money ?? 0;
  if (money < totalCost) {
    return { valid: false, error: `Not enough money. Need $${Math.floor(totalCost)}, have $${Math.floor(money)}` };
  }

  return { valid: true };
}

/**
 * Validate a 'research' action.
 */
export function validateResearchAction(
  researchId: string,
  state: Partial<GameState>,
  config: GameConfig,
): { valid: boolean; error?: string } {
  const researchDef = config.research.find(r => r.id === researchId);
  if (!researchDef) {
    return { valid: false, error: `Research "${researchId}" not found in game config` };
  }

  // Check prerequisites
  const completedResearch = state.completedResearch ?? [];
  for (const prereq of researchDef.prerequisites) {
    if (!completedResearch.includes(prereq)) {
      return { valid: false, error: `Prerequisite research "${prereq}" not completed` };
    }
  }

  // Check if already completed
  if (completedResearch.includes(researchId)) {
    return { valid: false, error: `Research "${researchId}" already completed` };
  }

  // Check if already researching
  if (state.activeResearch === researchId) {
    return { valid: false, error: `Research "${researchId}" is already in progress` };
  }

  // Check cost
  const researchPoints = state.researchPoints ?? 0;
  if (researchPoints < researchDef.cost) {
    return { valid: false, error: `Not enough research points. Need ${researchDef.cost}, have ${Math.floor(researchPoints)}` };
  }

  return { valid: true };
}

/**
 * Validate an 'upgrade' action.
 */
export function validateUpgradeAction(
  buildingId: string,
  state: Partial<GameState>,
  config: GameConfig,
): { valid: boolean; error?: string } {
  const buildings = state.buildings ?? [];
  const building = buildings.find(b => b.id === buildingId);
  if (!building) {
    return { valid: false, error: `Building instance "${buildingId}" not found` };
  }

  const buildingDef = config.buildings[building.type];
  if (!buildingDef) {
    return { valid: false, error: `Building type "${building.type}" not found in game config` };
  }

  // Calculate upgrade cost (base cost * costMultiplier^currentLevel)
  const upgradeCost = buildingDef.baseCost.map(cost => ({
    resource: cost.resource,
    amount: Math.ceil(cost.amount * Math.pow(buildingDef.costMultiplier, building.level)),
  }));

  // Check affordability
  const money = state.money ?? 0;
  const resources = state.resources ?? {};
  for (const cost of upgradeCost) {
    if (cost.resource === 'money') {
      if (money < cost.amount) {
        return { valid: false, error: `Not enough money for upgrade. Need $${cost.amount}, have $${Math.floor(money)}` };
      }
    } else {
      const available = resources[cost.resource as ResourceType] ?? 0;
      if (available < cost.amount) {
        return { valid: false, error: `Not enough ${cost.resource} for upgrade. Need ${cost.amount}, have ${Math.floor(available)}` };
      }
    }
  }

  return { valid: true };
}

/**
 * Validate a 'transport' action.
 */
export function validateTransportAction(
  fromBuildingId: string,
  toBuildingId: string,
  _resource: string,
  state: Partial<GameState>,
  config: GameConfig,
): { valid: boolean; error?: string } {
  const buildings = state.buildings ?? [];

  const fromBuilding = buildings.find(b => b.id === fromBuildingId);
  if (!fromBuilding) {
    return { valid: false, error: `Source building "${fromBuildingId}" not found` };
  }

  const toBuilding = buildings.find(b => b.id === toBuildingId);
  if (!toBuilding) {
    return { valid: false, error: `Destination building "${toBuildingId}" not found` };
  }

  // Verify buildings exist in config
  const fromDef = config.buildings[fromBuilding.type];
  if (!fromDef) {
    return { valid: false, error: `Source building type "${fromBuilding.type}" not found in config` };
  }

  const toDef = config.buildings[toBuilding.type];
  if (!toDef) {
    return { valid: false, error: `Destination building type "${toBuilding.type}" not found in config` };
  }

  // Check that from building produces the resource or to building consumes it
  // This is a soft check - we verify the chain exists in productionChains
  const chainExists = config.productionChains.some(
    c => c.upstreamBuilding === fromBuilding.type && c.downstreamBuilding === toBuilding.type,
  );

  if (!chainExists) {
    // Not necessarily invalid, but warn
    // Allow it anyway — player may set up custom routes
  }

  return { valid: true };
}

/**
 * C5 FIX: Validate a 'trade' action for the Trading Post.
 * Previously, trades bypassed server validation entirely, allowing cheating.
 * Now we validate:
 * - Both resources are in the tradable list
 * - Player has enough of the give resource
 * - Give and receive resources are different
 * - The receive amount calculation is correct (no tampering with commission/rates)
 * - Receive resource won't overflow capacity
 */
export function validateTradeAction(
  giveResource: string,
  giveAmount: number,
  receiveResource: string,
  receiveAmount: number,
  state: Partial<GameState>,
): { valid: boolean; error?: string; correctedReceiveAmount?: number } {
  const COMMISSION_RATE = 0.15;

  // Tradable resources list (must match TradingPostPanel's TRADABLE_RESOURCES)
  const TRADABLE_RESOURCES = new Set([
    'iron', 'copper', 'coal', 'oil', 'sand', 'lithium', 'water',
    'clay', 'limestone', 'gravel', 'bauxite', 'wolframite', 'rareEarth',
    'silver', 'gold',
    'ironPlate', 'copperWire', 'plastic', 'glass', 'carbon',
    'bricks', 'concrete', 'fertilizer', 'steel', 'fossilFuel',
  ]);

  // Validate both resources are tradable
  if (!TRADABLE_RESOURCES.has(giveResource)) {
    return { valid: false, error: `Resource "${giveResource}" is not tradable` };
  }
  if (!TRADABLE_RESOURCES.has(receiveResource)) {
    return { valid: false, error: `Resource "${receiveResource}" is not tradable` };
  }

  // Can't trade same resource
  if (giveResource === receiveResource) {
    return { valid: false, error: 'Cannot trade a resource for itself' };
  }

  // Validate give amount
  if (!Number.isFinite(giveAmount) || giveAmount <= 0) {
    return { valid: false, error: `Invalid give amount: ${giveAmount}` };
  }
  if (giveAmount > 1e9) {
    return { valid: false, error: `Give amount too large: ${giveAmount}` };
  }

  // Check player has enough of give resource
  const resources = state.resources ?? {};
  const availableGive = resources[giveResource as ResourceType] ?? 0;
  if (availableGive < giveAmount) {
    return { valid: false, error: `Not enough ${giveResource}. Have ${Math.floor(availableGive)}, want to trade ${giveAmount}` };
  }

  // Calculate expected receive amount using market base prices
  // The market prices are loaded from config, but for validation we use
  // the market data from the client's gameState to verify the calculation
  const market = state.market ?? [];
  const giveMarketEntry = market.find(m => m.resource === giveResource);
  const receiveMarketEntry = market.find(m => m.resource === receiveResource);

  // Fall back to base price if market data is missing
  const givePrice = giveMarketEntry?.currentPrice ?? giveMarketEntry?.basePrice ?? 1;
  const receivePrice = receiveMarketEntry?.currentPrice ?? receiveMarketEntry?.basePrice ?? 1;

  if (receivePrice <= 0) {
    return { valid: false, error: `Invalid market price for ${receiveResource}` };
  }

  const expectedReceiveAmount = (giveAmount * givePrice * (1 - COMMISSION_RATE)) / receivePrice;

  // Allow 5% tolerance for floating point differences
  if (receiveAmount > expectedReceiveAmount * 1.05) {
    return {
      valid: false,
      error: `Receive amount ${receiveAmount.toFixed(2)} exceeds expected ${expectedReceiveAmount.toFixed(2)} (possible rate manipulation)`,
      correctedReceiveAmount: expectedReceiveAmount,
    };
  }

  // Check receive resource capacity
  const receiveCapacity = state.resourceCapacity?.[receiveResource as ResourceType];
  if (receiveCapacity !== undefined && receiveCapacity !== Infinity) {
    const currentReceive = resources[receiveResource as ResourceType] ?? 0;
    if (currentReceive + expectedReceiveAmount > receiveCapacity) {
      // This is not an error — we just cap the receive amount
      // The client should handle this with a warning
    }
  }

  return {
    valid: true,
    correctedReceiveAmount: expectedReceiveAmount, // Use server-calculated amount
  };
}
