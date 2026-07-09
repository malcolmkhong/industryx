// ============================================
// IndustryaX: Server-Side Config Fetcher
// Shared Supabase game-config loader for both
// - Next.js API routes (returns GameConfig JSON to clients)
// - Server-side validators / cron (loads into in-process configCache)
//
// Why shared: the existing /api/game/definitions route hand-rolled the 18
// parallel safeFetchTable calls + transform funcs. The server-side loader
// needed the same data, so this module factors that out so we have ONE
// place to maintain the SQL surface area.
//
// Server-authoritative invariant: this module ALWAYS talks to Supabase
// directly via the service-role client — never via a self-redirect to
// /api/game/definitions, which would add latency + cache-confusion risks.
// ============================================

import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  SupabaseBuilding,
  SupabaseResource,
  SupabaseRecipe,
  SupabaseProductionChain,
  SupabaseResearch,
  SupabaseMarket,
  SupabaseWeather,
  SupabaseWorker,
  SupabaseTransport,
  SupabaseAutomation,
  SupabasePrestigeBonus,
  SupabaseRankThreshold,
  SupabaseQuestDefinition,
  SupabaseDailyReward,
  SupabaseEventTemplate,
  SupabaseSeasonalEvent,
  SupabaseMegaProject,
  SupabaseGameConfig,
  SupabaseBalancingRule,
  GameConfig,
} from "@/lib/game/config";
import type {
  BuildingDefinition,
  ResourceAmount,
  ResourceType,
  CostResourceType,
} from "@/lib/game/types";

// ─── Safe Fetch Helper (moved verbatim from route.ts) ──────────────────

interface SafeFetchResult<T> {
  data: T[] | null;
  error: string | null;
}

async function safeFetchTable<T>(
  supabase: ReturnType<typeof createServiceRoleClient>,
  tableName: string,
  pageSize = 2000,
  useSortOrder = true,
): Promise<SafeFetchResult<T>> {
  if (!supabase) return { data: null, error: "Supabase client not available" };

  try {
    // Tables known to have sort_order column
    const tablesWithSortOrder = new Set([
      "game_config_buildings",
      "game_config_resources",
      "game_config_research",
      "game_config_automation",
      "game_config_workers",
      "game_config_transport",
      "game_config_market",
      "game_config_prestige_bonuses",
      "game_config_quest_definitions",
      "game_config_event_templates",
      "game_config_seasonal_events",
      "game_config_mega_projects",
      "game_config_weather",
      "game_config_balancing_rules",
    ]);

    let query = supabase
      .from(tableName)
      .select("*")
      .range(0, pageSize - 1);

    if (useSortOrder && tablesWithSortOrder.has(tableName)) {
      query = query.order("sort_order", { ascending: true, nullsFirst: false });
    }

    const { data, error } = await query;
    if (error) return { data: null, error: error.message };
    return { data: (data as T[]) ?? [], error: null };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

// ─── Transforms (moved verbatim from /api/game/definitions/route.ts) ───

const ID_MIGRATION_MAP: Record<string, string | string[]> = {
  miningDrill: "ironMine",
  quarry: "sandMine",
  goldsmith: "jewelleryForge",
};

function parseCostMap(
  costMap:
    Record<string, number> | Array<{ resource: string; amount: number }> | null,
): ResourceAmount[] {
  if (!costMap) return [{ resource: "money", amount: 100 }];
  if (Array.isArray(costMap)) {
    return costMap.map((item) => ({
      resource: item.resource as CostResourceType,
      amount: item.amount,
    }));
  }
  return Object.entries(costMap).map(([resource, amount]) => ({
    resource: resource as CostResourceType,
    amount,
  }));
}

function transformBuildings(
  buildings: SupabaseBuilding[],
  recipes: SupabaseRecipe[],
): Record<string, BuildingDefinition> {
  const result: Record<string, BuildingDefinition> = {};
  for (const b of buildings) {
    const buildingRecipes = recipes.filter((r) => r.building_id === b.id);
    const inputs: ResourceAmount[] = buildingRecipes
      .filter((r) => r.is_input)
      .map((r) => ({
        resource: r.resource_id as ResourceType,
        amount: r.amount,
      }));
    const outputs: ResourceAmount[] = buildingRecipes
      .filter((r) => !r.is_input)
      .map((r) => ({
        resource: r.resource_id as ResourceType,
        amount: r.amount,
      }));

    result[b.id] = {
      type: b.id as BuildingDefinition["type"],
      name: b.name,
      description: b.description,
      category: b.category as BuildingDefinition["category"],
      tier: b.tier,
      baseCost: parseCostMap(b.base_cost),
      costMultiplier: b.cost_multiplier,
      basePowerConsumption: b.base_power_consumption,
      basePowerProduction: b.base_power_production,
      baseProductionRate: b.base_production_rate,
      ...(inputs.length > 0 ? { inputs } : {}),
      ...(outputs.length > 0 ? { outputs } : {}),
      ...(b.fuel ? { fuel: b.fuel as ResourceType } : {}),
      ...(b.fuel_rate ? { fuelRate: b.fuel_rate } : {}),
      ...(b.unlock_research || b.unlock_prestige
        ? {
            unlockRequirement: {
              ...(b.unlock_research ? { research: b.unlock_research } : {}),
              ...(b.unlock_prestige ? { prestige: b.unlock_prestige } : {}),
            },
          }
        : {}),
      icon: b.icon || "",
    };
  }
  return result;
}

function transformResources(
  resources: SupabaseResource[],
): GameConfig["resources"] {
  const result: GameConfig["resources"] = {};
  for (const r of resources) {
    result[r.id] = {
      name: r.name || r.id,
      icon: r.icon || "game-icons:question",
      tier: r.tier ?? 0,
      color: r.color || "#a0a0a0",
      category: r.category || "misc",
      baseCapacity: r.base_capacity ?? 100,
    };
  }
  return result;
}

function transformResearch(
  research: SupabaseResearch[],
): GameConfig["research"] {
  return research.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    tier: r.tier,
    cost: r.cost,
    timeRequired: r.time_required,
    prerequisites: r.prerequisites || [],
    effects: (r.effects as unknown as Record<string, unknown>[]) || [],
    icon: r.icon,
  }));
}

