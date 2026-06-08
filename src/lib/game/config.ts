// ============================================
// FACTORY DOMINION: Game Config System
// Fetches and transforms Supabase config data
// into the game's existing type format
// ============================================

import { BuildingDefinition, ResourceAmount, ResourceType } from './types';

// --- Supabase Row Types (raw DB shapes) ---

export interface SupabaseBuilding {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: number;
  base_cost: Record<string, number>; // e.g. { money: 500 }
  cost_multiplier: number;
  base_power_consumption: number;
  base_power_production: number;
  cycle_time: number;
  building_multiplier: number;
  base_production_rate: number;
  fuel: string | null;
  fuel_rate: number | null;
  unlock_research: string | null;
  unlock_prestige: number | null;
  icon: string;
  sort_order: number;
}

export interface SupabaseResource {
  id: string;
  name: string;
  icon: string;
  tier: number;
  color: string;
  category: string;
  sort_order: number;
}

export interface SupabaseRecipe {
  id: string;
  building_id: string;
  resource_id: string;
  is_input: boolean;
  amount: number;
}

export interface SupabaseProductionChain {
  id: string;
  upstream_building: string;
  downstream_building: string;
  resource_id: string;
}

export interface SupabaseResearch {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: number;
  cost: number;
  time_required: number;
  prerequisites: string[] | null;
  effects: Record<string, unknown>[] | null;
  icon: string;
  sort_order: number;
}

export interface SupabaseMarket {
  resource_id: string;
  base_price: number;
  demand: number;
  supply: number;
  volatility: number;
  sort_order: number;
}

export interface SupabaseWeather {
  id: string;
  name: string;
  icon: string;
  production_multiplier: number;
  solar_multiplier: number;
  wind_multiplier: number;
  description: string;
  sort_order: number;
}

export interface SupabaseWorker {
  id: string;
  name: string;
  description: string;
  base_hire_cost: number;
  effects: Record<string, unknown>;
  icon: string;
  sort_order: number;
}

export interface SupabaseTransport {
  id: string;
  name: string;
  description: string;
  base_cost: Record<string, number>;
  base_throughput: number;
  upgrade_multiplier: number;
  icon: string;
  sort_order: number;
}

export interface SupabaseAutomation {
  id: string;
  name: string;
  description: string;
  cost: number;
  requires_research: string | null;
  icon: string;
  sort_order: number;
}

export interface SupabasePrestigeBonus {
  id: string;
  name: string;
  description: string;
  cost: number;
  effect: Record<string, unknown>;
  sort_order: number;
}

export interface SupabaseRankThreshold {
  rank: number;
  name: string;
  score_required: number;
}

export interface SupabaseQuestDefinition {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  game_tier: number;
  steps: Record<string, unknown>[];
  reward: Record<string, unknown>;
  target_resource: string | null;
  target_building: string | null;
  icon: string;
  sort_order: number;
}

export interface SupabaseDailyReward {
  day: number;
  type: string;
  amount: number;
  resource_id: string | null;
}

export interface SupabaseEventTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  duration: number;
  effects: Record<string, unknown>[];
  icon: string;
  sort_order: number;
}

export interface SupabaseSeasonalEvent {
  id: string;
  name: string;
  description: string;
  season: string;
  start_date: string;
  end_date: string;
  effects: Record<string, unknown>[];
  rewards: Record<string, unknown>[];
  icon: string;
  is_active: boolean;
  sort_order: number;
}

export interface SupabaseMegaProject {
  id: string;
  name: string;
  description: string;
  icon: string;
  stages: Record<string, unknown>[];
  bonus: Record<string, unknown>;
  unlock_requirement: Record<string, unknown>;
  sort_order: number;
}

export interface SupabaseGameConfig {
  id: string;
  [key: string]: unknown; // 40+ numeric config columns
}

export interface SupabaseBalancingRule {
  id: string;
  name: string;
  description: string;
  category: string;
  target: string;
  multiplier: number;
  is_active: boolean;
  effective_from: string | null;
  effective_until: string | null;
}

// --- Transformed Game Config (what the frontend consumes) ---

