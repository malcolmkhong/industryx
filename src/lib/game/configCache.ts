// ============================================
// INDUSTRIAX: Dynamic Config Cache
// Bridges Supabase backend with frontend game code
// ============================================
//
// After Phase 5.2 (data.ts → Supabase refactor), this module no longer
// imports from './data'. Initial values are empty — the cache is populated
// at runtime by:
//
//   • Server-side: configLoader.server.ts → ensureConfigLoaded()
//     runs before cron / validators and fails-closed if Supabase is down.
//   • Client-side: GameConfigProvider fetches /api/game/definitions
//     and calls updateFromSupabase() on mount.
//
// All exports use `let` (not `const`) so ES module live bindings
// propagate updates to all importers automatically.
//
// IMPORTANT: Consumers MUST NOT rely on these globals being populated
// before updateFromSupabase() has been called. See:
//   - ensureConfigLoaded() (server, fail-closed)
//   - useConfigVersion() (client, re-render on update)
//   - getStreakMultiplier is now a const import from utils/streakMultiplier

import { TIER_INFO } from "./icons/tiers";

// Re-export TIER_INFO as a const reference (it never mutates — UI-only).
export { TIER_INFO };
import type { GameConfig } from "./config";
import type {
  BuildingDefinition,
  TransportDefinition,
  WorkerDefinition,
  ResearchNode,
  MarketPrice,
  AutomationUnlock,
  PrestigeBonus,
  ResourceType,
  MegaProject,
  DailyReward,
  WeatherType,
  WeatherDefinition,
  Quest,
  EventEffect,
} from "./types";
import { migrateBuildingId } from "./idMigration";
import { getStreakMultiplier } from "./utils/streakMultiplier";
import { applyBalanceOverrides } from "./balanceConfig";

// Re-export the pure-utility function so existing consumers don't have to
// update their imports. Note: this is a const re-export, not a let-bound.
export { getStreakMultiplier };

// ============================================
// Mutable references — importers see updates via live bindings.
// Initial values are EMPTY (fail-closed semantics). They must be populated
// by updateFromSupabase() before any game-logic consumer reads them.
// ============================================

export let BUILDING_DEFS: Record<string, BuildingDefinition> = {};
export let RESOURCE_META: Record<
  ResourceType,
  { name: string; icon: string; tier: number; color: string }
> = {} as Record<
  ResourceType,
  { name: string; icon: string; tier: number; color: string }
>;
export let RESEARCH_TREE: ResearchNode[] = [];
export let TRANSPORT_DEFS: Record<string, TransportDefinition> = {};
export let WORKER_DEFS: Record<string, WorkerDefinition> = {};
export let INITIAL_MARKET: MarketPrice[] = [];
export let AUTOMATION_UNLOCKS: AutomationUnlock[] = [];
export let PRESTIGE_BONUSES: PrestigeBonus[] = [];
export let EVENT_TEMPLATES = [] as Array<{
  type: string;
  name: string;
  description: string;
  duration: number;
  effects: unknown[];
  icon: string;
}>;
// TIER_INFO: const reference re-exported above; never mutates.
export let CONTRACT_TEMPLATES: Array<{
  name: string;
  description: string;
  type: string;
  requiredResources: Array<{ resource: string; amount: number }>;
  timeLimit: number;
  difficulty: number;
  gameTier: number;
  icon: string;
}> = [];
export let RANK_THRESHOLDS = [] as Array<{
  name: string;
  minScore: number;
  icon: string;
  color: string;
}>;
export let PRODUCTION_CHAINS = [] as Array<{
  name: string;
  steps: string[];
  color: string;
}>;
export let INITIAL_MEGA_PROJECTS: MegaProject[] = [];
export let WEEKLY_DAILY_REWARDS: Omit<DailyReward, "claimed">[] = [];
export let SEASONAL_EVENTS = [] as Array<{
  id: string;
  name: string;
  description: string;
  icon: string;
  duration: number;
  effects: EventEffect[];
  color: string;
  triggerChance: number;
}>;
export let WEATHER_DEFS: Record<WeatherType, WeatherDefinition> = {} as Record<
  WeatherType,
  WeatherDefinition
>;
export let QUEST_DEFS: Quest[] = [];
export let TRADABLE_RESOURCE_IDS: readonly string[] = [];

