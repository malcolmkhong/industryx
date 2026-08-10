import type {
  BuildingDefinition,
  BuildingType,
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
} from "../shared/types/types";
import type { GameConfig } from "./types/gameConfig";
import { migrateBuildingId } from "../migration/idMigration";

// ============================================
// Mutable references — importers see updates via live bindings.
// Initial values are EMPTY (fail-closed semantics).
// ============================================

export let BUILDING_DEFS: Record<BuildingType, BuildingDefinition> =
  {} as Record<BuildingType, BuildingDefinition>;
export let RESOURCE_META: Record<
  ResourceType,
  {
    name: string;
    icon: string;
    tier: number;
    color: string;
    baseCapacity: number;
  }
> = {} as Record<
  ResourceType,
  {
    name: string;
    icon: string;
    tier: number;
    color: string;
    baseCapacity: number;
  }
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
  // V-015 (PR-BP-3): preserved from `game_config_seasonal_events` rows.
  // Previously the transformer dropped season / startDate / endDate /
  // isActive and substituted hardcoded literals for everything else;
  // UI consumers (catalog, dashboard, ticker) could not distinguish
  // genuine seasonal windows from default 500-tick placeholder events.
  season?: string;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}>;
export let WEATHER_DEFS: Record<WeatherType, WeatherDefinition> = {} as Record<
  WeatherType,
  WeatherDefinition
>;
export let QUEST_DEFS: Quest[] = [];
export let TRADABLE_RESOURCE_IDS: readonly string[] = [];

// ============================================
// Source tracking
// ============================================

export let configSource: "local" | "supabase" = "local";
export let configLoadedAt = Date.now();
export let configVersion = 0; // incremented on each update

export { getStreakMultiplier } from "../shared/utils/streakMultiplier";
export { TIER_INFO } from "../progression/tiers";

// ============================================
// Migration map: old hardcoded ID -> new Supabase ID
// ============================================
//
// R-A audit fix (2026-07-18): this module previously held a
// parallel `BUILDING_ID_MIGRATION` map and a private
// `migrateBuildingId` function that duplicated the canonical
// definitions in `idMigration.ts`. If one map was updated
// without the other, runtime migration would silently disagree
// with save-state migration. The fix re-exports the canonical
// `BUILDING_ID_MAP` under the legacy alias so callers
// (`buildingIdMigration.ts`, inline imports) keep working
// without forking the map.
//
// Canonical owner: `src/lib/game/migration/idMigration.ts`.

export { BUILDING_ID_MAP as BUILDING_ID_MIGRATION } from "../migration/idMigration";
export { migrateBuildingId } from "../migration/idMigration";

// ============================================
// Migration helper — migrate building type IDs in existing data
// ============================================

export function migrateBuildingDefs(): void {
  const migrated: Partial<Record<BuildingType, BuildingDefinition>> = {};
  let migrationCount = 0;

  for (const [id, def] of Object.entries(BUILDING_DEFS)) {
    const newId = migrateBuildingId(id);
    if (newId !== id) {
      migrated[newId as BuildingType] = {
        ...def,
        type: newId as BuildingDefinition["type"],
      };
      migrationCount++;
    } else {
      migrated[id as BuildingType] = def;
    }
  }

  if (migrationCount > 0) {
    // Partial is OK here — migrateBuildingDefs only fills in entries that
    // changed ID; the rest still live in the prior reference. Cast back to
    // the full record to preserve the type contract.
    BUILDING_DEFS = mergedBuildingDefs(migrated);
  }
}

// `migrateBuildingId` is re-exported from idMigration.ts above;
// this module no longer defines its own copy. See the comment block
// on the re-export for the audit rationale.

function mergedBuildingDefs(
  partial: Partial<Record<BuildingType, BuildingDefinition>>,
): Record<BuildingType, BuildingDefinition> {
  return { ...BUILDING_DEFS, ...partial } as Record<
    BuildingType,
    BuildingDefinition
  >;
}

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
        {
          name: val.name,
          icon: val.icon,
          tier: val.tier,
          color: val.color,
          baseCapacity: val.baseCapacity,
        },
      ]),
    ) as Record<
      ResourceType,
      {
        name: string;
        icon: string;
        tier: number;
        color: string;
        baseCapacity: number;
      }
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
      effects: ((r.effects as Array<Record<string, unknown>> | null) ?? []).map(
        (raw, idx) => ({
          id: `${r.id}-effect-${idx}`,
          type: raw.type as ResearchNode["effects"][number]["type"],
          target: raw.target as string | undefined,
          value: Number(raw.value ?? 1),
        }),
      ),
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
      steps: ((q.steps as Array<Record<string, unknown>> | null) ?? []).map(
        (raw, idx) => ({
          id: `${q.id}-step-${idx}`,
          description: String(raw.description ?? ""),
          target: Number(raw.target ?? 1),
          current: Number(raw.current ?? 0),
          completed: raw.completed === true,
        }),
      ),
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
  // V-015 (PR-BP-3): preserve season / startDate / endDate / isActive
  // from `game_config_seasonal_events`. `duration`, `color`, and
  // `triggerChance` have no current DB columns and remain fallback
  // defaults; consumers that have these as optional will get the
  // legacy literals, new consumers reading from `season`/`startDate`/
  // `endDate` get the authoritative DB values.
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
      season: s.season,
      startDate: s.startDate,
      endDate: s.endDate,
      isActive: s.isActive,
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
  // derived by walking the building graph (upstream -> downstream).
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
// Derived helpers
// ============================================

export function deriveProductionChains(
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

export function findDownstreamProducer(
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

export function prettifyChainName(resource: string): string {
  const meta = (
    globalThis as { RESOURCE_META?: Record<string, { name?: string }> }
  ).RESOURCE_META;
  if (meta && meta[resource]?.name) return meta[resource].name as string;
  return resource
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

export function deriveContractTemplates(
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
