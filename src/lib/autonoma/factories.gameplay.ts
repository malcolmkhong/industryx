/**
 * Autonoma test-data — gameplay-state factories.
 */

import { randomUUID } from "node:crypto";

import { defineFactory } from "@autonoma-ai/sdk";
import { z } from "zod";

import { requireDb, ref, userUuidFor, uuidFor } from "./helpers";

// ─── server_game_state ──────────────────────────────────────────────────

export const serverGameStateFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    money: z.number().default(0),
    totalMoneyEarned: z.number().default(0),
    researchPoints: z.number().default(0),
    gameTick: z.number().default(0),
    gameSpeed: z.number().default(1),
    stateVersion: z.number().default(1),
    buildings: z.array(z.unknown()).default([]),
    resources: z.record(z.string(), z.number()).default({}),
    workers: z.array(z.unknown()).default([]),
    completedResearch: z.array(z.string()).default([]),
  }),
  refSchema: z.object({ id: z.string(), user_id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const id = randomUUID();
    const nowIso = new Date().toISOString();
    const fullState = {
      money: data.money,
      resources: data.resources,
      buildings: data.buildings,
      workers: data.workers,
      completedResearch: data.completedResearch,
      gameTick: data.gameTick,
      gameSpeed: data.gameSpeed,
    };
    const { error } = await supabase.from("server_game_state").upsert(
      {
        id,
        user_id: userId,
        money: data.money,
        total_money_earned: data.totalMoneyEarned,
        research_points: data.researchPoints,
        buildings: data.buildings,
        buildings_count: data.buildings.length,
        completed_research: data.completedResearch,
        resources: data.resources,
        workers: data.workers,
        game_tick: data.gameTick,
        game_speed: data.gameSpeed,
        state_hash: `autonoma-${ctx.testRunId.slice(0, 12)}`,
        state_version: data.stateVersion,
        last_tick_at: nowIso,
        last_saved_at: nowIso,
        cheat_flag_count: 0,
        is_locked: false,
        market_supply: {},
        full_state: fullState,
      },
      { onConflict: "user_id" },
    );
    if (error)
      throw new Error(`[autonoma] server_game_state: ${error.message}`);
    return ref({ id, user_id: userId });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("server_game_state").delete().eq("id", record.id);
  },
});

// ─── player_progress ────────────────────────────────────────────────────

export const playerProgressFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
  }),
  refSchema: z.object({ id: z.string(), user_id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("player_progress").upsert(
      {
        user_id: userId,
        research_points: 0,
        transport_lines: [],
        completed_research: [],
        active_research: null,
        research_progress: 0,
        workers: [],
        market_state: {},
        contracts: {},
        prestige_state: {},
        mega_projects: {},
        events: {},
        quests: {},
        weather: {},
        payout_config: {},
        stats: {},
        power_grid: null,
        resource_capacity: null,
        auto_sell_resources: null,
        storage_upgrade_levels: null,
        drones: null,
        pending_payout: null,
        blueprints: null,
        auto_collect: null,
        daily_login_streak: null,
        last_daily_login_at: null,
        daily_rewards_claimed: null,
        display_name: null,
        game_state: null,
        last_saved_at: nowIso,
        last_tick_at: nowIso,
        buildings_count: 0,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`[autonoma] player_progress: ${error.message}`);
    // `player_progress` has no `id` column; surface `user_id` as `id` so
    // the SDK's `record.id != null` check passes. Teardown uses the
    // `user_id` field directly.
    return ref({ id: userId, user_id: userId });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("player_progress")
      .delete()
      .eq("user_id", record.user_id);
  },
});

// ─── player_actions ─────────────────────────────────────────────────────

export const playerActionsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    actionType: z.enum([
      "build",
      "sell",
      "buy",
      "research",
      "upgrade",
      "transport",
      "save",
      "load",
      "tick",
      "prestige",
      "import",
      "claim_quest",
      "hire_worker",
      "assign_worker",
      "upgrade_worker",
      "start_drone_mission",
      "collect_drone",
      "buy_market",
      "sell_market",
      "toggle_building",
      "set_game_speed",
      "bulk_build",
      "bulk_sell",
    ]),
    payload: z.record(z.string(), z.unknown()).default({}),
    moneyAfter: z.number().default(0),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("player_actions")
      .insert({
        id,
        user_id: userId,
        action_type: data.actionType,
        payload: data.payload,
        game_tick: 0,
        money_after: data.moneyAfter,
        is_valid: true,
        validation_risk: "none",
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] player_actions: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("player_actions").delete().eq("id", record.id);
  },
});

// ─── trade_history ──────────────────────────────────────────────────────

export const tradeHistoryFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    giveResource: z.string(),
    giveAmount: z.number(),
    receiveResource: z.string(),
    receiveAmount: z.number(),
    commissionRate: z.number().default(0.05),
    gameTick: z.number().default(0),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("trade_history")
      .insert({
        id,
        user_id: userId,
        give_resource: data.giveResource,
        give_amount: data.giveAmount,
        receive_resource: data.receiveResource,
        receive_amount: data.receiveAmount,
        commission_rate: data.commissionRate,
        game_tick: data.gameTick,
        server_validated: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] trade_history: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("trade_history").delete().eq("id", record.id);
  },
});

