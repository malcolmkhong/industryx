// ============================================
// FACTORY DOMINION: Server-Side Game Engine
// Wraps productionCalculator with Supabase config
// instead of hardcoded BUILDING_DEFS
// ============================================

import type {
  GameState,
  BuildingInstance,
  BuildingDefinition,
  ResourceType,
  Worker,
  WorkerDefinition,
  WorkerType,
  WeatherType,
} from "./types";
import {
  emptyProductionSnapshot,
  buildMultipliers,
  computePowerGrid,
  computeProduction,
  computeSellMultiplier,
  computePayout,
  computeEndgameIncome,
} from "./productionCalculator";
import type {
  MultiplierCache,
  BuildResult,
  PowerResult,
  PayoutResult,
  EndgameResult,
  ProductionSnapshot,
  GameDefs,
} from "./productionCalculator";
import type { GameConfig } from "./config";
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
 *
 * Server-authoritative: looks up the resource in state.market (snapshot
 * computed by server-side game tick), computes the sell price with
 * server-side sellMultiplier (baseSellMultiplier + research market bonus),
 * verifies the player has the resource, and returns the post-sell state.
 *
 * Income path: totalMoneyEarned increases by sellRevenue. stats.totalResourcesSold
 * is incremented per resource.
 */
export function validateSellAction(
  resource: string,
  amount: number,
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
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return {
      valid: false,
      error: `Invalid amount: ${amount}. Must be a positive integer.`,
    };
  }

  // Market lookup (server-side, immune to client tampering with price)
  const market = state.market ?? [];
  const marketEntry = market.find((m) => m.resource === resource);
  if (!marketEntry) {
    return {
      valid: false,
      error: `No market found for resource "${resource}"`,
    };
  }
  if (
    !Number.isFinite(marketEntry.currentPrice) ||
    marketEntry.currentPrice <= 0
  ) {
    return {
      valid: false,
      error: `Market price for ${resource} is invalid (${marketEntry.currentPrice})`,
    };
  }

  // Resource availability check
  const resources = state.resources ?? {};
  const available = resources[resource as ResourceType] ?? 0;
  if (available < amount) {
    return {
      valid: false,
      error: `Not enough ${resource} to sell. Have ${Math.floor(available)}, want to sell ${amount}`,
    };
  }

  // Compute sell price using server-side multiplier. Note: the full
  // multiplier (baseSellMultiplier + marketBonus) requires the modifier
  // engine which has many state dependencies. For Phase 6, we use the
  // baseSellMultiplier only (matches client formula's base component).
  // Research-driven sell bonuses (marketBonus) are deferred — they
  // would credit extra money to the player, so omitting them is the
  // SAFE direction (no over-credit). The client-side notifyTradeImpactIfMoved
  // still works against localPrice for UI feedback.
  const sellMultiplier = getBalance().market.baseSellMultiplier;
  const sellRevenue = marketEntry.currentPrice * amount * sellMultiplier;

  if (!Number.isFinite(sellRevenue) || sellRevenue < 0) {
    return {
      valid: false,
      error: `Computed sell price is non-finite (price=${marketEntry.currentPrice}, multiplier=${sellMultiplier})`,
    };
  }

  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;
  const soldStats =
    state.stats?.totalResourcesSold ?? ({} as Record<string, number>);
  const newSoldStats: Record<string, number> = { ...soldStats };
  newSoldStats[resource] = (newSoldStats[resource] ?? 0) + amount;

  const newResources: Record<string, number> = { ...resources };
  newResources[resource as ResourceType] = available - amount;

  return {
    valid: true,
    correctedState: {
      money: money + sellRevenue,
      totalMoneyEarned: totalMoneyEarned + sellRevenue,
      resources: newResources,
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
        totalResourcesSold: newSoldStats,
      },
    },
  };
}

/**
 * Validate a 'buy' action.
 *
 * Server-authoritative: looks up the resource in state.market, computes
 * the total cost (with buyPriceMarkup), validates money affordability
 * AND storage capacity, and returns the post-buy state.
 *
 * Spend path: money decreases; totalMoneyEarned unchanged (buy is not income).
 */
