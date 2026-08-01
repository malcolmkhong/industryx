/**
 * Autonoma test-data — static game-config factories.
 *
 * Every config table here uses `id` (or another text column) as a PK.
 * Factories prepend a per-run short hash so two concurrent runs don't
 * collide on the natural PK.
 */

import { defineFactory } from "@autonoma-ai/sdk";
import { z } from "zod";

import { ref, requireDb, rid } from "./helpers";

// ─── game_config_resources ──────────────────────────────────────────────

export const gameConfigResourcesFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    tier: z.number().default(0),
    icon: z.string().default("📦"),
    category: z.string().default("standard"),
    baseCapacity: z.number().default(100),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `res-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_resources")
      .upsert(
        {
          id,
          name: data.name,
          icon: data.icon,
          tier: data.tier,
          category: data.category,
          base_capacity: data.baseCapacity,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] game_config_resources: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("game_config_resources").delete().eq("id", record.id);
  },
});

// ─── game_config_buildings ──────────────────────────────────────────────

export const gameConfigBuildingsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    tier: z.number().default(1),
    category: z.string().default("extraction"),
    baseCost: z.record(z.number()).default({ money: 100 }),
    costMultiplier: z.number().default(1.15),
    cycleTime: z.number().default(10),
    basePowerConsumption: z.number().default(0),
    icon: z.string().default("🏭"),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `bld-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_buildings")
      .upsert(
        {
          id,
          name: data.name,
          tier: data.tier,
          category: data.category,
          base_cost: data.baseCost,
          cost_multiplier: data.costMultiplier,
          cycle_time: data.cycleTime,
          base_power_consumption: data.basePowerConsumption,
          icon: data.icon,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] game_config_buildings: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("game_config_buildings").delete().eq("id", record.id);
  },
});

// ─── game_config_research ───────────────────────────────────────────────

export const gameConfigResearchFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    tier: z.number().default(1),
    category: z.string().default("production"),
    cost: z.number().default(50),
    timeRequired: z.number().default(60),
    prerequisites: z.array(z.string()).default([]),
    effects: z.array(z.unknown()).default([]),
    icon: z.string().default("🔬"),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `rsh-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_research")
      .upsert(
        {
          id,
          name: data.name,
          tier: data.tier,
          category: data.category,
          cost: data.cost,
          time_required: data.timeRequired,
          prerequisites: data.prerequisites,
          effects: data.effects,
          icon: data.icon,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] game_config_research: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("game_config_research").delete().eq("id", record.id);
  },
});

// ─── game_config_production_recipes ─────────────────────────────────────

export const gameConfigProductionRecipesFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    buildingBaseId: z.string(),
    resourceId: z.string(),
    isInput: z.boolean().default(true),
    amount: z.number().default(1),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `rec-${data.baseId}`);
    const buildingId = rid(ctx, `bld-${data.buildingBaseId}`);
    const { data: row, error } = await supabase
      .from("game_config_production_recipes")
      .upsert(
        {
          id,
          building_id: buildingId,
          resource_id: data.resourceId,
          is_input: data.isInput,
          amount: data.amount,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(
        `[autonoma] game_config_production_recipes: ${error.message}`,
      );
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_production_recipes")
      .delete()
      .eq("id", record.id);
  },
});

// ─── game_config_production_chains ──────────────────────────────────────

export const gameConfigProductionChainsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    upstreamBaseId: z.string(),
    downstreamBaseId: z.string(),
    resourceId: z.string(),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `chn-${data.baseId}`);
    const upstream = rid(ctx, `bld-${data.upstreamBaseId}`);
    const downstream = rid(ctx, `bld-${data.downstreamBaseId}`);
    const { data: row, error } = await supabase
      .from("game_config_production_chains")
      .upsert(
        {
          id,
          upstream_building: upstream,
          downstream_building: downstream,
          resource_id: data.resourceId,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(
        `[autonoma] game_config_production_chains: ${error.message}`,
      );
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_production_chains")
      .delete()
      .eq("id", record.id);
  },
});

// ─── game_config_automation ─────────────────────────────────────────────

export const gameConfigAutomationFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    cost: z.number().default(1000),
    description: z.string().default(""),
    requiresResearch: z.string().nullable().default(null),
    icon: z.string().default("🤖"),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `aut-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_automation")
      .upsert(
        {
          id,
          name: data.name,
          description: data.description,
          cost: data.cost,
          requires_research: data.requiresResearch,
          icon: data.icon,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] game_config_automation: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("game_config_automation").delete().eq("id", record.id);
  },
});

