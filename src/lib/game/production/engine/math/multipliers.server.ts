// Server-side multiplier cache builder.
//
// Builds a MultiplierCache from Supabase-loaded GameConfig, including all
// research / weather / event / prestige / mega-project / worker bonuses via
// the modifier engine. Used by both buildProductionSnapshotServer (one-shot)
// and runServerTicks (per-tick loop).

import {
  ModifierEngine,
  buildModifierRegistry,
} from "../../../modifiers/modifierEngine";
import type {
  ServerGameData,
  BuildingDefinition,
  WorkerDefinition,
  Worker,
} from "../../../shared/types/types";
import type { GameConfig } from "../../../config/config";
import { getBalance } from "../../../config/balance/balanceConfig";
import type { GameDefs, MultiplierCache } from "../../productionCalculator";

export function getBuildingDef(
  buildingType: string,
  buildings: Record<string, BuildingDefinition>,
): BuildingDefinition | null {
  return buildings[buildingType] ?? null;
}

export function buildWorkerDefsMap(
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

export function buildMultipliersServer(
  state: ServerGameData,
  config: GameConfig,
): MultiplierCache {
  const workerDefsMap = buildWorkerDefsMap(config.workers);

  // Transform config.research effects (Record<string,unknown>[]) to the
  // format expected by buildModifierRegistry (Array<{type,target?,value}>).
  const researchTree = config.research.map((r) => ({
    id: r.id,
    effects: (r.effects ?? []) as Array<{
      type: string;
      target?: string;
      value: number;
    }>,
  }));

  // config.weather is a superset of what buildModifierRegistry expects.
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

  // Event multipliers (computed from state, not from modifier engine).
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

  // Weather multipliers from modifier engine.
  const weatherProduction = modifierEngine.resolve("weather.production", 1);
  const weatherSolar = modifierEngine.resolve("weather.solar", 1);
  const weatherWind = modifierEngine.resolve("weather.wind", 1);

  // Category bonuses from modifier engine.
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
  // V-014 (PR-BP-3): production bonus coefficient now shared with the
  // client (`src/lib/game/production/math/multipliers.ts`) via
  // `getBalance().transport.productionBonusCoeff`. Previously this was
  // a hardcoded `0.25` literal — silent drift between client preview
  // and server settlement on any future balance tuning.
  const transportProductionBonus =
    1 +
    getBalance().transport.productionBonusCoeff *
      Math.max(0, transportEfficiency - 1);

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