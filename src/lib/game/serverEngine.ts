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
  WorkerType,
  WeatherType,
  ResourceAmount,
  CostResourceType,
} from "./types";
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
} from "./productionCalculator";
import { GameConfig } from "./config";
import { getBalance } from "./balanceConfig";
import {
  ModifierRegistry,
  ModifierEngine,
  buildModifierRegistry,
} from "./modifierEngine";

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
  workers: GameConfig["workers"],
): Record<string, WorkerDefinition> {
  const result: Record<string, WorkerDefinition> = {};
  for (const w of workers) {
    const effects = w.effects as {
      efficiency: number;
      speed: number;
      maintenance: number;
    };
    result[w.id] = {
      type: w.id as Worker["type"],
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
  const researchTree = config.research.map((r) => ({
    id: r.id,
    effects: (r.effects ?? []) as Array<{
      type: string;
      target?: string;
      value: number;
    }>,
  }));

  // config.weather is a superset of what buildModifierRegistry expects —
  // it has extra name/icon/description fields. Build a compatible weather
  // defs record with only the multiplier fields.
  const weatherDefs: Record<
    string,
    {
      productionMultiplier: number;
      solarMultiplier: number;
      windMultiplier: number;
    }
  > = {};
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
      if (effect.type === "productionMultiplier") {
        if (effect.target) {
          const existing = eventProductionTargeted.get(effect.target) ?? 1;
          eventProductionTargeted.set(effect.target, existing * effect.value);
        } else {
          eventProductionGlobal *= effect.value;
        }
      }
      if (effect.type === "researchSpeed") eventResearch *= effect.value;
      if (effect.type === "powerMultiplier")
        eventPowerConsumption *= effect.value;
    }
  }

  // ── Weather multipliers from modifier engine ──────────────────────────
  const weatherProduction = modifierEngine.resolve("weather.production", 1);
  const weatherSolar = modifierEngine.resolve("weather.solar", 1);
  const weatherWind = modifierEngine.resolve("weather.wind", 1);

  // ── Category bonuses from modifier engine ─────────────────────────────
  // extractorBonus = research (basicAutomation, advancedDrilling) + mega (extractionMultiplier)
  const extractorBonus = modifierEngine.resolve("production.extractor", 1) - 1;
  const factoryBonus = modifierEngine.resolve("production.factory", 1) - 1;
  const t1FactoryBonus = modifierEngine.resolve("production.factory.t1", 1) - 1;
  const t2FactoryBonus = modifierEngine.resolve("production.factory.t2", 1) - 1;
  const t3FactoryBonus = modifierEngine.resolve("production.factory.t3", 1) - 1;

  // ── Prestige + mega bonuses from modifier engine ──────────────────────
  const productionBonus = modifierEngine.resolve("production.payout", 1) - 1;
  const powerBonus = modifierEngine.resolve("power.production", 1) - 1;
  const researchBonus = modifierEngine.resolve("research.speed", 1) - 1;
  const workerEfficiencyTotal =
    modifierEngine.resolve("worker.efficiency", 1) - 1;
  const marketBonus = modifierEngine.resolve("market.sellPrice", 1) - 1;

  // ── Source-specific breakdowns (needed by cache consumers) ────────────
  // extractionBonus = mega-only portion of production.extractor (kept for endgame)
  const megaExtractionMods = registry
    .getModifiers("production.extractor")
    .filter((m) => m.source === "megaProject");
  const extractionBonus = megaExtractionMods.reduce(
    (sum, m) => sum + (m.value - 1),
    0,
  );

  // transportMegaBonus = mega-only portion of transport.throughput
  const megaTransportMods = registry
    .getModifiers("transport.throughput")
    .filter((m) => m.source === "megaProject");
  const transportMegaBonus = megaTransportMods.reduce(
    (sum, m) => sum + (m.value - 1),
    0,
  );

  // ── Transport efficiency ──────────────────────────────────────────────
  const transportMultiplier = modifierEngine.resolveMultiplier(
    "transport.throughput",
  );
  const transportThroughputBonus = transportMultiplier - 1;
  const transportEfficiency =
    state.transportLines.length > 0
      ? (state.transportLines.filter((t) => t.active).length /
          Math.max(1, state.transportLines.length)) *
        transportMultiplier
      : 1;
  const transportProductionBonus =
    1 + 0.25 * Math.max(0, transportEfficiency - 1);

  // ── Research flags via modifier engine ────────────────────────────────
  const hasMarketAnalysis = modifierEngine.hasModifier(
    "market.sellPrice",
    "research",
  );
  const hasEnergyEfficiency = registry
    .getModifiers("power.consumption")
    .some((m) => m.source === "research" && m.sourceId === "energyEfficiency");
  const hasPowerOptimization = registry
    .getModifiers("power.consumption")
    .some((m) => m.source === "research" && m.sourceId === "powerOptimization");

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
    if (
      mod.target.startsWith("production.building.") &&
      mod.operation === "multiply"
    ) {
      const buildingType =
        mod.subTarget ?? mod.target.replace("production.building.", "");
      const existing = specificBuildingBonuses.get(buildingType) ?? 0;
      specificBuildingBonuses.set(buildingType, existing + (mod.value - 1));
    }
  }

  return {
    modifierEngine,
    gameDefs: {
      buildings: config.buildings,
      workers: workerDefsMap,
    } as GameDefs,
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
    workerEfficiencyResearchBonus: registry
      .getModifiers("worker.efficiency")
      .filter((m) => m.source === "research")
      .reduce((sum, m) => sum + (m.value - 1), 0),
    transportMegaBonus,
    marketBonus,
    storageCapacityBonus: modifierEngine.resolve("storage.capacity", 1) - 1,
    transportThroughputBonus,
    hasMarketAnalysis,
    hasEnergyEfficiency,
    hasPowerOptimization,
    workersByBuilding,
    megaFactoryUnlocked: state.prestigeState.megaFactoryUnlocked,
    _source: "modifierEngine" as const,
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
  return computePowerGrid(state, cache, resources, currentTick, {
    buildings,
    workers: workerDefs,
  });
}