function transformMarket(market: SupabaseMarket[]): GameConfig["market"] {
  return market.map((m) => ({
    resource: m.resource_id,
    basePrice: m.base_price,
    demand: m.demand,
    supply: m.supply,
    volatility: m.volatility,
    isTradable: m.is_tradable,
  }));
}

function transformWeather(weather: SupabaseWeather[]): GameConfig["weather"] {
  const result: GameConfig["weather"] = {};
  for (const w of weather) {
    result[w.id] = {
      name: w.name,
      icon: w.icon,
      productionMultiplier: w.production_multiplier,
      solarMultiplier: w.solar_multiplier,
      windMultiplier: w.wind_multiplier,
      description: w.description,
    };
  }
  return result;
}

// ─── Public API ─────────────────────────────────────────────────────────

export interface FetchConfigResult {
  /** The merged GameConfig — `null` if critical tables failed. */
  config: GameConfig | null;
  /** Per-table error messages (non-critical failures). */
  partialErrors: string[];
  /** Raw `idMigrationMap` for response payload (route.ts uses this). */
  idMigrationMap: Record<string, string | string[]>;
}

// Note: tradableResourceIds is set below in the result literal (single source of truth).

/**
 * Fetch the full GameConfig from Supabase directly via the service-role client.
 *
 * Returns:
 * - `{ config: null, ... }` only if the three critical tables (buildings,
 *   resources, recipes) fail — in that case callers MUST treat this as fatal.
 * - Otherwise `{ config: GameConfig, partialErrors, idMigrationMap }` even
 *   if some non-critical tables failed. Callers may continue with partial data.
 *
 * Note: behavior is intentionally equivalent to the previous
 * /api/game/definitions handler — refactor moves SQL surface area only.
 */