// ============================================
// Migration map: old hardcoded ID → new Supabase ID
// ============================================

export const BUILDING_ID_MIGRATION: Record<string, string> = {
  miningDrill: "ironMine", // combo extractor → specialized single-resource
  quarry: "sandMine", // combo extractor → specialized single-resource
  goldsmith: "jewelleryForge", // raw inputs → refined inputs (refinedGold+refinedSilver)
};

// ============================================
// Source tracking
// ============================================

export let configSource: "local" | "supabase" = "local";
export let configLoadedAt: number = Date.now();
export let configVersion: number = 0; // incremented on each update

// ============================================
// Update function — called by GameConfigProvider (client) and
// configLoader.server.ts (server) when Supabase data loads
// ============================================

export function updateFromSupabase(config: GameConfig): void {
  // --- Buildings ---
  if (config.buildings && Object.keys(config.buildings).length > 0) {
    BUILDING_DEFS = config.buildings;
  }

  // --- Resources ---
  if (config.resources && Object.keys(config.resources).length > 0) {
    RESOURCE_META = Object.fromEntries(
      Object.entries(config.resources).map(([key, val]) => [
        key,
        { name: val.name, icon: val.icon, tier: val.tier, color: val.color },
      ]),
    ) as Record<
      ResourceType,
      { name: string; icon: string; tier: number; color: string }
    >;
  }

  // --- Research ---
  if (config.research && config.research.length > 0) {
    RESEARCH_TREE = config.research.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category as ResearchNode["category"],
      tier: r.tier,
      cost: r.cost,
      timeRequired: r.timeRequired,
      prerequisites: r.prerequisites,
      effects: r.effects as unknown as ResearchNode["effects"],
      icon: r.icon,
    }));
  }

  // --- Transport ---
  if (config.transport && config.transport.length > 0) {
    const transportRecord: Record<string, TransportDefinition> = {};
    for (const t of config.transport) {
      transportRecord[t.id] = {
        type: t.id as TransportDefinition["type"],
        name: t.name,
        description: t.description,
        baseCost: t.baseCost,
        baseThroughput: t.baseThroughput,
        upgradeMultiplier: t.upgradeMultiplier,
        icon: t.icon,
      };
    }
    TRANSPORT_DEFS = transportRecord;
  }

  // --- Workers ---
  if (config.workers && config.workers.length > 0) {
    const workerRecord: Record<string, WorkerDefinition> = {};
    for (const w of config.workers) {
      workerRecord[w.id] = {
        type: w.id as WorkerDefinition["type"],
        name: w.name,
        description: w.description,
        baseHireCost: w.baseHireCost,
        effects: w.effects as WorkerDefinition["effects"],
        icon: w.icon,
      };
    }
    WORKER_DEFS = workerRecord;
  }

  // --- Market ---
  if (config.market && config.market.length > 0) {
    INITIAL_MARKET = config.market.map((m) => ({
      resource: m.resource as ResourceType,
      basePrice: m.basePrice,
      currentPrice: m.basePrice,
      priceHistory: [],
      demand: m.demand,
      supply: m.supply,
      trend: "stable" as const,
      volatility: m.volatility,
    }));
  }

  // --- Automation ---
  if (config.automation && config.automation.length > 0) {
    AUTOMATION_UNLOCKS = config.automation.map((a) => ({
      type: a.id as AutomationUnlock["type"],
      name: a.name,
      description: a.description,
      cost: a.cost,
      active: false,
      requiresResearch: a.requiresResearch ?? undefined,
      icon: a.icon,
    }));
  }

  // --- Prestige Bonuses ---
  if (config.prestigeBonuses && config.prestigeBonuses.length > 0) {
    PRESTIGE_BONUSES = config.prestigeBonuses.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      cost: p.cost,
      purchased: false,
      effect: p.effect as PrestigeBonus["effect"],
    }));
  }

  // --- Event Templates ---
  if (config.eventTemplates && config.eventTemplates.length > 0) {
    EVENT_TEMPLATES = config.eventTemplates.map((e) => ({
      type: e.type,
      name: e.name,
      description: e.description,
      duration: e.duration,
      effects: e.effects,
      icon: e.icon,
    })) as unknown as typeof EVENT_TEMPLATES;
  }

  // --- Rank Thresholds ---
  if (config.rankThresholds && config.rankThresholds.length > 0) {
    RANK_THRESHOLDS = config.rankThresholds.map((r) => ({
      name: r.name,
      minScore: r.scoreRequired,
      icon: "game-icons:medal",
      color: "#a0a0a0",
    }));
  }

  // --- Quests ---
  if (config.quests && config.quests.length > 0) {
    QUEST_DEFS = config.quests.map((q) => ({
      id: q.id,
      name: q.name,
      description: q.description,
      type: q.type as Quest["type"],
      category: q.category as Quest["category"],
      gameTier: q.gameTier,
      steps: q.steps as unknown as Quest["steps"],
      reward: q.reward as Quest["reward"],
      completed: false,
      claimed: false,
      icon: q.icon,
      targetResource: q.targetResource as ResourceType | undefined,
      targetBuilding: q.targetBuilding as Quest["targetBuilding"],
    }));
  }

  // --- Daily Rewards ---
  if (config.dailyRewards && config.dailyRewards.length > 0) {
    WEEKLY_DAILY_REWARDS = config.dailyRewards.map((d) => ({
      day: d.day,
      type: d.type as DailyReward["type"],
      amount: d.amount,
      ...(d.resourceId ? { resource: d.resourceId as ResourceType } : {}),
    }));
  }

  // --- Seasonal Events ---
  if (config.seasonalEvents && config.seasonalEvents.length > 0) {
    SEASONAL_EVENTS = config.seasonalEvents.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      icon: s.icon,
      duration: 500,
      effects: s.effects,
      color: "#a855f7",
      triggerChance: 0.001,
    })) as unknown as typeof SEASONAL_EVENTS;
  }

  // --- Weather ---
  if (config.weather && Object.keys(config.weather).length > 0) {
    WEATHER_DEFS = Object.fromEntries(
      Object.entries(config.weather).map(([key, w]) => [
        key,
        {
          name: w.name,
          icon: w.icon,
          productionMultiplier: w.productionMultiplier,
          solarMultiplier: w.solarMultiplier,
          windMultiplier: w.windMultiplier,
          description: w.description,
        },
      ]),
    ) as Record<WeatherType, WeatherDefinition>;
  }

  // --- Mega Projects ---
  if (config.megaProjects && config.megaProjects.length > 0) {
    INITIAL_MEGA_PROJECTS = config.megaProjects.map((m) => ({
      type: m.id as MegaProject["type"],
      name: m.name,
      description: m.description,
      icon: m.icon,
      stages: m.stages as unknown as MegaProject["stages"],
      currentStage: 0,
      progress: 0,
      active: false,
      completed: false,
      bonus: m.bonus as unknown as MegaProject["bonus"],
      unlockRequirement:
        m.unlockRequirement as unknown as MegaProject["unlockRequirement"],
    }));
  }

  // --- Production Chains ---
  // Phase 5.2 fix: derive display-format chains from Supabase edges +
  // the now-populated BUILDING_DEFS. Each chain = ordered resource list
  // derived by walking the building graph (upstream → downstream).
  if (config.productionChains && config.productionChains.length > 0) {
    PRODUCTION_CHAINS = deriveProductionChains(
      config.productionChains,
      BUILDING_DEFS,
    );
  }

  // --- Contract Templates ---
  // Phase 5.3 fix: synthesize contract templates from extractor buildings.
  // Each extractor + its primary output resource becomes one template.
  if (Object.keys(BUILDING_DEFS).length > 0) {
    CONTRACT_TEMPLATES = deriveContractTemplates(BUILDING_DEFS);
  }

  // --- Balance overrides ---
  // Phase 5.3 fix: derive numeric balance overrides from Supabase's
  // game_config_game row (gameConfig). Only fields with a known mapping
  // are translated; everything else falls back to balanceConfig defaults.
  if (config.gameConfig && Object.keys(config.gameConfig).length > 0) {
    const balanceOverrides = deriveBalanceOverrides(
      config.gameConfig as Record<string, unknown>,
    );
    applyBalanceOverrides(balanceOverrides);
  }

  // --- Streak Multiplier ---
  // getStreakMultiplier is a const utility — not affected by Supabase.

  if (config.tradableResourceIds && config.tradableResourceIds.length > 0) {
    TRADABLE_RESOURCE_IDS = config.tradableResourceIds;
  }

  // --- Update source tracking ---
  configSource = "supabase";
  configLoadedAt = Date.now();
  configVersion++;
}

