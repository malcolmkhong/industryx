import {
  DEFAULT_BALANCE_SUBSET,
  type GameConfig,
  type SupabaseBuilding,
  type SupabaseProductionChain,
  type SupabaseRecipe,
  type SupabaseResearch,
} from "@/lib/game/config/config";
import { CONFIG_TABLE_COLUMNS } from "@/lib/db/types";
import type {
  BuildingDefinition,
  ResourceAmount,
  ResourceType,
} from "@/lib/game/shared/types/types";
import { createServiceRoleClient } from '@/lib/db/access';;
import {
  getCachedConfig,
  isConfigCacheFresh,
  rememberConfig,
} from "./configCache";
import { parseCostMap } from "./configParsers";

/**
 * Load the runtime game config from Supabase, with a short TTL cache.
 *
 * Returns `null` on any DB or query failure — callers MUST treat
 * `null` as "service unavailable" and refuse the action (SEC-002).
 */
export async function loadConfig(): Promise<GameConfig | null> {
  if (isConfigCacheFresh()) {
    return getCachedConfig();
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    throw new Error("Supabase service role not configured");
  }

  try {
    const [buildingsRes, recipesRes, researchRes, chainsRes] =
      await Promise.all([
        supabase.from("game_config_buildings").select(CONFIG_TABLE_COLUMNS.game_config_buildings)
          .order("sort_order", { ascending: true, nullsFirst: false }),
        supabase.from("game_config_production_recipes").select(CONFIG_TABLE_COLUMNS.game_config_production_recipes),
        supabase.from("game_config_research").select(CONFIG_TABLE_COLUMNS.game_config_research)
          .order("sort_order", { ascending: true, nullsFirst: false }),
        supabase.from("game_config_production_chains").select(CONFIG_TABLE_COLUMNS.game_config_production_chains),
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