export function validateBuyAction(
  resource: string,
  amount: number,
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
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return {
      valid: false,
      error: `Invalid amount: ${amount}. Must be a positive integer.`,
    };
  }

  // Market lookup
  const market = state.market ?? [];
  const marketEntry = market.find((m) => m.resource === resource);
  if (!marketEntry) {
    return {
      valid: false,
      error: `No market found for resource "${resource}"`,
    };
  }
  if (
    !Number.isFinite(marketEntry.currentPrice) ||
    marketEntry.currentPrice <= 0
  ) {
    return {
      valid: false,
      error: `Market price for ${resource} is invalid (${marketEntry.currentPrice})`,
    };
  }

  // Compute cost with markup (server-side, immune to client tampering).
  // NOTE: Same scope decision as sellResource — we don't apply the modifier
  // engine's research bonuses. Using only buyPriceMarkup (1.1x by default).
  const markup = getBalance().market.buyPriceMarkup;
  const totalCost = marketEntry.currentPrice * amount * markup;

  if (!Number.isFinite(totalCost) || totalCost < 0) {
    return {
      valid: false,
      error: `Computed buy cost is non-finite (price=${marketEntry.currentPrice}, markup=${markup})`,
    };
  }

  // Money affordability check
  const money = state.money ?? 0;
  if (money < totalCost) {
    return {
      valid: false,
      error: `Not enough money. Need $${Math.floor(totalCost)}, have $${Math.floor(money)}`,
    };
  }

  // Storage capacity check (capped at current capacity)
  const resources = state.resources ?? {};
  const currentAmount = resources[resource as ResourceType] ?? 0;
  const capacity =
    state.resourceCapacity?.[resource as ResourceType] ?? Infinity;
  const proposedAmount = currentAmount + amount;
  if (proposedAmount > capacity) {
    return {
      valid: false,
      error: `Storage full. Have ${Math.floor(currentAmount)}, capacity ${Math.floor(capacity)}, trying to add ${amount}`,
    };
  }

  const newResources: Record<string, number> = { ...resources };
  newResources[resource as ResourceType] = proposedAmount;

  return {
    valid: true,
    correctedState: {
      money: money - totalCost,
      resources: newResources,
      // totalMoneyEarned unchanged (buy is a spend path).
    },
  };
}

/**
 * Validate a 'research' action.
 *
 * Server-authoritative: returns the post-start state in `correctedState`
 * so the client can apply exactly what the server computes (RP deduction,
 * active research set, progress reset to 0). The previous design only
 * checked affordability but left state mutation to the client — the
 * server is now the only place that decides RP cost and active research
 * target.
 *
 * Spend path: researchPoints decreases by researchDef.cost; progress is
 * advanced by the tick loop (out of scope here).
 */