// ============================================
// Migration helper — migrate building type IDs in existing data
// ============================================

export function migrateBuildingDefs(): void {
  const migrated: Record<string, BuildingDefinition> = {};
  let migrationCount = 0;

  for (const [id, def] of Object.entries(BUILDING_DEFS)) {
    const newId = migrateBuildingId(id);
    if (newId !== id) {
      migrated[newId] = { ...def, type: newId as BuildingDefinition["type"] };
      migrationCount++;
    } else {
      migrated[id] = def;
    }
  }

  if (migrationCount > 0) {
    BUILDING_DEFS = migrated;
  }
}

/**
 * Derive display-format production chains from Supabase edge rows + the
 * now-populated BUILDING_DEFS graph.
 */
function deriveProductionChains(
  edges: Array<{
    upstreamBuilding: string;
    downstreamBuilding: string;
    resourceId: string;
  }>,
  buildingDefs: Record<string, BuildingDefinition>,
): Array<{ name: string; steps: string[]; color: string }> {
  const producerByResource = new Map<string, string>();
  for (const [buildingId, def] of Object.entries(buildingDefs)) {
    if (!def.outputs) continue;
    for (const out of def.outputs) {
      if (!producerByResource.has(out.resource)) {
        producerByResource.set(out.resource, buildingId);
      }
    }
  }

  const outputsByBuilding = new Map<string, string[]>();
  for (const [buildingId, def] of Object.entries(buildingDefs)) {
    if (def.outputs) {
      outputsByBuilding.set(
        buildingId,
        def.outputs.map((o) => o.resource),
      );
    }
  }

  const resourceIds = new Set<string>();
  for (const e of edges) resourceIds.add(e.resourceId);

  const MAX_DEPTH = 6;
  const chains: Array<{ name: string; steps: string[]; color: string }> = [];
  const seenChains = new Set<string>();

  for (const headResource of resourceIds) {
    const steps: string[] = [headResource];
    const visited = new Set<string>([headResource]);
    let currentResource = headResource;
    let safety = 0;

    while (safety++ < MAX_DEPTH) {
      const nextBuilding = findDownstreamProducer(
        currentResource,
        buildingDefs,
        outputsByBuilding,
      );
      if (!nextBuilding) break;

      const outputs = outputsByBuilding.get(nextBuilding) ?? [];
      const nextResource = outputs.find((r) => !visited.has(r));
      if (!nextResource) break;

      steps.push(nextResource);
      visited.add(nextResource);
      currentResource = nextResource;
    }

    if (steps.length < 2) continue;

    const dedupeKey = [...steps].sort().join(",");
    if (seenChains.has(dedupeKey)) continue;
    seenChains.add(dedupeKey);

    chains.push({
      name: prettifyChainName(headResource),
      steps,
      color: hashColor(headResource),
    });
  }

  chains.sort((a, b) => a.name.localeCompare(b.name));
  return chains;
}

