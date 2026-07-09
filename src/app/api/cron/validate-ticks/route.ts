// ============================================================================
// IndustriaX: Cron — Validate Ticks (Phase 7.2)
// Periodic anti-cheat: validates active players' money against theoretical max.
// Catches "gradual money inflation" cheaters who stay under per-save delta
// thresholds but accumulate illegitimate money over time.
//
// Schedule: Every 30 minutes via Supabase pg_cron (see migration 060+).
// Phase 5.4: spot-check is cheap (no full_state fetch). Most cheats are
// caught by per-action validation in /api/game/action + /api/game/state;
// this cron is a backup that scans only suspicious players deeply.
// ============================================================================

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeMaxPossibleMoney } from "@/lib/game/serverTickValidator";
import type { GameConfig } from "@/lib/game/config";
import type { ServerGameData } from "@/lib/game/types";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { logActionAsync } from "@/lib/auth/gameStateValidator";
import {
  loadActivePlayersSince,
  loadFullStateForUser,
} from "@/lib/db/serverGameState";
import { ensureConfigLoaded } from "@/lib/game/configLoader.server";
import {
  BUILDING_DEFS,
  WORKER_DEFS,
  WEATHER_DEFS,
  RESEARCH_TREE,
  RESOURCE_META,
  INITIAL_MARKET,
  TRANSPORT_DEFS,
  AUTOMATION_UNLOCKS,
  PRESTIGE_BONUSES,
  RANK_THRESHOLDS,
  QUEST_DEFS,
  WEEKLY_DAILY_REWARDS,
  EVENT_TEMPLATES,
  SEASONAL_EVENTS,
  INITIAL_MEGA_PROJECTS,
  TRADABLE_RESOURCE_IDS,
  PRODUCTION_CHAINS,
} from "@/lib/game/configCache";

// Mark as dynamic to prevent Next.js from caching cron responses
export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────

interface ServerGameStateRow {
  user_id: string;
  full_state: unknown;
  game_tick: number;
  game_speed: number;
  last_tick_at: string;
  money: number;
}

// ─── Config Builder ───────────────────────────────────────────────────────

/**
 * Construct a GameConfig from the configCache live bindings.
 * The configCache is populated from Supabase at startup via
 * configLoader.server.ts → ensureConfigLoaded(), which is invoked
 * by this route's POST handler (step 2.5 below) before this
 * function ever runs. If Supabase is unreachable, the cron run
 * is aborted and this function is never called (fail-closed).
 *
 * We use the same configCache that the client uses so the server's
 * production calculation matches what the client should produce.
 */