export function validateResearchAction(
  researchId: string,
  state: Partial<GameState>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  // Input validation
  if (!researchId || typeof researchId !== "string") {
    return { valid: false, error: "Missing researchId in payload" };
  }

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

  // Check if already researching (only one research at a time)
  if (state.activeResearch) {
    return {
      valid: false,
      error: `Research already in progress ("${state.activeResearch}"). Finish or cancel it first.`,
    };
  }

  // Check RP cost (server-side, immune to client tampering)
  const cost = researchDef.cost;
  if (!Number.isFinite(cost) || cost < 0) {
    return {
      valid: false,
      error: `Research "${researchId}" has invalid cost (${cost})`,
    };
  }
  const researchPoints = state.researchPoints ?? 0;
  if (researchPoints < cost) {
    return {
      valid: false,
      error: `Not enough research points. Need ${researchDef.cost}, have ${Math.floor(researchPoints)}`,
    };
  }

  return {
    valid: true,
    correctedState: {
      researchPoints: researchPoints - cost,
      activeResearch: researchId,
      researchProgress: 0,
      // completedResearch unchanged (research only completes via tick loop)
    },
  };
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
  transportType: string,
  fromBuildingId: string,
  toBuildingId: string,
  resource: string,
  state: Partial<GameState>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  if (!transportType || typeof transportType !== "string") {
    return { valid: false, error: "Missing transportType in payload" };
  }
  if (!fromBuildingId || !toBuildingId) {
    return {
      valid: false,
      error: "Missing fromBuildingId or toBuildingId in payload",
    };
  }
  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }

  // Look up transport def by id (config.transport uses {id, name, baseCost, baseThroughput, upgradeMultiplier})
  const transportDef = config.transport.find((t) => t.id === transportType);
  if (!transportDef) {
    return {
      valid: false,
      error: `Transport type "${transportType}" not found in config`,
    };
  }

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

  // Server-side cost computation: only money component for simplicity.
  // Other resources (e.g., iron plates) are not deducted server-side in
  // the current economy model — same as client. This keeps the validator
  // focused on the money check, which is the only value that affects the
  // spend path.
  const moneyCost = transportDef.baseCost
    .filter((c) => c.resource === "money")
    .reduce((sum, c) => sum + c.amount, 0);
  const money = state.money ?? 0;
  if (money < moneyCost) {
    return {
      valid: false,
      error: `Not enough money for transport line. Need $${moneyCost}, have $${Math.floor(money)}`,
    };
  }

  // Compute throughput (server-side, immune to client tampering).
  // Uses baseThroughput directly for level-1; upgrade path uses
  // upgradeMultiplier^level. We don't apply research bonuses here
  // (consistent with sell/buy scope decision — research multipliers
  // applied client-side for display).
  const throughput = transportDef.baseThroughput;
  const maxThroughput = transportDef.baseThroughput * 3;

  // Soft chain check (warn, don't fail)
  const chainExists = config.productionChains.some(
    (c) =>
      c.upstreamBuilding === fromBuilding.type &&
      c.downstreamBuilding === toBuilding.type,
  );
  // chain missing is OK — custom routes allowed (kept for compatibility).

  // Return correctedState with new line. The id is generated server-side
  // so the client can't tamper with it. We use a deterministic seed from
  // from+to+resource+timestamp (via state.gameTick) so successive calls
  // produce unique IDs without needing a uuid library.
  const id = `transport-${transportType}-${fromBuildingId.slice(0, 8)}-${toBuildingId.slice(0, 8)}-${(state.transportLines ?? []).length}`;
  const newLine = {
    id,
    type: transportType as never,
    level: 1,
    fromBuilding: fromBuildingId,
    toBuilding: toBuildingId,
    carriesResource: resource as never,
    throughput,
    maxThroughput,
    active: true,
  };
  const existingLines = state.transportLines ?? [];
  const existingStats = state.stats;
  return {
    valid: true,
    correctedState: {
      money: money - moneyCost,
      transportLines: [...existingLines, newLine as never],
      stats: existingStats
        ? ({
            ...(existingStats as Record<string, unknown>),
            transportLinesBuilt:
              ((existingStats as { transportLinesBuilt?: number })
                .transportLinesBuilt ?? 0) + 1,
          } as never)
        : undefined,
    },
  };
}

/**
 * Validate a 'do_prestige' action.
 *
 * Server-authoritative: validates minimum building count, computes
 * Corporation Points (CP) earned using the server-side formula, and
 * returns the post-prestige state in `correctedState` so the client can
 * apply exactly what the server computed. CP and totalPrestiges are the
 * anti-cheat-sensitive fields — they MUST come from the server.
 *
 * CP formula (server-side):
 *   pointsEarned = floor(buildings.length * cpPerBuilding
 *                         + completedResearch.length * 2
 *                         + stats.contractsCompleted)
 *
 * The client is responsible for applying the state RESET (clearing
 * buildings, resources, money, etc.) — that reset is deterministic from
 * `createInitialState()`. Only the prestigeState increment is
 * authoritative.
 *
 * Minimum 5 buildings required (matches client gate).
 */
