import { getDbClient } from '@/lib/db/access';
import {
  DEFAULT_BALANCE_SUBSET,
  type GameConfig,
  type SupabaseBuilding,
  type SupabaseMarket,
  type SupabaseProductionChain,
  type SupabaseRecipe,
  type SupabaseResearch,
  type SupabaseWeather,
  type SupabaseWorker,
} from "@/lib/game/config/config";
import { CONFIG_TABLE_COLUMNS } from "@/lib/db/types";
import type {
  BuildingDefinition,
  CostResourceType,
  ResourceAmount,
  ResourceType,
} from "@/lib/game/shared/types/types";

let cachedConfig: GameConfig | null = null;
let configFetchedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

function rememberConfig(config: GameConfig, fetchedAt: number): GameConfig {
  cachedConfig = config;
  configFetchedAt = fetchedAt;
  return config;
}

function parseCostMap(
  costMap:
    | Record<string, number>
    | Array<{ resource: string; amount: number }>
    | null,
): ResourceAmount[] {
  // C-005 (BUILDING_PRODUCTION_AUDIT §10.6 P1, 2026-07-16): fail closed
  // on missing or null cost. Matches the offline-progress route.
  if (!costMap) {
    throw new Error(
      "[parseCostMap] building has null/missing base_cost — refusing to fabricate a cost",
    );
  }
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

export async function loadInvestigationFullConfig(): Promise<GameConfig | null> {
  if (cachedConfig && Date.now() - configFetchedAt < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  const supabase = getDbClient();
  if (!supabase) {
    throw new Error("Supabase service role not configured");
  }

  try {
    const [
      buildingsRes,
      recipesRes,
      researchRes,
      chainsRes,
      workersRes,
      weatherRes,
      marketRes,
    ] = await Promise.all([
      supabase.from("game_config_buildings").select(CONFIG_TABLE_COLUMNS.game_config_buildings)
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase.from("game_config_production_recipes").select(CONFIG_TABLE_COLUMNS.game_config_production_recipes),
      supabase.from("game_config_research").select(CONFIG_TABLE_COLUMNS.game_config_research)
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase.from("game_config_production_chains").select(CONFIG_TABLE_COLUMNS.game_config_production_chains),
      supabase.from("game_config_workers").select(CONFIG_TABLE_COLUMNS.game_config_workers)
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase.from("game_config_weather").select(CONFIG_TABLE_COLUMNS.game_config_weather)
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase.from("game_config_market").select(CONFIG_TABLE_COLUMNS.game_config_market)
        .order("sort_order", { ascending: true, nullsFirst: false }),
    ]);

    if (buildingsRes.error || !buildingsRes.data) {
      console.error(
        "[Admin/Investigations] Failed to fetch buildings:",
        buildingsRes.error,
      );
      return null;
    }
    if (recipesRes.error || !recipesRes.data) {
      console.error(
        "[Admin/Investigations] Failed to fetch recipes:",
        recipesRes.error,
      );
      return null;
    }

    const buildings = buildingsRes.data as SupabaseBuilding[];
    const recipes = recipesRes.data as SupabaseRecipe[];
    const research = (researchRes.data as SupabaseResearch[]) ?? [];
    const chains = (chainsRes.data as SupabaseProductionChain[]) ?? [];
    const workers = (workersRes.data as SupabaseWorker[]) ?? [];
    const weather = (weatherRes.data as SupabaseWeather[]) ?? [];
    const market = (marketRes.data as SupabaseMarket[]) ?? [];

    const buildingsMap: Record<string, BuildingDefinition> = {};
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

      buildingsMap[b.id] = {
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
        icon: b.icon,
      };
    }

    const weatherMap: GameConfig["weather"] = {};
    for (const w of weather) {
      weatherMap[w.id] = {
        name: w.name,
        icon: w.icon,
        productionMultiplier: w.production_multiplier,
        solarMultiplier: w.solar_multiplier,
        windMultiplier: w.wind_multiplier,
        description: w.description,
      };
    }

    const fetchedAt = Date.now();
    const config: GameConfig = {
      buildings: buildingsMap,
      resources: {},
      research: research.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        tier: r.tier,
        cost: r.cost,
        timeRequired: r.time_required,
        prerequisites: r.prerequisites || [],
        effects: (r.effects as Record<string, unknown>[]) || [],
        icon: r.icon,
      })),
      market: market.map((m) => ({
        resource: m.resource_id,
        basePrice: m.base_price,
        demand: m.demand,
        supply: m.supply,
        volatility: m.volatility,
        isTradable: m.is_tradable,
      })),
      tradableResourceIds: market
        .filter((m) => m.is_tradable)
        .map((m) => m.resource_id),
      weather: weatherMap,
      workers: workers.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        baseHireCost: w.base_hire_cost,
        effects: w.effects,
        icon: w.icon,
      })),
      transport: [],
      automation: [],
      prestigeBonuses: [],
      rankThresholds: [],
      quests: [],
      dailyRewards: [],
      eventTemplates: [],
      seasonalEvents: [],
      megaProjects: [],
      gameConfig: {},
      balance: DEFAULT_BALANCE_SUBSET,
      productionChains: chains.map((c) => ({
        id: c.id,
        upstreamBuilding: c.upstream_building,
        downstreamBuilding: c.downstream_building,
        resourceId: c.resource_id,
      })),
      loadedAt: fetchedAt,
      source: "supabase",
    };

    return rememberConfig(config, fetchedAt);
  } catch (err) {
    console.error("[Admin/Investigations] Failed to load config:", err);
    return null;
  }
}