// ─── game_config_workers ────────────────────────────────────────────────

export const gameConfigWorkersFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    baseHireCost: z.number().default(100),
    effects: z.array(z.unknown()).default([]),
    icon: z.string().default("👷"),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `wrk-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_workers")
      .upsert(
        {
          id,
          name: data.name,
          base_hire_cost: data.baseHireCost,
          effects: data.effects,
          icon: data.icon,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] game_config_workers: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("game_config_workers").delete().eq("id", record.id);
  },
});

// ─── game_config_transport ──────────────────────────────────────────────

export const gameConfigTransportFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    baseCost: z.record(z.number()).default({ money: 500 }),
    baseThroughput: z.number().default(50),
    icon: z.string().default("🚚"),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `trn-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_transport")
      .upsert(
        {
          id,
          name: data.name,
          base_cost: data.baseCost,
          base_throughput: data.baseThroughput,
          icon: data.icon,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] game_config_transport: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("game_config_transport").delete().eq("id", record.id);
  },
});

// ─── game_config_market — PK = resource_id ──────────────────────────────

export const gameConfigMarketFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseResourceId: z.string(),
    basePrice: z.number().default(10),
    demand: z.number().default(1),
    supply: z.number().default(1),
    volatility: z.number().default(0.1),
    sector: z.string().default("raw_minerals"),
    isTradable: z.boolean().default(false),
  }),
  refSchema: z.object({ resource_id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const resourceId = rid(ctx, `mkt-${data.baseResourceId}`);
    const { data: row, error } = await supabase
      .from("game_config_market")
      .upsert(
        {
          resource_id: resourceId,
          base_price: data.basePrice,
          demand: data.demand,
          supply: data.supply,
          volatility: data.volatility,
          sector: data.sector,
          is_tradable: data.isTradable,
        },
        { onConflict: "resource_id" },
      )
      .select("resource_id")
      .single();
    if (error)
      throw new Error(`[autonoma] game_config_market: ${error.message}`);
    return ref({ resource_id: row.resource_id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_market")
      .delete()
      .eq("resource_id", record.resource_id);
  },
});

// ─── game_config_prestige_bonuses ───────────────────────────────────────

export const gameConfigPrestigeBonusesFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    description: z.string().default(""),
    cost: z.number().default(1000),
    effect: z.record(z.unknown()).default({}),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `prs-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_prestige_bonuses")
      .upsert(
        {
          id,
          name: data.name,
          description: data.description,
          cost: data.cost,
          effect: data.effect,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(
        `[autonoma] game_config_prestige_bonuses: ${error.message}`,
      );
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_prestige_bonuses")
      .delete()
      .eq("id", record.id);
  },
});

// ─── game_config_rank_thresholds — PK = rank smallint ────────────────────

export const gameConfigRankThresholdsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    rank: z.number(),
    rankName: z.string(),
    scoreRequired: z.number().default(0),
  }),
  refSchema: z.object({ id: z.number(), rank: z.number() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const runOffset = parseInt(
      ctx.testRunId.replace(/[^0-9]/g, "").slice(-3) || "0",
      10,
    );
    const rank = data.rank + runOffset * 10;
    const { data: row, error } = await supabase
      .from("game_config_rank_thresholds")
      .upsert(
        { rank, name: data.rankName, score_required: data.scoreRequired },
        { onConflict: "rank" },
      )
      .select("rank")
      .single();
    if (error)
      throw new Error(
        `[autonoma] game_config_rank_thresholds: ${error.message}`,
      );
    return ref({ id: row.rank, rank: row.rank });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_rank_thresholds")
      .delete()
      .eq("rank", record.rank);
  },
});

// ─── game_config_quest_definitions ──────────────────────────────────────

export const gameConfigQuestDefinitionsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    description: z.string().default(""),
    questType: z.string().default("build"),
    category: z.string().default("starter"),
    gameTier: z.number().default(1).nullable(),
    steps: z.array(z.unknown()).default([]),
    reward: z.record(z.unknown()).default({}),
    icon: z.string().default("📜"),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `qst-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_quest_definitions")
      .upsert(
        {
          id,
          name: data.name,
          description: data.description,
          type: data.questType,
          category: data.category,
          game_tier: data.gameTier,
          steps: data.steps,
          reward: data.reward,
          icon: data.icon,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(
        `[autonoma] game_config_quest_definitions: ${error.message}`,
      );
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_quest_definitions")
      .delete()
      .eq("id", record.id);
  },
});