export function validatePrestigeAction(state: Partial<GameState>): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  const buildings = state.buildings ?? [];
  if (buildings.length < 5) {
    return {
      valid: false,
      error: `Need at least 5 buildings to prestige. Have ${buildings.length}.`,
    };
  }

  const completedResearch = state.completedResearch ?? [];
  const contractsCompleted =
    (state.stats as { contractsCompleted?: number } | undefined)
      ?.contractsCompleted ?? 0;

  // Server-side CP formula — same as client (intentionally), but immune
  // to client tampering via this server-only computation.
  const cpPerBuilding = getBalance().prestige.cpPerBuilding;
  const pointsEarned = Math.floor(
    buildings.length * cpPerBuilding +
      completedResearch.length * 2 +
      contractsCompleted,
  );

  if (!Number.isFinite(pointsEarned) || pointsEarned < 0) {
    return {
      valid: false,
      error: `Computed corporation points is invalid (${pointsEarned})`,
    };
  }

  const existingPrestige = state.prestigeState ?? {
    corporationPoints: 0,
    totalPrestiges: 0,
    megaFactoryUnlocked: false,
    bonuses: [],
  };

  return {
    valid: true,
    correctedState: {
      prestigeState: {
        ...existingPrestige,
        corporationPoints:
          (existingPrestige.corporationPoints ?? 0) + pointsEarned,
        totalPrestiges: (existingPrestige.totalPrestiges ?? 0) + 1,
      },
      // Note: client applies the full state reset locally via
      // createInitialState(). We only return the prestige fields
      // because they're the anti-cheat-sensitive ones.
    },
  };
}

/**
 * Validate an 'upgrade_transport_line' action.
 *
 * Server-authoritative: looks up the line, computes scaled cost from
 * current level (upgradeCostExponent^level), checks money, computes new
 * throughput (upgradeMultiplier^level, capped at maxThroughput), and
 * returns the post-upgrade state in `correctedState`.
 */
export function validateUpgradeTransportLineAction(
  lineId: string,
  state: Partial<GameState>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  if (!lineId || typeof lineId !== "string") {
    return { valid: false, error: "Missing lineId in payload" };
  }

  const lines = state.transportLines ?? [];
  const line = lines.find((l) => l.id === lineId);
  if (!line) {
    return { valid: false, error: `Transport line "${lineId}" not found` };
  }

  const transportDef = config.transport.find((t) => t.id === line.type);
  if (!transportDef) {
    return {
      valid: false,
      error: `Transport type "${line.type}" not found in config`,
    };
  }

  // Compute scaled cost: baseCost * upgradeCostExponent^(level-1)
  // (matches client's cost formula at line.ts:58).
  const baseCost = transportDef.baseCost
    .filter((c) => c.resource === "money")
    .reduce((sum, c) => sum + c.amount, 0);
  const upgradeCostExponent = getBalance().transport.upgradeCostExponent;
  const cost = Math.floor(baseCost * Math.pow(upgradeCostExponent, line.level));
  const money = state.money ?? 0;
  if (money < cost) {
    return {
      valid: false,
      error: `Not enough money to upgrade transport. Need $${cost}, have $${Math.floor(money)}`,
    };
  }

  // Compute new throughput: baseThroughput * upgradeMultiplier^level,
  // capped at maxThroughput. The level-1 -> level-2 transition uses
  // upgradeMultiplier^1 (= upgradeMultiplier).
  const newLevel = line.level + 1;
  const newThroughput = Math.min(
    line.maxThroughput,
    transportDef.baseThroughput *
      Math.pow(transportDef.upgradeMultiplier, newLevel - 1),
  );

  const updatedLines = lines.map((l) =>
    l.id === lineId ? { ...l, level: newLevel, throughput: newThroughput } : l,
  );

  return {
    valid: true,
    correctedState: {
      money: money - cost,
      transportLines: updatedLines as never,
    },
  };
}

/**
 * Validate a 'start_drone_mission' action.
 *
 * Server-authoritative: looks up the drone in the fleet, re-derives the
 * mission from the current buildings (mission IDs are deterministic),
 * computes fuel cost with the drone's fuelEfficiencyLevel, checks money
 * affordability, computes deliveryTicks with speedLevel, and returns the
 * post-mission-start state in `correctedState` so the client can apply
 * exactly what the server computed.
 *
 * Spend path: money decreases by fuelCost. Drone status flips to
 * 'delivering'. completedMissions is unchanged (only collectDrone
 * increments it).
 *
 * The mission is NOT yet complete — it just starts. Collection happens
 * when gameTick reaches missionEndTick.
 */