// ─── game_config_market_history (bigint id) ────────────────────────────

export const gameConfigMarketHistoryFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    resourceId: z.string(),
    basePrice: z.number(),
    marketPhase: z.string().nullable().default(null),
    gameTick: z.number().default(0),
  }),
  refSchema: z.object({ id: z.number() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    // bigint identity; let Postgres assign via serial. Use upsert on a
    // synthetic key (resource_id+game_tick) — but the table doesn't
    // expose a natural key. Instead, fetch max id and add a per-run
    // offset to stay collision-free.
    const runOffset = parseInt(
      ctx.testRunId.replace(/[^0-9]/g, "").slice(-6) || "0",
      10,
    );
    const { data: maxRow } = await supabase
      .from("game_config_market_history")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    const baseId = (Number(maxRow?.id ?? 0) || 0) + runOffset + 1;
    const id = baseId;
    const { data: row, error } = await supabase
      .from("game_config_market_history")
      .insert({
        id,
        resource_id: data.resourceId,
        base_price: data.basePrice,
        market_phase: data.marketPhase,
        game_tick: data.gameTick,
      })
      .select("id")
      .single();
    if (error)
      throw new Error(
        `[autonoma] game_config_market_history: ${error.message}`,
      );
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_config_market_history")
      .delete()
      .eq("id", record.id);
  },
});

// ─── market_player_pressure — PK (user_id, resource) ─────────────────────

export const marketPlayerPressureFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    resourceId: z.string(),
    buyVolume: z.number().default(0),
    sellVolume: z.number().default(0),
  }),
  refSchema: z.object({
    id: z.string(),
    user_id: z.string(),
    resource: z.string(),
  }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const { data: row, error } = await supabase
      .from("market_player_pressure")
      .upsert(
        {
          user_id: userId,
          resource: data.resourceId,
          buy_volume: data.buyVolume,
          sell_volume: data.sellVolume,
        },
        { onConflict: "user_id,resource" },
      )
      .select("user_id,resource")
      .single();
    if (error)
      throw new Error(`[autonoma] market_player_pressure: ${error.message}`);
    return ref({
      id: `${row.user_id}:${row.resource}`,
      user_id: row.user_id,
      resource: row.resource,
    });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("market_player_pressure")
      .delete()
      .eq("user_id", record.user_id)
      .eq("resource", record.resource);
  },
});

// ─── market_supply_demand — PK (resource) ───────────────────────────────

export const marketSupplyDemandFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    resourceId: z.string(),
    production: z.number().default(0),
    consumption: z.number().default(0),
    netPressure: z.number().default(0),
    playerCount: z.number().default(0),
  }),
  refSchema: z.object({ id: z.string(), resource: z.string() }),
  create: async (data) => {
    const supabase = requireDb();
    const { data: row, error } = await supabase
      .from("market_supply_demand")
      .upsert(
        {
          resource: data.resourceId,
          production: data.production,
          consumption: data.consumption,
          net_pressure: data.netPressure,
          player_count: data.playerCount,
        },
        { onConflict: "resource" },
      )
      .select("resource")
      .single();
    if (error)
      throw new Error(`[autonoma] market_supply_demand: ${error.message}`);
    return ref({ id: row.resource, resource: row.resource });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("market_supply_demand")
      .delete()
      .eq("resource", record.resource);
  },
});

// ─── leaderboard ────────────────────────────────────────────────────────