// ─── Production (Server Version — delegates to shared productionCalculator) ──

export function computeProductionServer(
  building: BuildingInstance,
  cache: MultiplierCache,
  availableResources: Record<string, number>,
  buildings: Record<string, BuildingDefinition>,
  workerDefs: Record<string, WorkerDefinition>,
): BuildResult {
  return computeProduction(building, cache, availableResources, {
    buildings,
    workers: workerDefs,
  });
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
    state,
    cache,
    resourcesCopy,
    state.gameTick,
    buildings,
    workerDefs,
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
      building,
      cache,
      resourcesCopy,
      buildings,
      workerDefs,
    );

    snapshot.buildings[building.id] = {
      outputs: result.outputs,
      inputs: result.inputs,
      efficiency: result.efficiency,
    };

    // Aggregate resource totals
    for (const output of result.outputs) {
      snapshot.production[output.resource] =
        (snapshot.production[output.resource] ?? 0) + output.amount;
    }
    for (const input of result.inputs) {
      snapshot.consumption[input.resource] =
        (snapshot.consumption[input.resource] ?? 0) + input.amount;
    }
    for (const input of result.actualInputs) {
      snapshot.actualConsumption[input.resource] =
        (snapshot.actualConsumption[input.resource] ?? 0) + input.amount;
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
      state,
      cache,
      resourcesCopy,
      state.gameTick,
      buildings,
      workerDefs,
    );

    cache.powerEfficiency = powerResult.efficiency;

    // Update power grid state
    state.powerGrid = {
      totalProduction: powerResult.totalProduction,
      totalConsumption: powerResult.totalConsumption,
      efficiency: powerResult.efficiency,
      overload: powerResult.overload,
      plants: state.buildings.filter((b) => {
        const def = getBuildingDef(b.type, buildings);
        return def?.category === "power";
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
        building,
        cache,
        state.resources,
        buildings,
        workerDefs,
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
        if (output.resource === "money") {
          state.money += output.amount;
          state.totalMoneyEarned += output.amount;
        } else if (
          state.resources[output.resource as ResourceType] !== undefined
        ) {
          const capacity =
            state.resourceCapacity[output.resource as ResourceType] ?? Infinity;
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
      const weatherTypes: WeatherType[] = [
        "clear",
        "rainy",
        "stormy",
        "sunny",
        "foggy",
        "snowy",
      ];
      state.weather.current =
        weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
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
 *
 * Server-authoritative: this returns the **authoritative post-action state**
 * in `correctedState` so the client can apply exactly what the server computes
 * (cost, deduction, new building). The previous design only checked affordability
 * but left cost calculation to the client — if client and server disagreed on
 * cost (e.g., race condition, scaled cost formula mismatch), the client's local
 * money deduction would diverge from the server's persisted value.
 */
export function validateBuildAction(
  buildingType: string,
  state: Partial<GameState>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  const buildingDef = config.buildings[buildingType];
  if (!buildingDef) {
    return {
      valid: false,
      error: `Building type "${buildingType}" not found in game config`,
    };
  }

  // Check research unlock
  if (buildingDef.unlockRequirement?.research) {
    const completedResearch = state.completedResearch ?? [];
    if (!completedResearch.includes(buildingDef.unlockRequirement.research)) {
      return {
        valid: false,
        error: `Research "${buildingDef.unlockRequirement.research}" required to build ${buildingDef.name}`,
      };
    }
  }

  // Check prestige unlock
  if (buildingDef.unlockRequirement?.prestige) {
    const totalPrestiges = state.prestigeState?.totalPrestiges ?? 0;
    if (totalPrestiges < buildingDef.unlockRequirement.prestige) {
      return {
        valid: false,
        error: `Prestige level ${buildingDef.unlockRequirement.prestige} required to build ${buildingDef.name}`,
      };
    }
  }

  // Compute authoritative scaled cost (base * costMultiplier ^ currentCount).
  // The mega-project cost reduction is also applied server-side so the
  // server-returned state is fully consistent.
  const existingBuildings = (state.buildings ?? []).filter(
    (b) => b.type === buildingType,
  );
  const currentCount = existingBuildings.length;

  const megaBuildingCostReduction =
    state.megaProjects?.find(
      (p) => p.completed && p.bonus?.type === "buildingCostReduction",
    )?.bonus?.value ?? 0;

  const scaledCosts = buildingDef.baseCost.map((c) => {
    if (c.resource === "money") {
      const scaled = Math.floor(
        c.amount * Math.pow(buildingDef.costMultiplier, currentCount),
      );
      return {
        resource: c.resource,
        amount: Math.max(
          1,
          Math.floor(scaled * (1 - megaBuildingCostReduction)),
        ),
      };
    }
    return {
      resource: c.resource,
      amount: Math.ceil(
        c.amount * Math.pow(buildingDef.costMultiplier, currentCount),
      ),
    };
  });

  // Affordability check uses the scaled cost (not base cost).
  const money = state.money ?? 0;
  const resources = state.resources ?? {};
  for (const cost of scaledCosts) {
    if (cost.resource === "money") {
      if (money < cost.amount) {
        return {
          valid: false,
          error: `Not enough money. Need $${cost.amount}, have $${Math.floor(money)}`,
        };
      }
    } else {
      const available = resources[cost.resource as ResourceType] ?? 0;
      if (available < cost.amount) {
        return {
          valid: false,
          error: `Not enough ${cost.resource}. Need ${cost.amount}, have ${Math.floor(available)}`,
        };
      }
    }
  }

  // Authoritative post-action state. Caller (route handler) is responsible for
  // persisting this to server_game_state and returning `correctedState` to the
  // client.
  const newBuilding = {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `bld_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    type: buildingType,
    level: 1,
    active: true,
    efficiency: 1,
    placedAt: Number(state.gameTick) || 0,
  } as const;

  const nextBuildings = [...(state.buildings ?? []), newBuilding];

  // Deduct the scaled costs from money/resources.
  const nextMoney =
    money - (scaledCosts.find((c) => c.resource === "money")?.amount ?? 0);
  const nextResources = { ...(resources ?? {}) };
  for (const c of scaledCosts) {
    if (c.resource !== "money") {
      const current = nextResources[c.resource as ResourceType] ?? 0;
      nextResources[c.resource as ResourceType] = current - c.amount;
    }
  }

  return {
    valid: true,
    correctedState: {
      buildings: nextBuildings as unknown as BuildingInstance[],
      money: nextMoney,
      resources: nextResources as unknown as Record<ResourceType, number>,
      // totalMoneyEarned is NOT changed by a build action — building costs are
      // expenses, not earnings.
    },
  };
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
    return {
      valid: false,
      error: `Not enough ${resource} to sell. Have ${Math.floor(available)}, want to sell ${amount}`,
    };
  }

  // Check market exists
  const market = state.market ?? [];
  const marketEntry = market.find((m) => m.resource === resource);
  if (!marketEntry) {
    return {
      valid: false,
      error: `No market found for resource "${resource}"`,
    };
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
  const marketEntry = market.find((m) => m.resource === resource);
  if (!marketEntry) {
    return {
      valid: false,
      error: `No market found for resource "${resource}"`,
    };
  }

  const totalCost = marketEntry.currentPrice * amount;
  const money = state.money ?? 0;
  if (money < totalCost) {
    return {
      valid: false,
      error: `Not enough money. Need $${Math.floor(totalCost)}, have $${Math.floor(money)}`,
    };
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
  const researchDef = config.research.find((r) => r.id === researchId);
  if (!researchDef) {
    return {
      valid: false,
      error: `Research "${researchId}" not found in game config`,
    };
  }

  // Check prerequisites
  const completedResearch = state.completedResearch ?? [];
  for (const prereq of researchDef.prerequisites) {
    if (!completedResearch.includes(prereq)) {
      return {
        valid: false,
        error: `Prerequisite research "${prereq}" not completed`,
      };
    }
  }

  // Check if already completed
  if (completedResearch.includes(researchId)) {
    return {
      valid: false,
      error: `Research "${researchId}" already completed`,
    };
  }

  // Check if already researching
  if (state.activeResearch === researchId) {
    return {
      valid: false,
      error: `Research "${researchId}" is already in progress`,
    };
  }

  // Check cost
  const researchPoints = state.researchPoints ?? 0;
  if (researchPoints < researchDef.cost) {
    return {
      valid: false,
      error: `Not enough research points. Need ${researchDef.cost}, have ${Math.floor(researchPoints)}`,
    };
  }

  return { valid: true };
}

/**
 * Validate an 'upgrade' action.
 *
 * Server-authoritative: returns the post-upgrade state in `correctedState`
 * so the client can apply exactly what the server computes (scaled cost,
 * mega-project bonus, level +1, efficiency gain, money/resources deducted).
 * The previous design only checked affordability but left state mutation
 * to the client — if the cost formula or mega-bonus differed between the
 * two sides, the client's local money deduction diverged from the server's
 * persisted value.
 */
export function validateUpgradeAction(
  buildingId: string,
  state: Partial<GameState>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  const buildings = state.buildings ?? [];
  const buildingIdx = buildings.findIndex((b) => b.id === buildingId);
  if (buildingIdx < 0) {
    return {
      valid: false,
      error: `Building instance "${buildingId}" not found`,
    };
  }
  const building = buildings[buildingIdx];

  const buildingDef = config.buildings[building.type];
  if (!buildingDef) {
    return {
      valid: false,
      error: `Building type "${building.type}" not found in game config`,
    };
  }

  // Compute authoritative scaled cost. Scaled by `building.level` (not
  // currentCount like build), and includes mega-project cost reduction.
  const megaBuildingCostReduction =
    state.megaProjects?.find(
      (p) => p.completed && p.bonus?.type === "buildingCostReduction",
    )?.bonus?.value ?? 0;

  const upgradeCost = buildingDef.baseCost.map((c) => {
    if (c.resource === "money") {
      const scaled = Math.floor(
        c.amount * Math.pow(buildingDef.costMultiplier, building.level),
      );
      return {
        resource: c.resource,
        amount: Math.max(
          1,
          Math.floor(scaled * (1 - megaBuildingCostReduction)),
        ),
      };
    }
    return {
      resource: c.resource,
      amount: Math.ceil(
        c.amount * Math.pow(buildingDef.costMultiplier, building.level),
      ),
    };
  });

  // Check affordability (use SCALED cost, not base)
  const money = state.money ?? 0;
  const resources = state.resources ?? {};
  for (const cost of upgradeCost) {
    if (cost.resource === "money") {
      if (money < cost.amount) {
        return {
          valid: false,
          error: `Not enough money for upgrade. Need $${cost.amount}, have $${Math.floor(money)}`,
        };
      }
    } else {
      const available = resources[cost.resource as ResourceType] ?? 0;
      if (available < cost.amount) {
        return {
          valid: false,
          error: `Not enough ${cost.resource} for upgrade. Need ${cost.amount}, have ${Math.floor(available)}`,
        };
      }
    }
  }

  // Authoritative post-upgrade state.
  const upgradedBuilding = {
    ...building,
    level: building.level + 1,
    efficiency: Math.min(2, building.efficiency + 0.1), // +0.1 per upgrade, capped at 2.0
  };
  const nextBuildings = buildings.map((b, i) =>
    i === buildingIdx ? upgradedBuilding : b,
  );

  const nextMoney =
    money - (upgradeCost.find((c) => c.resource === "money")?.amount ?? 0);
  const nextResources: Record<string, number> = { ...resources };
  for (const c of upgradeCost) {
    if (c.resource !== "money") {
      const current = nextResources[c.resource as ResourceType] ?? 0;
      nextResources[c.resource as ResourceType] = current - c.amount;
    }
  }

  return {
    valid: true,
    correctedState: {
      buildings: nextBuildings,
      money: nextMoney,
      resources: nextResources,
      // totalMoneyEarned unchanged: upgrades are expenses, not earnings.
    },
  };
}

/**
 * Validate a 'toggle_building' action.
 *
 * Server-authoritative: returns the post-toggle buildings array in
 * `correctedState` so the client applies exactly what the server computes.
 * `enabled` flag is taken from the payload (not derived) so the server can
 * reject the action if the client tries to toggle to the wrong value.
 */
export function validateToggleBuildingAction(
  buildingId: string,
  enabled: boolean,
  state: Partial<GameState>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  const buildings = state.buildings ?? [];
  const idx = buildings.findIndex((b) => b.id === buildingId);
  if (idx < 0) {
    return {
      valid: false,
      error: `Building instance "${buildingId}" not found`,
    };
  }

  const building = buildings[idx];
  if (typeof enabled !== "boolean") {
    return { valid: false, error: "Missing 'enabled' boolean in payload" };
  }

  // No-op: client tried to toggle to the value the building already has.
  // Not an error — just return unchanged state to avoid wasted writes.
  if (building.active === enabled) {
    return { valid: true, correctedState: { buildings } };
  }

  const nextBuildings = buildings.map((b, i) =>
    i === idx ? { ...b, active: enabled } : b,
  );
  return { valid: true, correctedState: { buildings: nextBuildings } };
}

/**
 * Validate a 'hire_worker' action.
 *
 * Server-authoritative: looks up the worker type in config, checks
 * affordability against the server-side `baseHireCost` (immune to
 * client-side tampering), generates the worker ID, and returns the
 * updated `workers` array + deducted money in correctedState.
 *
 * `totalMoneyEarned` is unchanged: hiring is a spend path.
 */
export function validateHireWorkerAction(
  workerType: string,
  state: Partial<GameState>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  if (!workerType || typeof workerType !== "string") {
    return { valid: false, error: "Missing workerType in payload" };
  }
  const workerDef = config.workers.find((w) => w.id === workerType);
  if (!workerDef) {
    return {
      valid: false,
      error: `Unknown worker type "${workerType}"`,
    };
  }
  if (
    typeof workerDef.baseHireCost !== "number" ||
    workerDef.baseHireCost < 0
  ) {
    return {
      valid: false,
      error: `Worker "${workerType}" has invalid baseHireCost in config`,
    };
  }

  const money = state.money ?? 0;
  if (money < workerDef.baseHireCost) {
    return {
      valid: false,
      error: `Not enough money to hire ${workerDef.name}. Need $${workerDef.baseHireCost}, have $${Math.floor(money)}`,
    };
  }

  // Generate server-side worker ID (use crypto.randomUUID when available).
  const workerId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `wrk_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const newWorker: Worker = {
    id: workerId,
    type: workerType as WorkerType,
    level: 1,
    experience: 0,
    assignedTo: null,
    efficiency: 1,
    speed: 1,
    maintenance: 0,
  };

  const nextWorkers = [...(state.workers ?? []), newWorker];

  return {
    valid: true,
    correctedState: {
      money: money - workerDef.baseHireCost,
      workers: nextWorkers,
      // totalMoneyEarned unchanged (hiring is a spend path).
    },
  };
}

/**
 * Validate an 'assign_worker' action.
 *
 * Server-authoritative: looks up the worker, validates the buildingId (if
 * non-null) exists in the player's buildings, and returns the updated
 * `workers` array in correctedState. No money change.
 */
export function validateAssignWorkerAction(
  workerId: string,
  buildingId: string | null,
  state: Partial<GameState>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  if (!workerId || typeof workerId !== "string") {
    return { valid: false, error: "Missing workerId in payload" };
  }
  if (buildingId !== null && typeof buildingId !== "string") {
    return {
      valid: false,
      error: "buildingId must be a string or null",
    };
  }

  const workers = state.workers ?? [];
  const idx = workers.findIndex((w) => w.id === workerId);
  if (idx < 0) {
    return {
      valid: false,
      error: `Worker "${workerId}" not found`,
    };
  }

  // If assigning to a building, verify it exists in the player's buildings.
  if (buildingId !== null) {
    const buildings = state.buildings ?? [];
    if (!buildings.find((b) => b.id === buildingId)) {
      return {
        valid: false,
        error: `Building "${buildingId}" not found`,
      };
    }
  }

  const worker = workers[idx];
  // No-op if the assignment target is the same as current.
  if (worker.assignedTo === buildingId) {
    return { valid: true, correctedState: { workers } };
  }

  const nextWorkers = workers.map((w, i) =>
    i === idx ? { ...w, assignedTo: buildingId } : w,
  );
  return { valid: true, correctedState: { workers: nextWorkers } };
}

/**
 * Validate a 'collect_payout' action.
 *
 * Server-authoritative: reads `state.pendingPayout` (computed by the
 * server-side game tick via `runServerTicks`), validates it's positive,
 * and returns the post-collection money + totalMoneyEarned + pendingPayout=0.
 *
 * Income path: totalMoneyEarned increases by the payout amount. This is
 * important for the validate-ticks cron's
 * `money <= totalMoneyEarned * 1.5` ratio check.
 */
export function validateCollectPayoutAction(state: Partial<GameState>): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  const pendingPayout = state.pendingPayout ?? 0;
  if (!Number.isFinite(pendingPayout) || pendingPayout <= 0) {
    return {
      valid: false,
      error: "No pending payout to collect",
    };
  }

  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;

  return {
    valid: true,
    correctedState: {
      money: money + pendingPayout,
      totalMoneyEarned: totalMoneyEarned + pendingPayout,
      pendingPayout: 0,
    },
  };
}

/**
 * Validate a 'claim_quest' action.
 *
 * Server-authoritative: looks up the quest in state.quests, verifies it's
 * completed and unclaimed, applies the reward (money + researchPoints +
 * corporationPoints), and marks the quest as claimed.
 *
 * Income path: totalMoneyEarned increases by the money reward. This
 * maintains the validate-ticks cron ratio check.
 *
 * Quest reward shape: `{ money, researchPoints?, corporationPoints? }`.
 * The server reads the reward from the stored quest state (not from
 * client payload) to prevent reward manipulation.
 */
export function validateClaimQuestAction(
  questId: string,
  state: Partial<GameState>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  if (!questId || typeof questId !== "string") {
    return { valid: false, error: "Missing questId in payload" };
  }

  const quests = state.quests ?? [];
  const questIdx = quests.findIndex((q) => q.id === questId);
  if (questIdx < 0) {
    return {
      valid: false,
      error: `Quest "${questId}" not found`,
    };
  }
  const quest = quests[questIdx];

  if (!quest.completed) {
    return {
      valid: false,
      error: `Quest "${questId}" is not yet completed`,
    };
  }
  if (quest.claimed) {
    return {
      valid: false,
      error: `Quest "${questId}" reward already claimed`,
    };
  }

  const reward = quest.reward;
  if (!reward || typeof reward.money !== "number" || reward.money < 0) {
    return {
      valid: false,
      error: `Quest "${questId}" has invalid reward configuration`,
    };
  }

  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;
  const researchPoints = state.researchPoints ?? 0;
  const corpPoints = state.prestigeState?.corporationPoints ?? 0;

  // Update quest: mark as claimed (preserve all other fields).
  const updatedQuest = { ...quest, claimed: true };
  const nextQuests = quests.map((q, i) => (i === questIdx ? updatedQuest : q));

  return {
    valid: true,
    correctedState: {
      money: money + reward.money,
      totalMoneyEarned: totalMoneyEarned + reward.money,
      researchPoints: researchPoints + (reward.researchPoints ?? 0),
      quests: nextQuests,
      prestigeState: {
        totalPrestiges: state.prestigeState?.totalPrestiges ?? 0,
        megaFactoryUnlocked: state.prestigeState?.megaFactoryUnlocked ?? false,
        bonuses: state.prestigeState?.bonuses ?? [],
        corporationPoints: corpPoints + (reward.corporationPoints ?? 0),
      },
    },
  };
}

/**
 * Validate a 'claim_daily_reward' action.
 *
 * Server-authoritative: looks up the daily reward in state.loginStreak.weeklyRewards,
 * verifies it's unclaimed, applies the reward (money / researchPoints / resources /
 * corporationPoints), and marks it as claimed.
 *
 * Income path: totalMoneyEarned increases by the money amount (for money-type rewards).
 * Day 7 corporationPoints reward also grants a $2000 bonus — applied here.
 */
export function validateClaimDailyRewardAction(
  day: number,
  state: Partial<GameState>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    return { valid: false, error: "Day must be an integer between 1 and 7" };
  }

  const weeklyRewards = state.loginStreak?.weeklyRewards ?? [];
  const rewardIdx = weeklyRewards.findIndex((r) => r.day === day);
  if (rewardIdx < 0) {
    return {
      valid: false,
      error: `No daily reward configured for day ${day}`,
    };
  }
  const reward = weeklyRewards[rewardIdx];
  if (reward.claimed) {
    return {
      valid: false,
      error: `Daily reward for day ${day} already claimed`,
    };
  }
  if (typeof reward.amount !== "number" || reward.amount < 0) {
    return {
      valid: false,
      error: `Invalid reward amount for day ${day}`,
    };
  }

  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;
  const researchPoints = state.researchPoints ?? 0;
  const corpPoints = state.prestigeState?.corporationPoints ?? 0;
  const resources = state.resources ?? {};

  // Mark the reward as claimed; preserve other fields.
  const updatedWeeklyRewards = weeklyRewards.map((r, i) =>
    i === rewardIdx ? { ...r, claimed: true } : r,
  );

  // Build the correctedState by applying the reward based on its type.
  // The shape returned is the deltas only; the client merges into local state.
  const nextLoginStreak = {
    ...(state.loginStreak ?? {
      currentStreak: 0,
      longestStreak: 0,
      lastLoginDate: "",
      totalLogins: 0,
    }),
    weeklyRewards: updatedWeeklyRewards,
  };

  const corrected: Record<string, unknown> = {
    loginStreak: nextLoginStreak,
  };

  switch (reward.type) {
    case "money":
      corrected.money = money + reward.amount;
      corrected.totalMoneyEarned = totalMoneyEarned + reward.amount;
      break;
    case "researchPoints":
      corrected.researchPoints = researchPoints + reward.amount;
      break;
    case "resources": {
      if (!reward.resource) {
        return {
          valid: false,
          error: `Resources reward for day ${day} missing resource field`,
        };
      }
      const newResources = { ...resources };
      newResources[reward.resource] =
        (newResources[reward.resource] ?? 0) + reward.amount;
      corrected.resources = newResources;
      break;
    }
    case "corporationPoints":
      corrected.prestigeState = {
        totalPrestiges: state.prestigeState?.totalPrestiges ?? 0,
        megaFactoryUnlocked: state.prestigeState?.megaFactoryUnlocked ?? false,
        bonuses: state.prestigeState?.bonuses ?? [],
        corporationPoints: corpPoints + reward.amount,
      };
      // Day 7 grants $2000 bonus on top of corpPoints
      if (day === 7) {
        corrected.money = money + 2000;
        corrected.totalMoneyEarned = totalMoneyEarned + 2000;
      }
      break;
    default:
      return {
        valid: false,
        error: `Unknown reward type "${reward.type}" for day ${day}`,
      };
  }

  return {
    valid: true,
    correctedState: corrected as Partial<GameState>,
  };
}

/**
 * Validate a 'fulfill_contract' action.
 *
 * Server-authoritative: looks up the contract in state.contracts, verifies
 * it's not already completed/failed, checks resource affordability, deducts
 * required resources (non-money), grants rewards (money + RP + corpPoints),
 * and marks the contract as completed.
 *
 * Income path: totalMoneyEarned increases by the money reward. Also
 * increments completedContracts counter and stats.contractsCompleted.
 *
 * Note: `acceptContract` is intentionally not server-authoritative in this
 * phase — it's an additive UI operation (no economy change), and the
 * 5-active-contract cap is enforced client-side.
 */
export function validateFulfillContractAction(
  contractId: string,
  state: Partial<GameState>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  if (!contractId || typeof contractId !== "string") {
    return { valid: false, error: "Missing contractId in payload" };
  }

  const contracts = state.contracts ?? [];
  const contractIdx = contracts.findIndex((c) => c.id === contractId);
  if (contractIdx < 0) {
    return {
      valid: false,
      error: `Contract "${contractId}" not found`,
    };
  }
  const contract = contracts[contractIdx];

  if (contract.completed) {
    return {
      valid: false,
      error: `Contract "${contractId}" already completed`,
    };
  }
  if (contract.failed) {
    return {
      valid: false,
      error: `Contract "${contractId}" already failed`,
    };
  }

  // Resource affordability check (server-authoritative). Required resources
  // can be 'money' (which is implicitly paid) or other resources (which must
  // be in the player's inventory).
  const resources = state.resources ?? {};
  const money = state.money ?? 0;
  for (const required of contract.requiredResources) {
    if (required.resource === "money") {
      if (money < required.amount) {
        return {
          valid: false,
          error: `Not enough money to fulfill contract "${contractId}". Need $${required.amount}, have $${Math.floor(money)}`,
        };
      }
    } else {
      const available = resources[required.resource] ?? 0;
      if (available < required.amount) {
        return {
          valid: false,
          error: `Not enough ${required.resource} to fulfill contract "${contractId}". Need ${required.amount}, have ${Math.floor(available)}`,
        };
      }
    }
  }

  // Reward reads from the stored contract (server-trusted), not from client payload.
  const reward = contract.reward;
  if (!reward || typeof reward.money !== "number" || reward.money < 0) {
    return {
      valid: false,
      error: `Contract "${contractId}" has invalid reward configuration`,
    };
  }

  const totalMoneyEarned = state.totalMoneyEarned ?? 0;
  const researchPoints = state.researchPoints ?? 0;
  const corpPoints = state.prestigeState?.corporationPoints ?? 0;
  const completedContracts = state.completedContracts ?? 0;
  const contractsCompletedStat = state.stats?.contractsCompleted ?? 0;

  // Deduct required resources (non-money stays in state; money is also
  // deducted from the same pool). We deduct money from state.money AND add
  // the reward, so net is `money + reward.money - moneyRequiredForContract`.
  // For simplicity and consistency: treat money-required as part of resources.
  const newResources: Record<string, number> = { ...resources };
  let moneyDelta = 0; // net change
  for (const required of contract.requiredResources) {
    if (required.resource === "money") {
      moneyDelta -= required.amount;
    } else {
      const current = newResources[required.resource] ?? 0;
      newResources[required.resource] = current - required.amount;
    }
  }
  moneyDelta += reward.money;

  // Mark the contract as completed.
  const completedContract = {
    ...contract,
    completed: true,
    progress: 1,
  };
  const nextContracts = contracts.map((c, i) =>
    i === contractIdx ? completedContract : c,
  );

  return {
    valid: true,
    correctedState: {
      money: money + moneyDelta,
      totalMoneyEarned: totalMoneyEarned + reward.money,
      researchPoints: researchPoints + (reward.researchPoints ?? 0),
      resources: newResources,
      contracts: nextContracts,
      completedContracts: completedContracts + 1,
      stats: {
        ...(state.stats ?? {
          totalResourcesProduced: {} as Record<string, number>,
          totalResourcesSold: {} as Record<string, number>,
          peakEfficiency: 0,
          factoriesBuilt: 0,
          transportLinesBuilt: 0,
          researchCompleted: 0,
          contractsCompleted: 0,
          playTime: 0,
        }),
        contractsCompleted: contractsCompletedStat + 1,
      },
      prestigeState: {
        totalPrestiges: state.prestigeState?.totalPrestiges ?? 0,
        megaFactoryUnlocked: state.prestigeState?.megaFactoryUnlocked ?? false,
        bonuses: state.prestigeState?.bonuses ?? [],
        corporationPoints: corpPoints + (reward.corporationPoints ?? 0),
      },
    },
  };
}

/**
 * Validate an 'upgrade_storage' action.
 *
 * Server-authoritative: computes the log-dampened exponential cost
 * (matches the formula in the client actions/storage.ts upgradeStorage
 * implementation: 100 * exponent^N * dampener^N for each level), checks
 * affordability, and returns the post-upgrade resourceCapacity and
 * storageUpgradeLevels. Money is deducted; totalMoneyEarned is unchanged
 * (storage is a spend path, not income).
 */
export function validateUpgradeStorageAction(
  resource: string,
  levels: number,
  state: Partial<GameState>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  // Input validation
  if (!resource || typeof resource !== "string") {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (!Number.isFinite(levels) || levels <= 0 || !Number.isInteger(levels)) {
    return {
      valid: false,
      error: `Invalid levels: ${levels}. Must be a positive integer.`,
    };
  }
  // Phase 2.5: cap bulk upgrades at 100 to prevent runaway server work
  const MAX_STORAGE_UPGRADE = 100;
  if (levels > MAX_STORAGE_UPGRADE) {
    return {
      valid: false,
      error: `Cannot upgrade more than ${MAX_STORAGE_UPGRADE} levels at once`,
    };
  }

  // Cost formula: matches the client upgradeStorage formula. Kept in sync
  // via getBalance() so any future tuning propagates to both sides.
  const bal = getBalance().storage;
  const currentLevel =
    state.storageUpgradeLevels?.[resource as ResourceType] ?? 0;

  let totalCost = 0;
  for (let i = 0; i < levels; i++) {
    const n = currentLevel + i;
    const exponential = Math.pow(bal.upgradeCostExponent, n);
    const dampening = Math.pow(bal.logCostMultiplier, n);
    totalCost += Math.floor(100 * exponential * dampening);
  }

  const money = state.money ?? 0;
  if (money < totalCost) {
    return {
      valid: false,
      error: `Not enough money for storage upgrade. Need $${totalCost}, have $${Math.floor(money)}`,
    };
  }

  // Capacity gain: base capacity * upgradeCapacityRatio * levels
  const baseCapacity = state.resourceCapacity?.[resource as ResourceType] ?? 0;
  const addedCapacity = baseCapacity * bal.upgradeCapacityRatio * levels;
  const nextCapacity = {
    ...(state.resourceCapacity ?? ({} as Record<ResourceType, number>)),
    [resource]: baseCapacity + addedCapacity,
  };
  const nextLevels = {
    ...(state.storageUpgradeLevels ?? ({} as Record<ResourceType, number>)),
    [resource]: currentLevel + levels,
  };

  return {
    valid: true,
    correctedState: {
      money: money - totalCost,
      resourceCapacity: nextCapacity,
      storageUpgradeLevels: nextLevels,
      // totalMoneyEarned unchanged (storage is a spend path).
    },
  };
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

  const fromBuilding = buildings.find((b) => b.id === fromBuildingId);
  if (!fromBuilding) {
    return {
      valid: false,
      error: `Source building "${fromBuildingId}" not found`,
    };
  }

  const toBuilding = buildings.find((b) => b.id === toBuildingId);
  if (!toBuilding) {
    return {
      valid: false,
      error: `Destination building "${toBuildingId}" not found`,
    };
  }

  // Verify buildings exist in config
  const fromDef = config.buildings[fromBuilding.type];
  if (!fromDef) {
    return {
      valid: false,
      error: `Source building type "${fromBuilding.type}" not found in config`,
    };
  }

  const toDef = config.buildings[toBuilding.type];
  if (!toDef) {
    return {
      valid: false,
      error: `Destination building type "${toBuilding.type}" not found in config`,
    };
  }

  // Check that from building produces the resource or to building consumes it
  // This is a soft check - we verify the chain exists in productionChains
  const chainExists = config.productionChains.some(
    (c) =>
      c.upstreamBuilding === fromBuilding.type &&
      c.downstreamBuilding === toBuilding.type,
  );

  if (!chainExists) {
    // Not necessarily invalid, but warn
    // Allow it anyway — player may set up custom routes
  }

  return { valid: true };
}
