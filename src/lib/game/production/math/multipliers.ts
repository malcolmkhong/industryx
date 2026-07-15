// Multiplier cache builder.
//
// Resolves all per-tick gameplay bonuses (research, prestige, mega-projects,
// events, weather, transport, power, workers) into a single `MultiplierCache`
// the production math layer can consume without re-deriving them.

import type { ServerGameData, Worker } from "../../shared/types/types";
import {
  ModifierEngine,
  buildModifierRegistry,
} from "../../modifiers/modifierEngine";
import {
  RESEARCH_TREE,
  WEATHER_DEFS,
} from "../../config/configCache";
import { getBalance } from "../../config/balance/balanceConfig";
import type { GameDefs } from "../definitions";

/** Precomputed multipliers — derived from state, not duplicating it. */
export interface MultiplierCache {
  // Modifier engine (new architecture)
  modifierEngine: ModifierEngine | null;
  // Optional injected definitions (server-side uses Supabase config instead of static imports)
  gameDefs?: GameDefs;
  // Event multipliers
  eventProductionGlobal: number;
  eventProductionTargeted: Map<string, number>; // buildingType → multiplier
  eventPowerConsumption: number;
  eventResearch: number;

  // Weather multipliers
  weatherProduction: number;
  weatherSolar: number;
  weatherWind: number;

  // Power
  powerEfficiency: number; // 0.0–1.0, ratio of production/consumption

  // Transport
  transportProductionBonus: number;
  transportThroughputBonus: number; // Total throughput bonus (research + mega combined)

  // Category bonuses (pre-summed from research + mega)
  extractorBonus: number; // extractorSpeedBonus + advancedDrillingBonus + megaExtractionBonus
  factoryBonus: number; // factorySpeedBonus
  t1FactoryBonus: number; // efficientSmeltingBonus
  t2FactoryBonus: number; // advancedElectronicsBonus
  t3FactoryBonus: number; // metabolicEngineeringBonus

  // Building-specific bonuses (pre-summed)
  specificBuildingBonuses: Map<string, number>; // buildingType → bonus

  // Prestige + mega (pre-summed)
  productionBonus: number; // productionPrestigeBonus + megaProductionBonus
  powerBonus: number; // powerPrestigeBonus + megaPowerBonus
  researchBonus: number; // researchPrestigeBonus + megaResearchBonus
  extractionBonus: number; // megaExtractionBonus (included in extractorBonus above, kept for endgame)
  workerEfficiencyTotal: number; // workerEfficiencyResearchBonus + megaWorkerBonus
  workerEfficiencyResearchBonus: number; // Research-only portion (for worker XP calc)
  transportMegaBonus: number;
  marketBonus: number; // marketResearch + prestigeMarket + megaMarket
  storageCapacityBonus: number; // Total storage capacity bonus (research + mega)

  // Research flags
  hasMarketAnalysis: boolean;
  hasEnergyEfficiency: boolean;
  hasPowerOptimization: boolean;

  // Worker lookup (pre-built Map)
  workersByBuilding: Map<string, Worker[]>;

  // Endgame
  megaFactoryUnlocked: boolean;

  // Source tracking: which architecture produced this cache
  _source: "legacy" | "modifierEngine";
}

export function buildMultipliers(state: ServerGameData): MultiplierCache {
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
  const extractorBonus = engine.resolve("production.extractor", 1) - 1;
  const factoryBonus = engine.resolve("production.factory", 1) - 1;
  const t1FactoryBonus = engine.resolve("production.factory.t1", 1) - 1;
  const t2FactoryBonus = engine.resolve("production.factory.t2", 1) - 1;
  const t3FactoryBonus = engine.resolve("production.factory.t3", 1) - 1;

  // Prestige + mega production bonus (target: production.payout)
  const productionBonus = engine.resolve("production.payout", 1) - 1;

  // Power bonus (prestige + mega)
  const powerBonus = engine.resolve("power.production", 1) - 1;

  // Research speed bonus (prestige + mega)
  const researchBonus = engine.resolve("research.speed", 1) - 1;

  // Worker efficiency (research + mega)
  const workerEfficiencyTotal = engine.resolve("worker.efficiency", 1) - 1;
  const workerEfficiencyResearchBonus = registry
    .getModifiers("worker.efficiency")
    .filter((m) => m.source === "research")
    .reduce((sum, m) => sum + (m.value - 1), 0);

  // Market sell price (research + prestige + mega)
  const marketBonus = engine.resolve("market.sellPrice", 1) - 1;

  // Storage capacity (research + mega)
  const storageCapacityBonus = engine.resolve("storage.capacity", 1) - 1;

  // ─── Source-Specific Breakdowns ────────────────────────────────────
  // Some MultiplierCache fields need breakdown by source for backward compat.
  // We derive these from the registry by filtering modifiers.

  // Extraction bonus (mega-only portion, for endgame calc)
  const extractionBonus = registry
    .getModifiers("production.extractor")
    .filter((m) => m.source === "megaProject")
    .reduce((sum, m) => sum + (m.value - 1), 0);

  // Transport bonus (research + mega combined)
  const transportMultiplier = engine.resolve("transport.throughput", 1);
  const transportThroughputBonus = transportMultiplier - 1;
  const transportMegaBonus = registry
    .getModifiers("transport.throughput")
    .filter((m) => m.source === "megaProject")
    .reduce((sum, m) => sum + (m.value - 1), 0);

  // Transport production bonus formula (same as before: 1 + 0.25 * max(0, efficiency - 1))
  const transportEfficiency =
    state.transportLines.length > 0
      ? (state.transportLines.filter((t) => t.active).length /
          Math.max(1, state.transportLines.length)) *
        transportMultiplier
      : 1;
  const transportProductionBonus =
    1 +
    getBalance().transport.productionBonusCoeff *
      Math.max(0, transportEfficiency - 1);

  // ─── Boolean Flags via Modifier Engine ─────────────────────────────
  // These research flags are now checked via the modifier registry instead of researchSet.has()
  const hasMarketAnalysis = engine.hasModifier("market.sellPrice", "research");
  const hasEnergyEfficiency = registry
    .getModifiers("power.consumption")
    .some((m) => m.source === "research" && m.sourceId === "energyEfficiency");
  const hasPowerOptimization = registry
    .getModifiers("power.consumption")
    .some((m) => m.source === "research" && m.sourceId === "powerOptimization");

  // ─── Event Modifiers ───────────────────────────────────────────────
  // Events are already registered in the modifier engine, but we also need
  // them as separate fields for backward compatibility (used directly in computeProduction)
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

  // ─── Weather Modifiers ─────────────────────────────────────────────
  // Resolved from modifier engine (weather uses 'override' operation)
  const weatherProduction = engine.resolve("weather.production", 1);
  const weatherSolar = engine.resolve("weather.solar", 1);
  const weatherWind = engine.resolve("weather.wind", 1);

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
    modifierEngine: engine,
    gameDefs: undefined, // client side uses static imports
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
    _source: "modifierEngine" as const,
  };
}