// ─── game_config_daily_rewards — PK = day smallint ─────────────────────

export const gameConfigDailyRewardsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    day: z.number(),
    rewardType: z.string().default("money"),
    amount: z.number().default(100),
    resourceId: z.string().nullable().default(null),
  }),
  refSchema: z.object({ id: z.number(), day: z.number() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const runOffset = parseInt(
      ctx.testRunId.replace(/[^0-9]/g, "").slice(-3) || "0",
      10,
    );
    const day = data.day + runOffset * 10;
    const { data: row, error } = await supabase
      .from("game_config_daily_rewards")
      .upsert(
        {
          day,
          type: data.rewardType,
          amount: data.amount,
          resource_id: data.resourceId,
        },
        { onConflict: "day" },
      )
      .select("day")
      .single();
    if (error)
      throw new Error(`[autonoma] game_config_daily_rewards: ${error.message}`);
    return ref({ id: row.day, day: row.day });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_daily_rewards")
      .delete()
      .eq("day", record.day);
  },
});

// ─── game_config_event_templates ────────────────────────────────────────

export const gameConfigEventTemplatesFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    description: z.string().default(""),
    eventType: z.string().default("market_price"),
    duration: z.number().default(3600),
    effects: z.array(z.unknown()).default([]),
    icon: z.string().default("⚡"),
    scope: z.enum(["factory", "global_market"]).default("global_market"),
    selectionWeight: z.number().default(100),
    durationUnit: z.string().default("seconds"),
    durationMin: z.number().default(60),
    durationMax: z.number().default(3600),
    repeatCooldownChecks: z.number().default(0),
    isActive: z.boolean().default(true),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `evt-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_event_templates")
      .upsert(
        {
          id,
          name: data.name,
          description: data.description,
          type: data.eventType,
          duration: data.duration,
          effects: data.effects,
          icon: data.icon,
          scope: data.scope,
          selection_weight: data.selectionWeight,
          duration_unit: data.durationUnit,
          duration_min: data.durationMin,
          duration_max: data.durationMax,
          repeat_cooldown_checks: data.repeatCooldownChecks,
          is_active: data.isActive,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(
        `[autonoma] game_config_event_templates: ${error.message}`,
      );
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_event_templates")
      .delete()
      .eq("id", record.id);
  },
});

// ─── game_config_seasonal_events ────────────────────────────────────────

export const gameConfigSeasonalEventsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    description: z.string().default(""),
    season: z.string().default("S1"),
    startDate: z.string().nullable().default(null),
    endDate: z.string().nullable().default(null),
    effects: z.record(z.unknown()).default({}),
    rewards: z.record(z.unknown()).default({}),
    icon: z.string().default("🎉"),
    isActive: z.boolean().default(true),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `sea-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_seasonal_events")
      .upsert(
        {
          id,
          name: data.name,
          description: data.description,
          season: data.season,
          start_date: data.startDate,
          end_date: data.endDate,
          effects: data.effects,
          rewards: data.rewards,
          icon: data.icon,
          is_active: data.isActive,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(
        `[autonoma] game_config_seasonal_events: ${error.message}`,
      );
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_seasonal_events")
      .delete()
      .eq("id", record.id);
  },
});

