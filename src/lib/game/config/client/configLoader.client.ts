import { type GameConfig, DEFAULT_BALANCE_SUBSET } from "../types/gameConfig";
import type {
  SupabaseProductionChain,
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
  SupabaseBalancingRule,
} from "../types/supabaseRows";
import {
  transformBuildings,
  transformResources,
  transformResearch,
  transformMarket,
  transformWeather,
  parseCostMap,
} from "../transformers/index";

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
      fetch('/api/admin/config?table=game_config_buildings&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_resources&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_production_recipes&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_production_chains&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_research&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_market&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_weather&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_workers&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_transport&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_automation&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_prestige_bonuses&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_rank_thresholds&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_quest_definitions&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_daily_rewards&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_event_templates&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_seasonal_events&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_mega_projects&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_game&pageSize=2000'),
      fetch('/api/admin/config?table=game_config_balancing_rules&pageSize=2000'),
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
      balance: DEFAULT_BALANCE_SUBSET,
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
      tradableResourceIds: [],
      loadedAt: Date.now(),
      source: 'supabase',
    };

    // Quietly loaded — debug via dev tools if needed.
    return config;
  } catch (error) {
    console.warn('[GameConfig] Failed to load from Supabase, will use fallback:', error);
    return null;
  }
}
