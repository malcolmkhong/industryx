import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  DEFAULT_BALANCE_SUBSET,
  type GameConfig,
  type SupabaseBuilding,
  type SupabaseProductionChain,
  type SupabaseRecipe,
  type SupabaseResearch,
} from "@/lib/game/config/config";
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

export async function loadConfig(): Promise<GameConfig | null> {
  if (cachedConfig && Date.now() - configFetchedAt < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    throw new Error("Supabase service role not configured");
  }

  try {
    const [buildingsRes, recipesRes, researchRes, chainsRes] =
      await Promise.all([
        supabase
          .from("game_config_buildings")
          .select("*")
          .order("sort_order", { ascending: true, nullsFirst: false }),
        supabase.from("game_config_production_recipes").select("*"),
        supabase
          .from("game_config_research")
          .select("*")
          .order("sort_order", { ascending: true, nullsFirst: false }),
        supabase.from("game_config_production_chains").select("*"),
      ]);

    if (buildingsRes.error || !buildingsRes.data) {
      console.error(
        "[ActionAPI] Failed to fetch buildings:",
        buildingsRes.error,
      );
      return null;
    }
    if (recipesRes.error || !recipesRes.data) {
      console.error("[ActionAPI] Failed to fetch recipes:", recipesRes.error);
      return null;
    }
    if (researchRes.error || !researchRes.data) {
      console.error("[ActionAPI] Failed to fetch research:", researchRes.error);
      return null;
    }

    const buildings = buildingsRes.data as SupabaseBuilding[];
    const recipes = recipesRes.data as SupabaseRecipe[];
    const research = researchRes.data as SupabaseResearch[];
    const chains = (chainsRes.data as SupabaseProductionChain[]) ?? [];

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

    const researchList = research.map((r) => ({
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
    }));

    const fetchedAt = Date.now();
    const config: GameConfig = {
      buildings: buildingsMap,
      resources: {},
      research: researchList,
      market: [],
      weather: {},
      workers: [],
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
      tradableResourceIds: [],
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
    console.error("[ActionAPI] Failed to load config:", err);
    return null;
  }
}