export interface GameConfig {
  buildings: Record<string, BuildingDefinition>;
  resources: Record<string, { name: string; icon: string; tier: number; color: string; category: string }>;
  research: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    tier: number;
    cost: number;
    timeRequired: number;
    prerequisites: string[];
    effects: Record<string, unknown>[];
    icon: string;
  }>;
  market: Array<{
    resource: string;
    basePrice: number;
    demand: number;
    supply: number;
    volatility: number;
  }>;
  weather: Record<string, {
    name: string;
    icon: string;
    productionMultiplier: number;
    solarMultiplier: number;
    windMultiplier: number;
    description: string;
  }>;
  workers: Array<{
    id: string;
    name: string;
    description: string;
    baseHireCost: number;
    effects: Record<string, unknown>;
    icon: string;
  }>;
  transport: Array<{
    id: string;
    name: string;
    description: string;
    baseCost: ResourceAmount[];
    baseThroughput: number;
    upgradeMultiplier: number;
    icon: string;
  }>;
  automation: Array<{
    id: string;
    name: string;
    description: string;
    cost: number;
    requiresResearch: string | null;
    icon: string;
  }>;
  prestigeBonuses: Array<{
    id: string;
    name: string;
    description: string;
    cost: number;
    effect: Record<string, unknown>;
  }>;
  rankThresholds: Array<{
    rank: number;
    name: string;
    scoreRequired: number;
  }>;
  quests: Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    category: string;
    gameTier: number;
    steps: Record<string, unknown>[];
    reward: Record<string, unknown>;
    targetResource: string | null;
    targetBuilding: string | null;
    icon: string;
  }>;
  dailyRewards: Array<{
    day: number;
    type: string;
    amount: number;
    resourceId: string | null;
  }>;
  eventTemplates: Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    duration: number;
    effects: Record<string, unknown>[];
    icon: string;
  }>;
  seasonalEvents: Array<{
    id: string;
    name: string;
    description: string;
    season: string;
    startDate: string;
    endDate: string;
    effects: Record<string, unknown>[];
    rewards: Record<string, unknown>[];
    icon: string;
    isActive: boolean;
  }>;
  megaProjects: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    stages: Record<string, unknown>[];
    bonus: Record<string, unknown>;
    unlockRequirement: Record<string, unknown>;
  }>;
  gameConfig: Record<string, unknown>;
  balancingRules: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    target: string;
    multiplier: number;
    isActive: boolean;
  }>;
  productionChains: Array<{
    id: string;
    upstreamBuilding: string;
    downstreamBuilding: string;
    resourceId: string;
  }>;
  // Metadata
  loadedAt: number;
  source: 'supabase' | 'fallback';
}

// --- Data Transformers ---

function parseCostMap(costMap: Record<string, number> | null): ResourceAmount[] {
  if (!costMap) return [{ resource: 'money', amount: 100 }];
  return Object.entries(costMap).map(([resource, amount]) => ({
    resource: resource as CostResourceType,
    amount,
  }));
}

type CostResourceType = ResourceType | 'money';

function transformBuildings(
  buildings: SupabaseBuilding[],
  recipes: SupabaseRecipe[]
): Record<string, BuildingDefinition> {
  const result: Record<string, BuildingDefinition> = {};

  for (const b of buildings) {
    const buildingRecipes = recipes.filter(r => r.building_id === b.id);
    const inputs: ResourceAmount[] = buildingRecipes
      .filter(r => r.is_input)
      .map(r => ({ resource: r.resource_id as ResourceType, amount: r.amount }));
    const outputs: ResourceAmount[] = buildingRecipes
      .filter(r => !r.is_input)
      .map(r => ({ resource: r.resource_id as ResourceType, amount: r.amount }));

    result[b.id] = {
      type: b.id as BuildingDefinition['type'],
      name: b.name,
      description: b.description,
      category: b.category as BuildingDefinition['category'],
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
      ...(b.unlock_research || b.unlock_prestige ? {
        unlockRequirement: {
          ...(b.unlock_research ? { research: b.unlock_research } : {}),
          ...(b.unlock_prestige ? { prestige: b.unlock_prestige } : {}),
        }
      } : {}),
      icon: b.icon,
    };
  }

  return result;
}

function transformResources(resources: SupabaseResource[]): GameConfig['resources'] {
  const result: GameConfig['resources'] = {};
  for (const r of resources) {
    result[r.id] = {
      name: r.name,
      icon: r.icon,
      tier: r.tier,
      color: r.color,
      category: r.category,
    };
  }
  return result;
}