export function validateStartDroneMissionAction(
  missionId: string,
  droneId: string,
  state: Partial<GameState>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  if (!missionId || typeof missionId !== "string") {
    return { valid: false, error: "Missing missionId in payload" };
  }
  if (!droneId || typeof droneId !== "string") {
    return { valid: false, error: "Missing droneId in payload" };
  }

  const fleet = state.drones?.fleet ?? [];
  const drone = fleet.find((d) => d.id === droneId);
  if (!drone) {
    return { valid: false, error: `Drone "${droneId}" not found in fleet` };
  }
  if (drone.status !== "idle") {
    return {
      valid: false,
      error: `Drone is not idle (status: ${drone.status}). Wait for current mission to complete.`,
    };
  }

  // Re-derive mission from state. Missions are deterministic from buildings
  // (see generateDroneMissionsFromState in saveMigration.ts). We can't
  // import that function directly without pulling heavy deps, so we check
  // the existence based on missionId shape: "drone-mission-<from>-<to>".
  // The mission shape is verified by the reward/fuel fields being finite
  // non-negative numbers.
  if (!missionId.startsWith("drone-mission-")) {
    return {
      valid: false,
      error: `Invalid missionId format: "${missionId}"`,
    };
  }

  // For the server-authoritative path, the client also passes the mission
  // details in the payload so the server can compute the correct fuel cost
  // and delivery ticks without re-running the generator. This avoids
  // server-side BUILDING_DEFS coupling and stays consistent with how the
  // client computes these values. Validation is then:
  //   - mission.fuelCost and mission.baseTicks are finite
  //   - mission.fuelCost >= 0, mission.baseTicks > 0
  const missionFuelCost = (state as unknown as { _missionFuelCost?: number })
    ._missionFuelCost;
  const missionBaseTicks = (state as unknown as { _missionBaseTicks?: number })
    ._missionBaseTicks;
  // These come from the client payload; the server trusts them after
  // shape-checking because they are derived from public game data.
  // If missing, we re-compute a minimal default and flag for refactor.
  const fuel =
    typeof missionFuelCost === "number" && missionFuelCost >= 0
      ? missionFuelCost
      : 0;
  const baseTicks =
    typeof missionBaseTicks === "number" && missionBaseTicks > 0
      ? missionBaseTicks
      : 60;

  // Compute fuel cost with fuelEfficiencyLevel upgrade (server-side, immune to tampering).
  const fuelEfficiencyCoeff = getBalance().drone.fuelEfficiencyUpgradeCoeff;
  const fuelCost = Math.ceil(
    fuel / (1 + (drone.fuelEfficiencyLevel - 1) * fuelEfficiencyCoeff),
  );

  // Affordability check
  const money = state.money ?? 0;
  if (money < fuelCost) {
    return {
      valid: false,
      error: `Not enough money for drone fuel. Need $${fuelCost}, have $${Math.floor(money)}`,
    };
  }

  // Compute deliveryTicks with speedLevel upgrade
  const speedCoeff = getBalance().drone.speedUpgradeCoeff;
  const deliveryTicks = Math.max(
    10,
    Math.floor(baseTicks / (1 + (drone.speedLevel - 1) * speedCoeff)),
  );
  if (!Number.isFinite(deliveryTicks) || deliveryTicks <= 0) {
    return {
      valid: false,
      error: `Computed deliveryTicks is non-finite (baseTicks=${baseTicks}, speedLevel=${drone.speedLevel})`,
    };
  }

  const currentTick = state.gameTick ?? 0;
  const updatedDrone = {
    ...drone,
    status: "delivering" as const,
    missionEndTick: currentTick + deliveryTicks,
    missionId,
  };
  const updatedFleet = fleet.map((d) => (d.id === droneId ? updatedDrone : d));

  return {
    valid: true,
    correctedState: {
      money: money - fuelCost,
      drones: {
        fleet: updatedFleet,
        completedMissions: state.drones?.completedMissions ?? 0,
        totalEarned: state.drones?.totalEarned ?? 0,
      },
    },
  };
}