// ─── game_config_mega_projects ──────────────────────────────────────────

export const gameConfigMegaProjectsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    description: z.string().default(""),
    icon: z.string().default("🏗️"),
    stages: z.array(z.unknown()).default([]),
    bonus: z.record(z.unknown()).default({}),
    unlockRequirement: z.record(z.unknown()).default({}),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `mga-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_mega_projects")
      .upsert(
        {
          id,
          name: data.name,
          description: data.description,
          icon: data.icon,
          stages: data.stages,
          bonus: data.bonus,
          unlock_requirement: data.unlockRequirement,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] game_config_mega_projects: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_mega_projects")
      .delete()
      .eq("id", record.id);
  },
});

// ─── game_config_game — per-run id ────────────────────────────────────

export const gameConfigGameFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    key: z.string().default("global"),
    startingMoney: z.number().default(1000),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `gg-${data.key}`);
    const { data: row, error } = await supabase
      .from("game_config_game")
      .upsert({ id, starting_money: data.startingMoney }, { onConflict: "id" })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] game_config_game: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("game_config_game").delete().eq("id", record.id);
  },
});

// ─── game_config_weather ────────────────────────────────────────────────

export const gameConfigWeatherFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    icon: z.string().default("☀️"),
    description: z.string().default(""),
    productionMultiplier: z.number().default(1.0),
    solarMultiplier: z.number().default(1.0),
    windMultiplier: z.number().default(1.0),
    transportMultiplier: z.number().default(1.0),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `wth-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_weather")
      .upsert(
        {
          id,
          name: data.name,
          icon: data.icon,
          description: data.description,
          production_multiplier: data.productionMultiplier,
          solar_multiplier: data.solarMultiplier,
          wind_multiplier: data.windMultiplier,
          transport_multiplier: data.transportMultiplier,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] game_config_weather: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("game_config_weather").delete().eq("id", record.id);
  },
});

// ─── game_config_balancing_rules ────────────────────────────────────────

export const gameConfigBalancingRulesFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    baseId: z.string(),
    name: z.string(),
    description: z.string().default(""),
    category: z.string().default("economy"),
    target: z.string().nullable().default(null),
    multiplier: z.number().default(1.0),
    isActive: z.boolean().default(true),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = rid(ctx, `bal-${data.baseId}`);
    const { data: row, error } = await supabase
      .from("game_config_balancing_rules")
      .upsert(
        {
          id,
          name: data.name,
          description: data.description,
          category: data.category,
          target: data.target,
          multiplier: data.multiplier,
          is_active: data.isActive,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(
        `[autonoma] game_config_balancing_rules: ${error.message}`,
      );
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_balancing_rules")
      .delete()
      .eq("id", record.id);
  },
});

// ─── game_config_balance — PK = key text ───────────────────────────────

export const gameConfigBalanceFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    key: z.string(),
    value: z.unknown(),
  }),
  refSchema: z.object({ id: z.string(), key: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const runOffset = ctx.testRunId.replace(/[^0-9]/g, "").slice(-4) || "0";
    const key = `${data.key}-${runOffset}`;
    const { data: row, error } = await supabase
      .from("game_config_balance")
      .upsert({ key, value: data.value as never }, { onConflict: "key" })
      .select("key")
      .single();
    if (error)
      throw new Error(`[autonoma] game_config_balance: ${error.message}`);
    return ref({ id: row.key, key: row.key });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("game_config_balance").delete().eq("key", record.key);
  },
});