function transformResearch(research: SupabaseResearch[]): GameConfig['research'] {
  return research.map(r => ({
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
}

function transformMarket(market: SupabaseMarket[]): GameConfig['market'] {
  return market.map(m => ({
    resource: m.resource_id,
    basePrice: m.base_price,
    demand: m.demand,
    supply: m.supply,
    volatility: m.volatility,
  }));
}

function transformWeather(weather: SupabaseWeather[]): GameConfig['weather'] {
  const result: GameConfig['weather'] = {};
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

// --- Config Loader ---

export async function fetchGameConfig(): Promise<GameConfig | null> {
  try {
    // Fetch all config tables in parallel
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
      fetch('/api/config?table=game_config_buildings&pageSize=2000'),
      fetch('/api/config?table=game_config_resources&pageSize=2000'),
      fetch('/api/config?table=game_config_production_recipes&pageSize=2000'),
      fetch('/api/config?table=game_config_production_chains&pageSize=2000'),
      fetch('/api/config?table=game_config_research&pageSize=2000'),
      fetch('/api/config?table=game_config_market&pageSize=2000'),
      fetch('/api/config?table=game_config_weather&pageSize=2000'),
      fetch('/api/config?table=game_config_workers&pageSize=2000'),
      fetch('/api/config?table=game_config_transport&pageSize=2000'),
      fetch('/api/config?table=game_config_automation&pageSize=2000'),
      fetch('/api/config?table=game_config_prestige_bonuses&pageSize=2000'),
      fetch('/api/config?table=game_config_rank_thresholds&pageSize=2000'),
      fetch('/api/config?table=game_config_quest_definitions&pageSize=2000'),
      fetch('/api/config?table=game_config_daily_rewards&pageSize=2000'),
      fetch('/api/config?table=game_config_event_templates&pageSize=2000'),
      fetch('/api/config?table=game_config_seasonal_events&pageSize=2000'),
      fetch('/api/config?table=game_config_mega_projects&pageSize=2000'),
      fetch('/api/config?table=game_config_game&pageSize=2000'),
      fetch('/api/config?table=game_config_balancing_rules&pageSize=2000'),
    ]);

    // Check if any critical fetch failed
    if (!buildingsRes.ok || !resourcesRes.ok || !recipesRes.ok) {
      console.warn('[GameConfig] Critical tables fetch failed, will use fallback');
      return null;
    }

    const [buildings, resources, recipes, chains, research, market, weather, workers, transport, automation, prestige, rank, quests, daily, events, seasonal, mega, game, rules] = await Promise.all([
      buildingsRes.json(),
      resourcesRes.json(),
      recipesRes.json(),
      chainsRes.json(),
      researchRes.json(),
      marketRes.json(),
      weatherRes.json(),
      workersRes.json(),
      transportRes.json(),
      automationRes.json(),
      prestigeRes.json(),
      rankRes.json(),
      questsRes.json(),
      dailyRes.json(),
      eventsRes.json(),
      seasonalRes.json(),
      megaRes.json(),
      gameRes.json(),
      rulesRes.json(),
    ]);

    const config: GameConfig = {
      buildings: transformBuildings(buildings.data || [], recipes.data || []),
      resources: transformResources(resources.data || []),
      research: transformResearch(research.data || []),
      market: transformMarket(market.data || []),
      weather: transformWeather(weather.data || []),
      workers: (workers.data || []).map((w: SupabaseWorker) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        baseHireCost: w.base_hire_cost,
        effects: w.effects,
        icon: w.icon,
      })),
      transport: (transport.data || []).map((t: SupabaseTransport) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        baseCost: parseCostMap(t.base_cost),
        baseThroughput: t.base_throughput,
        upgradeMultiplier: t.upgrade_multiplier,
        icon: t.icon,
      })),
      automation: (automation.data || []).map((a: SupabaseAutomation) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        cost: a.cost,
        requiresResearch: a.requires_research,
        icon: a.icon,
      })),
      prestigeBonuses: (prestige.data || []).map((p: SupabasePrestigeBonus) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        cost: p.cost,
        effect: p.effect,
      })),
      rankThresholds: (rank.data || []).map((r: SupabaseRankThreshold) => ({
        rank: r.rank,
        name: r.name,
        scoreRequired: r.score_required,
      })),
      quests: (quests.data || []).map((q: SupabaseQuestDefinition) => ({
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
      dailyRewards: (daily.data || []).map((d: SupabaseDailyReward) => ({
        day: d.day,
        type: d.type,
        amount: d.amount,
        resourceId: d.resource_id,
      })),
      eventTemplates: (events.data || []).map((e: SupabaseEventTemplate) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        type: e.type,
        duration: e.duration,
        effects: e.effects,
        icon: e.icon,
      })),
      seasonalEvents: (seasonal.data || []).map((s: SupabaseSeasonalEvent) => ({
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
      megaProjects: (mega.data || []).map((m: SupabaseMegaProject) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        icon: m.icon,
        stages: m.stages,
        bonus: m.bonus,
        unlockRequirement: m.unlock_requirement,
      })),
      gameConfig: game.data?.[0] || {},
      balancingRules: (rules.data || []).map((r: SupabaseBalancingRule) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        target: r.target,
        multiplier: r.multiplier,
        isActive: r.is_active,
      })),
      productionChains: (chains.data || []).map((c: SupabaseProductionChain) => ({
        id: c.id,
        upstreamBuilding: c.upstream_building,
        downstreamBuilding: c.downstream_building,
        resourceId: c.resource_id,
      })),
      loadedAt: Date.now(),
      source: 'supabase',
    };

    console.log(`[GameConfig] Loaded from Supabase: ${Object.keys(config.buildings).length} buildings, ${Object.keys(config.resources).length} resources`);
    return config;
  } catch (error) {
    console.warn('[GameConfig] Failed to load from Supabase, will use fallback:', error);
    return null;
  }
}