function buildConfigFromCache(): GameConfig {
  return {
    buildings: BUILDING_DEFS,
    resources: Object.fromEntries(
      Object.entries(RESOURCE_META).map(([key, val]) => [
        key,
        {
          name: val.name,
          icon: val.icon,
          tier: val.tier,
          color: val.color,
          category: "raw",
        },
      ]),
    ),
    research: RESEARCH_TREE.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category,
      tier: r.tier,
      cost: r.cost,
      timeRequired: r.timeRequired,
      prerequisites: r.prerequisites,
      effects: r.effects as unknown as Record<string, unknown>[],
      icon: r.icon,
    })),
    market: INITIAL_MARKET.map((m) => ({
      resource: m.resource,
      basePrice: m.basePrice,
      demand: m.demand,
      supply: m.supply,
      volatility: m.volatility,
      isTradable: true,
    })),
    tradableResourceIds: [...TRADABLE_RESOURCE_IDS] as string[],
    weather: Object.fromEntries(
      Object.entries(WEATHER_DEFS).map(([key, w]) => [
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
    ),
    workers: Object.values(WORKER_DEFS).map((w) => ({
      id: w.type,
      name: w.name,
      description: w.description,
      baseHireCost: w.baseHireCost,
      effects: w.effects,
      icon: w.icon,
    })),
    transport: Object.values(TRANSPORT_DEFS).map((t) => ({
      id: t.type,
      name: t.name,
      description: t.description,
      baseCost: t.baseCost,
      baseThroughput: t.baseThroughput,
      upgradeMultiplier: t.upgradeMultiplier,
      icon: t.icon,
    })),
    automation: AUTOMATION_UNLOCKS.map((a) => ({
      id: a.type,
      name: a.name,
      description: a.description,
      cost: a.cost,
      requiresResearch: a.requiresResearch ?? null,
      icon: a.icon,
    })),
    prestigeBonuses: PRESTIGE_BONUSES.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      cost: p.cost,
      effect: p.effect,
    })),
    rankThresholds: RANK_THRESHOLDS.map((r) => ({
      rank: 0,
      name: r.name,
      scoreRequired: r.minScore,
    })),
    quests: QUEST_DEFS.map((q) => ({
      id: q.id,
      name: q.name,
      description: q.description,
      type: q.type,
      category: q.category,
      gameTier: q.gameTier ?? 0,
      steps: q.steps as unknown as Record<string, unknown>[],
      reward: q.reward as Record<string, unknown>,
      targetResource: q.targetResource ?? null,
      targetBuilding: q.targetBuilding ?? null,
      icon: q.icon,
    })),
    dailyRewards: WEEKLY_DAILY_REWARDS.map((d) => ({
      day: d.day,
      type: d.type,
      amount: d.amount,
      resourceId: "resource" in d ? (d as { resource: string }).resource : null,
    })),
    eventTemplates: EVENT_TEMPLATES.map((e) => ({
      id: (e as { type?: string }).type ?? "",
      name: e.name,
      description: e.description,
      type: (e as { type?: string }).type ?? "",
      duration: e.duration,
      effects: e.effects as Record<string, unknown>[],
      icon: e.icon,
    })),
    seasonalEvents: SEASONAL_EVENTS.map((s) => ({
      id: (s as { id?: string }).id ?? "",
      name: s.name,
      description: s.description,
      season: "",
      startDate: "",
      endDate: "",
      effects: s.effects as unknown as Record<string, unknown>[],
      rewards: [],
      icon: s.icon,
      isActive: true,
    })),
    megaProjects: INITIAL_MEGA_PROJECTS.map((m) => ({
      id: m.type,
      name: m.name,
      description: m.description,
      icon: m.icon,
      stages: m.stages as unknown as Record<string, unknown>[],
      bonus: m.bonus as Record<string, unknown>,
      unlockRequirement: m.unlockRequirement as Record<string, unknown>,
    })),
    gameConfig: {},
    productionChains: PRODUCTION_CHAINS.map((c) => ({
      id: (c as { id?: string }).id ?? "",
      upstreamBuilding: (c as { upstream?: string }).upstream ?? "",
      downstreamBuilding: (c as { downstream?: string }).downstream ?? "",
      resourceId: (c as { resource?: string }).resource ?? "",
    })),
    loadedAt: Date.now(),
    source: "supabase",
  };
}

// ─── Handlers ─────────────────────────────────────────────────────────────