export async function fetchGameConfigFromSupabase(): Promise<FetchConfigResult> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      config: null,
      partialErrors: ["Service role client not configured"],
      idMigrationMap: ID_MIGRATION_MAP,
    };
  }

  const errors: string[] = [];

  const [
    buildingsRes,
    resourcesRes,
    recipesRes,
    chainsRes,
    researchRes,
    marketRes,
    weatherRes,
    workersRes,
    transportRes,
    automationRes,
    prestigeRes,
    rankRes,
    questsRes,
    dailyRes,
    eventsRes,
    seasonalRes,
    megaRes,
    gameRes,
    rulesRes,
  ] = await Promise.all([
    safeFetchTable<SupabaseBuilding>(supabase, "game_config_buildings"),
    safeFetchTable<SupabaseResource>(supabase, "game_config_resources"),
    safeFetchTable<SupabaseRecipe>(supabase, "game_config_production_recipes"),
    safeFetchTable<SupabaseProductionChain>(
      supabase,
      "game_config_production_chains",
    ),
    safeFetchTable<SupabaseResearch>(supabase, "game_config_research"),
    safeFetchTable<SupabaseMarket>(supabase, "game_config_market"),
    safeFetchTable<SupabaseWeather>(supabase, "game_config_weather"),
    safeFetchTable<SupabaseWorker>(supabase, "game_config_workers"),
    safeFetchTable<SupabaseTransport>(supabase, "game_config_transport"),
    safeFetchTable<SupabaseAutomation>(supabase, "game_config_automation"),
    safeFetchTable<SupabasePrestigeBonus>(
      supabase,
      "game_config_prestige_bonuses",
    ),
    safeFetchTable<SupabaseRankThreshold>(
      supabase,
      "game_config_rank_thresholds",
    ),
    safeFetchTable<SupabaseQuestDefinition>(
      supabase,
      "game_config_quest_definitions",
    ),
    safeFetchTable<SupabaseDailyReward>(supabase, "game_config_daily_rewards"),
    safeFetchTable<SupabaseEventTemplate>(
      supabase,
      "game_config_event_templates",
    ),
    safeFetchTable<SupabaseSeasonalEvent>(
      supabase,
      "game_config_seasonal_events",
    ),
    safeFetchTable<SupabaseMegaProject>(supabase, "game_config_mega_projects"),
    safeFetchTable<SupabaseGameConfig>(supabase, "game_config_game"),
    safeFetchTable<SupabaseBalancingRule>(
      supabase,
      "game_config_balancing_rules",
    ),
  ]);

  // Collect per-table errors
  if (buildingsRes.error) errors.push(`buildings: ${buildingsRes.error}`);
  if (resourcesRes.error) errors.push(`resources: ${resourcesRes.error}`);
  if (recipesRes.error) errors.push(`recipes: ${recipesRes.error}`);
  if (chainsRes.error) errors.push(`chains: ${chainsRes.error}`);
  if (researchRes.error) errors.push(`research: ${researchRes.error}`);
  if (marketRes.error) errors.push(`market: ${marketRes.error}`);
  if (weatherRes.error) errors.push(`weather: ${weatherRes.error}`);
  if (workersRes.error) errors.push(`workers: ${workersRes.error}`);
  if (transportRes.error) errors.push(`transport: ${transportRes.error}`);
  if (automationRes.error) errors.push(`automation: ${automationRes.error}`);
  if (prestigeRes.error) errors.push(`prestige: ${prestigeRes.error}`);
  if (rankRes.error) errors.push(`rank: ${rankRes.error}`);
  if (questsRes.error) errors.push(`quests: ${questsRes.error}`);
  if (dailyRes.error) errors.push(`daily: ${dailyRes.error}`);
  if (eventsRes.error) errors.push(`events: ${eventsRes.error}`);
  if (seasonalRes.error) errors.push(`seasonal: ${seasonalRes.error}`);
  if (megaRes.error) errors.push(`mega: ${megaRes.error}`);
  if (gameRes.error) errors.push(`game: ${gameRes.error}`);

  // Critical check: buildings, resources, and recipes are required
  if (!buildingsRes.data || !resourcesRes.data || !recipesRes.data) {
    return {
      config: null,
      partialErrors: [
        ...errors,
        "Critical tables (buildings/resources/recipes) failed to load",
      ],
      idMigrationMap: ID_MIGRATION_MAP,
    };
  }

  const transformedMarket = transformMarket(marketRes.data ?? []);

  const config: GameConfig = {
    buildings: transformBuildings(buildingsRes.data, recipesRes.data),
    resources: transformResources(resourcesRes.data),
    research: transformResearch(researchRes.data ?? []),
    market: transformedMarket,
    tradableResourceIds: transformedMarket
      .filter((m) => m.isTradable)
      .map((m) => m.resource),
    weather: transformWeather(weatherRes.data ?? []),
    workers: (workersRes.data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      baseHireCost: w.base_hire_cost,
      effects: w.effects,
      icon: w.icon,
    })),
    transport: (transportRes.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      baseCost: parseCostMap(t.base_cost),
      baseThroughput: t.base_throughput,
      upgradeMultiplier: t.upgrade_multiplier,
      icon: t.icon,
    })),
    automation: (automationRes.data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      cost: a.cost,
      requiresResearch: a.requires_research,
      icon: a.icon,
    })),
    prestigeBonuses: (prestigeRes.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      cost: p.cost,
      effect: p.effect,
    })),
    rankThresholds: (rankRes.data ?? []).map((r) => ({
      rank: r.rank,
      name: r.name,
      scoreRequired: r.score_required,
    })),
    quests: (questsRes.data ?? []).map((q) => ({
      id: q.id,
      name: q.name,
      description: q.description,
      type: q.type,
      category: q.category,
      gameTier: q.game_tier,
      steps: q.steps,
      reward: q.reward,
      targetResource: q.target_resource,
      targetBuilding: q.target_building,
      icon: q.icon,
    })),
    dailyRewards: (dailyRes.data ?? []).map((d) => ({
      day: d.day,
      type: d.type,
      amount: d.amount,
      resourceId: d.resource_id,
    })),
    eventTemplates: (eventsRes.data ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      type: e.type,
      duration: e.duration,
      effects: e.effects,
      icon: e.icon,
    })),
    seasonalEvents: (seasonalRes.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      season: s.season,
      startDate: s.start_date,
      endDate: s.end_date,
      effects: s.effects,
      rewards: s.rewards,
      icon: s.icon,
      isActive: s.is_active,
    })),
    megaProjects: (megaRes.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      icon: m.icon,
      stages: m.stages,
      bonus: m.bonus,
      unlockRequirement: m.unlock_requirement,
    })),
    gameConfig: (gameRes.data?.[0] as Record<string, unknown>) ?? {},
    balancingRules: (rulesRes.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category,
      target: r.target,
      multiplier: r.multiplier,
      isActive: r.is_active,
    })),
    productionChains: (chainsRes.data ?? []).map((c) => ({
      id: c.id,
      upstreamBuilding: c.upstream_building,
      downstreamBuilding: c.downstream_building,
      resourceId: c.resource_id,
    })),
    loadedAt: Date.now(),
    source: "supabase",
  };

  return {
    config,
    partialErrors: errors,
    idMigrationMap: ID_MIGRATION_MAP,
  };
}