export const leaderboardFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    score: z.number().default(0),
    rankName: z.string().default("Entrepreneur"),
    corporationName: z.string().default("TestCorp"),
    totalMoneyEarned: z.number().default(0),
    buildingsBuilt: z.number().default(0),
    researchCompleted: z.number().default(0),
    contractsCompleted: z.number().default(0),
    prestigeCount: z.number().default(0),
    playTimeTicks: z.number().default(0),
    gameTick: z.number().default(0),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("leaderboard")
      .insert({
        id,
        user_id: userId,
        score: data.score,
        rank_name: data.rankName,
        corporation_name: data.corporationName,
        total_money_earned: data.totalMoneyEarned,
        buildings_built: data.buildingsBuilt,
        research_completed: data.researchCompleted,
        contracts_completed: data.contractsCompleted,
        prestige_count: data.prestigeCount,
        play_time_ticks: data.playTimeTicks,
        game_tick: data.gameTick,
      })
      .select("id")
      .single();
    if (error) throw new Error(`[autonoma] leaderboard: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("leaderboard").delete().eq("id", record.id);
  },
});

// ─── daily_rewards + user_streaks ───────────────────────────────────────

export const dailyRewardsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    claimDate: z.string(),
    dayOfStreak: z.number().default(1),
    rewardDay: z.number().default(1),
    rewardType: z.string().default("money"),
    rewardAmount: z.number().default(100),
    rewardResource: z.string().nullable().default(null),
    streakMultiplier: z.number().default(1),
    totalStreak: z.number().default(1),
  }),
  refSchema: z.object({ id: z.string(), user_id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const id = randomUUID();
    const { data: row, error } = await supabase
      .from("daily_rewards")
      .insert({
        id,
        user_id: userId,
        claim_date: data.claimDate,
        day_of_streak: data.dayOfStreak,
        reward_day: data.rewardDay,
        reward_type: data.rewardType,
        reward_amount: data.rewardAmount,
        reward_resource: data.rewardResource,
        streak_multiplier: data.streakMultiplier,
        total_streak: data.totalStreak,
      })
      .select("id,user_id")
      .single();
    if (error) throw new Error(`[autonoma] daily_rewards: ${error.message}`);
    return ref({ id: row.id, user_id: row.user_id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("daily_rewards").delete().eq("id", record.id);
  },
});

export const userStreaksFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    currentStreak: z.number().default(1),
    longestStreak: z.number().default(1),
    totalLogins: z.number().default(1),
    lastClaimDate: z.string().nullable().default(null),
  }),
  refSchema: z.object({ id: z.string(), user_id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const { error } = await supabase.from("user_streaks").upsert(
      {
        user_id: userId,
        current_streak: data.currentStreak,
        longest_streak: data.longestStreak,
        total_logins: data.totalLogins,
        last_claim_date: data.lastClaimDate,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`[autonoma] user_streaks: ${error.message}`);
    return ref({ id: userId, user_id: userId });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("user_streaks").delete().eq("user_id", record.user_id);
  },
});

// ─── game_state_recovery_cases + receipts ──────────────────────────────

export const gameStateRecoveryCasesFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    logicalUserId: z.string(),
    originalStateId: z.string(),
    originalStateVersion: z.number().default(1),
    originalFullState: z.record(z.string(), z.unknown()).default({}),
    detectedSchemaCondition: z
      .enum([
        "bootstrap_pending",
        "full_shape_unverified",
        "partial_legacy",
        "invalid_raw",
        "conflicting_evidence",
        "unknown_progress",
      ])
      .default("partial_legacy"),
    evidenceSources: z.array(z.unknown()).default([]),
    fieldClassification: z.record(z.string(), z.unknown()).default({}),
    recoverableFields: z.array(z.string()).default([]),
    unresolvedFields: z.array(z.string()).default([]),
    status: z
      .enum([
        "evidence_collected",
        "manual_review_required",
        "approved",
        "converted",
        "rejected",
      ])
      .default("approved"),
    approvedRecoveryMethod: z.string().default("autonoma_seed"),
    approvedBy: z.string().nullable().default(null),
    approvedAt: z.string().nullable().default(null),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const userId = userUuidFor(ctx.testRunId, data.logicalUserId);
    const id = randomUUID();
    const originalStateId = uuidFor(
      ctx.testRunId,
      `orig:${data.originalStateId}`,
    );
    const { data: row, error } = await supabase
      .from("game_state_recovery_cases")
      .insert({
        id,
        user_id: userId,
        original_state_id: originalStateId,
        original_state_version: data.originalStateVersion,
        original_full_state: data.originalFullState,
        detected_schema_condition: data.detectedSchemaCondition,
        evidence_sources: data.evidenceSources,
        field_classification: data.fieldClassification,
        recoverable_fields: data.recoverableFields,
        unresolved_fields: data.unresolvedFields,
        status: data.status,
        approved_recovery_method: data.approvedRecoveryMethod,
        approved_by: data.approvedBy
          ? userUuidFor(ctx.testRunId, data.approvedBy)
          : null,
        approved_at: data.approvedAt,
      })
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] game_state_recovery_cases: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_state_recovery_cases")
      .delete()
      .eq("id", record.id);
  },
});

export const gameStateRecoveryReceiptsFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    caseId: z.string(),
    userId: z.string().nullable().default(null),
    originalStateId: z.string(),
    recoveredStateVersion: z.number().default(1),
    payloadSchemaVersion: z.number().default(1),
    payloadChecksum: z.string().default("autonoma_seed"),
    recoveryMethod: z.string().default("autonoma_seed"),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const id = randomUUID();
    const originalStateId = uuidFor(
      ctx.testRunId,
      `receipt:${data.originalStateId}`,
    );
    const caseUuid = uuidFor(ctx.testRunId, `case:${data.caseId}`);
    const userUuid =
      typeof data.userId === "string" && data.userId.length > 0
        ? userUuidFor(ctx.testRunId, data.userId)
        : null;
    const { data: row, error } = await supabase
      .from("game_state_recovery_receipts")
      .insert({
        id,
        case_id: caseUuid,
        user_id: userUuid,
        original_state_id: originalStateId,
        recovered_state_version: data.recoveredStateVersion,
        payload_schema_version: data.payloadSchemaVersion,
        payload_checksum: data.payloadChecksum,
        recovery_method: data.recoveryMethod,
      })
      .select("id")
      .single();
    if (error)
      throw new Error(
        `[autonoma] game_state_recovery_receipts: ${error.message}`,
      );
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("game_state_recovery_receipts")
      .delete()
      .eq("id", record.id);
  },
});