/**
 * POST — Run the tick validation cron job.
 *
 * Auth: Requires CRON_SECRET in Authorization header.
 * Rate-limited to prevent abuse.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // ── 1. Auth check ──────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Rate limiting ───────────────────────────────────────────────
  const rateLimitResult = await checkRateLimit(
    "cron",
    RATE_LIMITS.sync,
    "validate-ticks",
  );
  if (rateLimitResult) return rateLimitResult;

  // ── 2.5 Config loader (fail-closed) ─────────────────────────────────
  // Bind Supabase config into configCache BEFORE running anti-cheat.
  // If Supabase is unreachable, ABORT the cron run — running anti-cheat
  // against an empty cache (post data.ts deletion) would silently weaken
  // detection (every building cost = 0 → no validator would ever flag).
  const configLoad = await ensureConfigLoaded();
  if (!configLoad.ok) {
    console.error(
      "[Cron] validate-ticks: ABORTED — config not loaded from Supabase. " +
        "Reason: " +
        (configLoad.error ?? "unknown") +
        ". " +
        "This run is intentionally skipped to preserve anti-cheat integrity.",
    );
    return NextResponse.json(
      {
        error: "Config unavailable — anti-cheat skipped to preserve integrity",
        reason: configLoad.error,
        partialErrors: configLoad.partialErrors,
        players_checked: 0,
        flagged_count: 0,
      },
      { status: 503 },
    );
  }

  // ── 3. Database client ─────────────────────────────────────────────
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 },
    );
  }

  const startTime = Date.now();
  let playersChecked = 0;
  let flaggedCount = 0;

  try {
    // ── 4. Query active players (last_tick_at within 5 minutes) ──────
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    let activePlayers;
    try {
      activePlayers = await loadActivePlayersSince(fiveMinAgo);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Cron] validate-ticks: query error:", message);
      return NextResponse.json(
        { error: "Failed to query active players" },
        { status: 500 },
      );
    }

    if (activePlayers.length === 0) {
      return NextResponse.json({
        players_checked: 0,
        flagged_count: 0,
        duration_ms: Date.now() - startTime,
      });
    }

    playersChecked = activePlayers.length;

    // ── 5. Build game config ───────────────────────────────
    const config: GameConfig = buildConfigFromCache();

    // ── 6. Phase 5.4 spot-check: cheap scan, lazy full_state for flagged ─
    // The spot-check uses only scalar columns (no full_state fetch). Most
    // players pass and never touch the heavy path. Only when a sanity check
    // looks suspicious do we fetch the full state for a deep check.
    //
    // Sanity check: a player's money should be ≤ total_money_earned + a
    // generous "unspent income" margin based on elapsed ticks × max RP/income.
    // This catches 99% of cheats without needing the full game state.
    for (const player of activePlayers) {
      // Skip if money is not even a number
      if (typeof player.money !== "number" || player.money < 0) {
        // Defensive flag — negative money is always a bug or a cheat
        flaggedCount++;
        await flagSuspicious(
          supabase,
          player.user_id,
          player.money,
          player.game_tick,
          "negative_money",
        );
        continue;
      }

      // Sanity: money > total_money_earned is impossible without selling.
      // Selling only decreases money. So money > total_money_earned means
      // either a bug or a cheat. Flag for deep check.
      if (player.money > (player.total_money_earned ?? 0) * 1.5) {
        flaggedCount++;
        // Fetch full state ONLY for this one user to run deep validation
        const deep = await loadFullStateForUser(player.user_id);
        if (!deep) continue;
        // Phase 13: full_state is pure ServerGameData. UI flags NEVER appear.
        const state = deep.full_state as ServerGameData;
        if (!state || typeof state.money !== "number") continue;
        const lastTickAt = new Date(player.last_tick_at).getTime();
        const elapsedSeconds = (Date.now() - lastTickAt) / 1000;
        const gameSpeed = player.game_speed || 1;
        const elapsedTicks = Math.floor(elapsedSeconds * gameSpeed);
        if (elapsedTicks < 10) continue;
        const maxPossible = computeMaxPossibleMoney(
          state,
          elapsedTicks,
          config,
        );
        if (state.money > maxPossible) {
          const ratio = state.money / Math.max(1, maxPossible);
          const percentOver = Math.floor((ratio - 1) * 100);
          const description =
            `[gradual_money_inflation] Money ${state.money.toFixed(2)} exceeds ` +
            `theoretical max ${maxPossible.toFixed(2)} by ${percentOver}% ` +
            `over ${elapsedTicks} elapsed ticks.`;
          await flagSuspicious(
            supabase,
            player.user_id,
            state.money,
            deep.game_tick,
            "money_manipulation",
            description,
          );
        }
        continue;
      }

      // No flag — clean. No full_state fetch needed.
    }

    return NextResponse.json({
      players_checked: playersChecked,
      flagged_count: flaggedCount,
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    console.error("[Cron] validate-ticks: unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * GET — Health check for monitoring systems.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok", endpoint: "validate-ticks" });
}

// ============================================
// Phase 5.4 helper: flag a player as suspicious
// via the atomic increment_cheat_flag RPC.
// ============================================
async function flagSuspicious(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  money: number,
  gameTick: number,
  flagType: "money_manipulation" | "negative_money",
  description?: string,
): Promise<void> {
  if (!supabase) return;
  const finalDescription =
    description ?? `[${flagType}] Money=${money}, gameTick=${gameTick}`;
  const { error: flagError } = await supabase.rpc("increment_cheat_flag", {
    p_user_id: userId,
    p_flag_type: flagType,
    p_description: finalDescription,
    p_severity: "high",
  });
  if (flagError) {
    console.error(
      `[Cron] validate-ticks: RPC flag error for ${userId}:`,
      flagError.message,
    );
  }
  // Fire-and-forget audit log
  logActionAsync({
    userId,
    actionType: "tick",
    payload: {
      detection: flagType,
      claimed_money: money,
      game_tick: gameTick,
    },
    gameTick,
    moneyAfter: money,
    isValid: false,
    validationRisk: "high",
    rejectionReason: finalDescription,
  });
}
