// ============================================================================
// IndustriaX: Cron — Validate Ticks (Phase 7.2)
// Periodic anti-cheat: validates active players' money against theoretical max.
// Catches "gradual money inflation" cheaters who stay under per-save delta
// thresholds but accumulate illegitimate money over time.
//
// Schedule: Every 5 minutes via Supabase pg_cron or Vercel cron.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { computeMaxPossibleMoney } from '@/lib/game/serverTickValidator';
import { GameConfig } from '@/lib/game/config';
import { GameState } from '@/lib/game/types';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { logActionAsync } from '@/lib/auth/gameStateValidator';
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
} from '@/lib/game/configCache';

// Mark as dynamic to prevent Next.js from caching cron responses
export const dynamic = 'force-dynamic';

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
 * The configCache is initialized with data.ts defaults and may be updated
 * at runtime by GameConfigProvider when Supabase config loads.
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
        { name: val.name, icon: val.icon, tier: val.tier, color: val.color, category: 'raw' },
      ])
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
      ])
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
      resourceId: ('resource' in d ? (d as { resource: string }).resource : null),
    })),
    eventTemplates: EVENT_TEMPLATES.map((e) => ({
      id: (e as { type?: string }).type ?? '',
      name: e.name,
      description: e.description,
      type: (e as { type?: string }).type ?? '',
      duration: e.duration,
      effects: e.effects as Record<string, unknown>[],
      icon: e.icon,
    })),
    seasonalEvents: SEASONAL_EVENTS.map((s) => ({
      id: (s as { id?: string }).id ?? '',
      name: s.name,
      description: s.description,
      season: '',
      startDate: '',
      endDate: '',
      effects: s.effects as Record<string, unknown>[],
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
      id: (c as { id?: string }).id ?? '',
      upstreamBuilding: (c as { upstream?: string }).upstream ?? '',
      downstreamBuilding: (c as { downstream?: string }).downstream ?? '',
      resourceId: (c as { resource?: string }).resource ?? '',
    })),
    loadedAt: Date.now(),
    source: 'supabase',
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
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Rate limiting ───────────────────────────────────────────────
  const rateLimitResult = await checkRateLimit('cron', RATE_LIMITS.sync, 'validate-ticks');
  if (rateLimitResult) return rateLimitResult;

  // ── 3. Database client ─────────────────────────────────────────────
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const startTime = Date.now();
  let playersChecked = 0;
  let flaggedCount = 0;

  try {
    // ── 4. Query active players (last_tick_at within 5 minutes) ──────
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: activePlayers, error: queryError } = await supabase
      .from('server_game_state')
      .select('user_id, full_state, game_tick, game_speed, last_tick_at, money')
      .gt('last_tick_at', fiveMinAgo)
      .returns<ServerGameStateRow[]>();

    if (queryError) {
      console.error('[Cron] validate-ticks: query error:', queryError.message);
      return NextResponse.json({ error: 'Failed to query active players' }, { status: 500 });
    }

    if (!activePlayers || activePlayers.length === 0) {
      return NextResponse.json({
        players_checked: 0,
        flagged_count: 0,
        duration_ms: Date.now() - startTime,
      });
    }

    playersChecked = activePlayers.length;

    // ── 5. Build game config ─────────────────────────────────────────
    const config: GameConfig = buildConfigFromCache();

    // ── 6. Validate each active player ───────────────────────────────
    for (const player of activePlayers) {
      const state = player.full_state as GameState;

      // Skip if no valid state
      if (!state || typeof state.money !== 'number') continue;

      const lastTickAt = new Date(player.last_tick_at).getTime();
      const elapsedSeconds = (Date.now() - lastTickAt) / 1000;
      const gameSpeed = player.game_speed || 1;
      const elapsedTicks = Math.floor(elapsedSeconds * gameSpeed);

      // Skip if not enough ticks have elapsed to be meaningful
      if (elapsedTicks < 10) continue;

      // computeMaxPossibleMoney already includes a 1.1× safety margin
      // internally, so we compare directly against the returned value.
      const maxPossible = computeMaxPossibleMoney(state, elapsedTicks, config);

      if (state.money > maxPossible) {
        flaggedCount++;
        const ratio = state.money / Math.max(1, maxPossible);
        const percentOver = Math.floor((ratio - 1) * 100);

        // Use 'money_manipulation' detection type — the closest valid type
        // in the cheat_investigations CHECK constraint. The description
        // carries the 'gradual_money_inflation' detail for filtering.
        const description =
          `[gradual_money_inflation] Money ${state.money.toFixed(2)} exceeds ` +
          `theoretical max ${maxPossible.toFixed(2)} by ${percentOver}% ` +
          `over ${elapsedTicks} elapsed ticks.`;

        // ── Flag atomically via RPC (also auto-locks after 3 flags) ──
        const { error: flagError } = await supabase.rpc('increment_cheat_flag', {
          p_user_id: player.user_id,
          p_flag_type: 'money_manipulation',
          p_description: description,
          p_severity: 'high',
        });

        if (flagError) {
          console.error(
            `[Cron] validate-ticks: RPC flag error for ${player.user_id}:`,
            flagError.message,
          );
        }

        // ── Fire-and-forget audit log ────────────────────────────────
        logActionAsync({
          userId: player.user_id,
          actionType: 'tick',
          payload: {
            detection: 'gradual_money_inflation',
            claimed: state.money,
            theoretical_max: maxPossible,
            ratio: Number(ratio.toFixed(4)),
            elapsed_ticks: elapsedTicks,
            game_speed: gameSpeed,
          },
          gameTick: player.game_tick ?? state.gameTick ?? 0,
          moneyAfter: state.money,
          isValid: false,
          validationRisk: 'high',
          rejectionReason: `Money exceeds theoretical max by ${percentOver}%`,
        });
      }
    }

    return NextResponse.json({
      players_checked: playersChecked,
      flagged_count: flaggedCount,
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    console.error('[Cron] validate-ticks: unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}

/**
 * GET — Health check for monitoring systems.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'ok', endpoint: 'validate-ticks' });
}