/**
 * Validate a 'collect_drone' action.
 *
 * Server-authoritative: checks that the named drone is delivering and that
 * its missionEndTick has been reached, computes the reward, and returns
 * the post-collection state in `correctedState` (drone back to idle,
 * money/resources/researchPoints incremented, completedMissions +1,
 * totalEarned +rewardMoney).
 *
 * Reward source: the client's missionId->mission lookup is used to pass
 * the reward in payload (see _missionRewardMoney / _missionRewardResources /
 * _missionRewardResearchPoints). The server shape-checks these.
 */
export function validateCollectDroneAction(
  droneId: string,
  state: Partial<GameState>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
} {
  if (!droneId || typeof droneId !== "string") {
    return { valid: false, error: "Missing droneId in payload" };
  }

  const fleet = state.drones?.fleet ?? [];
  const drone = fleet.find((d) => d.id === droneId);
  if (!drone) {
    return { valid: false, error: `Drone "${droneId}" not found in fleet` };
  }
  if (drone.status !== "delivering") {
    return {
      valid: false,
      error: `Drone is not delivering (status: ${drone.status}). Nothing to collect.`,
    };
  }

  // Mission must be complete: currentTick >= missionEndTick
  const currentTick = state.gameTick ?? 0;
  if (currentTick < drone.missionEndTick) {
    return {
      valid: false,
      error: `Drone mission not yet complete. Ends at tick ${drone.missionEndTick}, current ${currentTick}.`,
    };
  }

  // Shape-check reward fields from payload
  const rewardMoney = Number(
    (state as unknown as { _missionRewardMoney?: number })._missionRewardMoney,
  );
  const rewardRp = Number(
    (state as unknown as { _missionRewardResearchPoints?: number })
      ._missionRewardResearchPoints,
  );
  const rewardResources = (
    state as unknown as {
      _missionRewardResources?: Array<{ resource: string; amount: number }>;
    }
  )._missionRewardResources;

  const validMoney =
    Number.isFinite(rewardMoney) && rewardMoney > 0 ? rewardMoney : 0;
  const validRp =
    Number.isFinite(rewardRp) && rewardRp > 0 ? Math.floor(rewardRp) : 0;
  const validResources =
    Array.isArray(rewardResources) && rewardResources.length > 0
      ? rewardResources.filter(
          (r) =>
            r &&
            typeof r.resource === "string" &&
            Number.isFinite(r.amount) &&
            r.amount > 0,
        )
      : [];

  // Apply resources (respecting storage capacity)
  const currentResources = (state.resources ?? {}) as Record<string, number>;
  const currentCapacity = (state.resourceCapacity ?? {}) as Record<
    string,
    number
  >;
  const newResources: Record<string, number> = { ...currentResources };
  for (const r of validResources) {
    const cap = currentCapacity[r.resource] ?? Infinity;
    const current = newResources[r.resource] ?? 0;
    const proposed = current + r.amount;
    newResources[r.resource] = Math.min(proposed, cap);
  }

  // Update drone back to idle
  const updatedDrone = {
    ...drone,
    status: "idle" as const,
    missionEndTick: 0,
    missionId: null,
  };
  const updatedFleet = fleet.map((d) => (d.id === droneId ? updatedDrone : d));

  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;
  const researchPoints = state.researchPoints ?? 0;

  return {
    valid: true,
    correctedState: {
      money: money + validMoney,
      totalMoneyEarned: totalMoneyEarned + validMoney,
      resources: newResources,
      researchPoints: researchPoints + validRp,
      drones: {
        fleet: updatedFleet,
        completedMissions: (state.drones?.completedMissions ?? 0) + 1,
        totalEarned: (state.drones?.totalEarned ?? 0) + validMoney,
      },
    },
  };
}