function findDownstreamProducer(
  resource: string,
  buildingDefs: Record<string, BuildingDefinition>,
  _outputsByBuilding: Map<string, string[]>,
): string | null {
  for (const [buildingId, def] of Object.entries(buildingDefs)) {
    const inputs = def.inputs?.map((i) => i.resource as string) ?? [];
    if (inputs.includes(resource) && def.outputs && def.outputs.length > 0) {
      return buildingId;
    }
  }
  return null;
}

function prettifyChainName(resource: string): string {
  const meta = (
    globalThis as { RESOURCE_META?: Record<string, { name?: string }> }
  ).RESOURCE_META;
  if (meta && meta[resource]?.name) return meta[resource].name as string;
  return resource
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

/**
 * Derive contract templates from extractor buildings.
 *
 * Strategy: one template per (extractor building, primary output resource)
 * combo. Tier is derived from the building's tier (0-5) so contracts scale
 * with player progression. Amount scales with tier.
 */
function deriveContractTemplates(
  buildingDefs: Record<string, BuildingDefinition>,
): Array<{
  name: string;
  description: string;
  type: string;
  requiredResources: Array<{ resource: string; amount: number }>;
  timeLimit: number;
  difficulty: number;
  gameTier: number;
  icon: string;
}> {
  const templates: Array<{
    name: string;
    description: string;
    type: string;
    requiredResources: Array<{ resource: string; amount: number }>;
    timeLimit: number;
    difficulty: number;
    gameTier: number;
    icon: string;
  }> = [];

  for (const def of Object.values(buildingDefs)) {
    if (def.category !== "extractor") continue;
    const primaryOutput = def.outputs?.[0];
    if (!primaryOutput) continue;

    const tier = def.tier ?? 0;
    const amount = Math.max(50, Math.floor(100 * Math.pow(3, tier)));
    const timeLimit = 200 + tier * 120;
    const difficulty = Math.min(5, tier + 1);

    templates.push({
      name: `${def.name} Delivery`,
      description: `Deliver ${amount} ${primaryOutput.resource} from your ${def.name} operations.`,
      type: "delivery" as const,
      requiredResources: [{ resource: primaryOutput.resource, amount }],
      timeLimit,
      difficulty,
      gameTier: tier,
      icon: def.icon,
    });
  }

  return templates;
}

/**
 * Derive numeric balance overrides from Supabase's gameConfig row.
 *
 * Maps columns from game_config_game (the `gameConfig` field on the
 * GameConfig response) to the nested shape used by balanceConfig.ts.
 * Only known mappings are translated; everything else falls back to
 * the DEFAULT_BALANCE values.
 */
function deriveBalanceOverrides(
  gameConfig: Record<string, unknown>,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  const num = (key: string): number | undefined => {
    const v = gameConfig[key];
    return typeof v === "number" ? v : undefined;
  };

  // RP rates
  if (num("passive_rp_per_tick") !== undefined) {
    overrides.rp = {
      ...((overrides.rp as object) ?? {}),
      passiveBase: num("passive_rp_per_tick"),
    };
  }
  if (num("rp_extractor_rate") !== undefined) {
    overrides.rp = {
      ...((overrides.rp as object) ?? {}),
      extractorRate: num("rp_extractor_rate"),
    };
  }
  if (num("rp_power_rate") !== undefined) {
    overrides.rp = {
      ...((overrides.rp as object) ?? {}),
      powerRate: num("rp_power_rate"),
    };
  }
  if (num("rp_factory_t1_rate") !== undefined) {
    overrides.rp = {
      ...((overrides.rp as object) ?? {}),
      factoryT1Rate: num("rp_factory_t1_rate"),
    };
  }
  if (num("rp_factory_t2_rate") !== undefined) {
    overrides.rp = {
      ...((overrides.rp as object) ?? {}),
      factoryT2Rate: num("rp_factory_t2_rate"),
    };
  }
  if (num("rp_factory_t3_rate") !== undefined) {
    overrides.rp = {
      ...((overrides.rp as object) ?? {}),
      factoryT3Rate: num("rp_factory_t3_rate"),
    };
  }
  if (num("rp_factory_t4_rate") !== undefined) {
    overrides.rp = {
      ...((overrides.rp as object) ?? {}),
      factoryT4Rate: num("rp_factory_t4_rate"),
    };
  }
  if (num("rp_factory_t5_rate") !== undefined) {
    overrides.rp = {
      ...((overrides.rp as object) ?? {}),
      factoryT5Rate: num("rp_factory_t5_rate"),
    };
  }

  // Worker
  if (num("worker_xp_rate") !== undefined) {
    overrides.worker = {
      ...((overrides.worker as object) ?? {}),
      xpPerTick: num("worker_xp_rate"),
    };
  }
  if (num("worker_power_reduction_cap") !== undefined) {
    overrides.worker = {
      ...((overrides.worker as object) ?? {}),
      maxPowerReductionPerBuilding: num("worker_power_reduction_cap"),
    };
  }

  // Power
  if (num("min_power_efficiency") !== undefined) {
    overrides.power = {
      ...((overrides.power as object) ?? {}),
      minEfficiency: num("min_power_efficiency"),
    };
  }

  // Auto-sell
  if (num("auto_sell_multiplier") !== undefined) {
    overrides.autoSell = {
      ...((overrides.autoSell as object) ?? {}),
      excessSellRatio: num("auto_sell_multiplier"),
    };
  }

  return overrides;
}
