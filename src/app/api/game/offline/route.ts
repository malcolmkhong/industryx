// ============================================
// IndustriaX: Offline Progress API
// GET endpoint that computes how many ticks
// the player should have earned while offline
// LEAN MVP — uses server_game_state (source of truth)
// ============================================
// Phase 2.5: POST handler — server-authoritative
// offline tick computation with optimistic locking.
// Client-sent `ticks` and `gameState` are IGNORED.
// The server computes elapsed ticks from last_tick_at
// and runs runServerTicks() server-side.
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { logActionAsync } from '@/lib/auth/gameStateValidator';
import {
  SupabaseBuilding,
  SupabaseRecipe,
  SupabaseResearch,
  SupabaseProductionChain,
  SupabaseWorker,
  SupabaseWeather,
  SupabaseMarket,
  GameConfig,
} from '@/lib/game/config';
import { BuildingDefinition, ResourceAmount, ResourceType, CostResourceType, GameState } from '@/lib/game/types';
import { ProductionSnapshot } from '@/lib/game/productionCalculator';
import { runServerTicks } from '@/lib/game/serverEngine';

// Game tick interval: 1 tick per second at 1x speed
const TICK_INTERVAL_MS = 1000;

// Maximum offline ticks to compute (cap at ~24 hours)
const MAX_OFFLINE_TICKS = 86400;

// ─── In-Memory Config Cache ─────────────────────────────────────────────

let cachedConfig: GameConfig | null = null;
let configFetchedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helper: Parse cost JSON ────────────────────────────────────────────

function parseCostMap(costMap: Record<string, number> | Array<{ resource: string; amount: number }> | null): ResourceAmount[] {
  if (!costMap) return [{ resource: 'money', amount: 100 }];
  if (Array.isArray(costMap)) {
    return costMap.map(item => ({
      resource: item.resource as CostResourceType,
      amount: item.amount,
    }));
  }
  return Object.entries(costMap).map(([resource, amount]) => ({
    resource: resource as CostResourceType,
    amount,
  }));
}

// ─── Helper: Load Full Config from Supabase ─────────────────────────────

async function loadFullConfig(): Promise<GameConfig | null> {
  if (cachedConfig && (Date.now() - configFetchedAt) < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    throw new Error('Supabase service role not configured');
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
      supabase.from('game_config_buildings').select('*').order('sort_order', { ascending: true, nullsFirst: false }),
      supabase.from('game_config_production_recipes').select('*'),
      supabase.from('game_config_research').select('*').order('sort_order', { ascending: true, nullsFirst: false }),
      supabase.from('game_config_production_chains').select('*'),
      supabase.from('game_config_workers').select('*').order('sort_order', { ascending: true, nullsFirst: false }),
      supabase.from('game_config_weather').select('*').order('sort_order', { ascending: true, nullsFirst: false }),
      supabase.from('game_config_market').select('*').order('sort_order', { ascending: true, nullsFirst: false }),
    ]);

    if (buildingsRes.error || !buildingsRes.data) {
      console.error('[OfflineAPI] Failed to fetch buildings:', buildingsRes.error);
      return null;
    }
    if (recipesRes.error || !recipesRes.data) {
      console.error('[OfflineAPI] Failed to fetch recipes:', recipesRes.error);
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
      const buildingRecipes = recipes.filter(r => r.building_id === b.id);
      const inputs: ResourceAmount[] = buildingRecipes
        .filter(r => r.is_input)
        .map(r => ({ resource: r.resource_id as ResourceType, amount: r.amount }));
      const outputs: ResourceAmount[] = buildingRecipes
        .filter(r => !r.is_input)
        .map(r => ({ resource: r.resource_id as ResourceType, amount: r.amount }));

      buildingsMap[b.id] = {
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

    const weatherMap: GameConfig['weather'] = {};
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

    const config: GameConfig = {
      buildings: buildingsMap,
      resources: {},
      research: research.map(r => ({
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
      market: market.map(m => ({
        resource: m.resource_id,
        basePrice: m.base_price,
        demand: m.demand,
        supply: m.supply,
        volatility: m.volatility,
        isTradable: m.is_tradable,
      })),
      tradableResourceIds: market.filter(m => m.is_tradable).map(m => m.resource_id),
      weather: weatherMap,
      workers: workers.map(w => ({
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
      productionChains: chains.map(c => ({
        id: c.id,
        upstreamBuilding: c.upstream_building,
        downstreamBuilding: c.downstream_building,
        resourceId: c.resource_id,
      })),
      loadedAt: Date.now(),
      source: 'supabase',
    };

    cachedConfig = config;
    configFetchedAt = Date.now();
    return config;
  } catch (err) {
    console.error('[OfflineAPI] Failed to load config:', err);
    return null;
  }
}

// ─── POST Response Type ─────────────────────────────────────────────────

interface OfflinePostResponse {
  newState: GameState;
  productionSnapshot: ProductionSnapshot;
  ticksApplied: number;
  elapsedSeconds: number;
}

// ─── Main GET Handler ──────────────────────────────────────────────────

export async function GET(request: Request) {
  // ✅ Auth check
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  // ✅ Rate limit
  const rateLimitResponse = await checkRateLimit(auth.userId, RATE_LIMITS.compute, '/api/game/offline');
  if (rateLimitResponse) return rateLimitResponse;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable — database not configured' },
      { status: 503 }
    );
  }

  // Get player's last save from server_game_state (source of truth)
  const { data: sgs, error: sgsError } = await supabase
    .from('server_game_state')
    .select('full_state, last_saved_at, game_tick, game_speed')
    .eq('user_id', auth.userId)
    .single();

  if (sgsError || !sgs) {
    // Fallback to player_progress (backwards compat)
    const { data: pp, error: ppError } = await supabase
      .from('player_progress')
      .select('game_state')
      .eq('user_id', auth.userId)
      .single();

    if (ppError || !pp?.game_state) {
      return NextResponse.json({
        offlineTicks: 0,
        message: 'No previous save found',
      });
    }

    const gameState = pp.game_state as Record<string, unknown>;
    const gameSpeed = Number(gameState.gameSpeed) || 1;
    const lastGameTick = Number(gameState.gameTick) || 0;

    return NextResponse.json({
      offlineTicks: 0,
      lastSavedAt: null,
      elapsedMs: 0,
      expectedTick: lastGameTick,
      serverGameTick: 0,
      maxOfflineTicks: MAX_OFFLINE_TICKS,
      computeUrl: '/api/game/compute',
    });
  }

  const gameState = sgs.full_state as Record<string, unknown> | null;
  if (!gameState) {
    return NextResponse.json({
      offlineTicks: 0,
      message: 'No game state found',
    });
  }

  // Calculate time elapsed since last save
  const lastSavedAt = new Date(sgs.last_saved_at).getTime();
  const now = Date.now();
  const elapsedMs = Math.max(0, now - lastSavedAt);

  // Calculate offline ticks based on elapsed time
  // Account for game speed from saved state
  const gameSpeed = sgs.game_speed || Number(gameState.gameSpeed) || 1;
  const offlineTicks = Math.min(
    MAX_OFFLINE_TICKS,
    Math.floor((elapsedMs / TICK_INTERVAL_MS) * gameSpeed),
  );

  // Current tick from save
  const lastGameTick = sgs.game_tick || Number(gameState.gameTick) || 0;
  const expectedTick = lastGameTick + offlineTicks;

  return NextResponse.json({
    offlineTicks,
    lastSavedAt: sgs.last_saved_at,
    elapsedMs,
    expectedTick,
    serverGameTick: sgs.game_tick || 0,
    maxOfflineTicks: MAX_OFFLINE_TICKS,
    // Client should use /api/game/compute to actually run the ticks
    computeUrl: '/api/game/compute',
  });
}

// ─── Main POST Handler (Phase 2.5: Server-Authoritative) ────────────────

export async function POST(request: Request) {
  // ✅ Auth check
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  // ✅ Rate limit — use compute profile (offline precompute)
  const rateLimitResponse = await checkRateLimit(auth.userId, RATE_LIMITS.compute, '/api/game/offline');
  if (rateLimitResponse) return rateLimitResponse;

  // Read request body (for audit; ticks/gameState are NOT trusted)
  let body: { ticks?: number; gameState?: unknown; userId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional — proceed with defaults
  }

  // ✅ Ownership check: userId in request must match authenticated user
  if (body.userId && body.userId !== auth.userId) {
    console.warn(`[OfflineAPI] User ${auth.userId} attempted offline compute for ${body.userId}`);
    return NextResponse.json(
      { error: 'You can only compute offline progress for your own game', code: 'FORBIDDEN_OWNERSHIP' },
      { status: 403 },
    );
  }

  // ─── Load Authoritative Server State ──────────────────────────────────

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable — database not configured' },
      { status: 503 },
    );
  }

  const { data: serverState, error: stateError } = await supabase
    .from('server_game_state')
    .select('full_state, game_tick, game_speed, state_version, last_tick_at, money, is_locked, lock_reason')
    .eq('user_id', auth.userId)
    .single();

  if (stateError || !serverState) {
    return NextResponse.json(
      { error: 'No authoritative server state found', code: 'NO_SERVER_STATE' },
      { status: 404 },
    );
  }

  // ✅ Account lock check
  if (serverState.is_locked) {
    return NextResponse.json(
      { error: serverState.lock_reason || 'Account is locked', code: 'ACCOUNT_LOCKED' },
      { status: 403 },
    );
  }

  // ─── Compute Elapsed Ticks (Server-Authoritative) ─────────────────────
  // Use server's last_tick_at and game_speed — ignore any client-sent ticks

  const lastTickAt = new Date(serverState.last_tick_at).getTime();
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - lastTickAt) / 1000);

  // game_speed is ticks per real-world second (e.g., 1x = 1 tick/s, 2x = 2 tick/s)
  const gameSpeed = Number(serverState.game_speed) || 1;
  const rawTicks = Math.floor(elapsedSeconds * gameSpeed);
  const elapsedTicks = Math.min(rawTicks, MAX_OFFLINE_TICKS);

  // If no ticks elapsed, return current state as-is (no work to do)
  if (elapsedTicks <= 0) {
    return NextResponse.json({
      newState: serverState.full_state,
      productionSnapshot: null,
      ticksApplied: 0,
      elapsedSeconds: 0,
    });
  }

  // ─── Load Game Config ─────────────────────────────────────────────────

  const config = await loadFullConfig();
  if (!config) {
    return NextResponse.json(
      { error: 'Game config unavailable — cannot compute ticks' },
      { status: 503 },
    );
  }

  // ─── Run Server Ticks ─────────────────────────────────────────────────
  // Use serverState.full_state as the authoritative base — never client-sent gameState

  const baseGameState = serverState.full_state as GameState;
  let result: { newState: GameState; productionSnapshot: ProductionSnapshot };
  try {
    result = runServerTicks(baseGameState, elapsedTicks, config);
  } catch (err) {
    console.error('[OfflineAPI] runServerTicks failed:', err);
    return NextResponse.json(
      { error: 'Tick computation failed — server engine error' },
      { status: 500 },
    );
  }

  // ─── Persist to DB with Optimistic Locking ────────────────────────────

  const currentVersion = Number(serverState.state_version) || 0;
  const nextVersion = currentVersion + 1;
  const newGameTick = Number(serverState.game_tick) + elapsedTicks;
  const newMoney = result.newState.money ?? 0;

  const { data: updated, error: updateError } = await supabase
    .from('server_game_state')
    .update({
      full_state: result.newState,
      game_tick: newGameTick,
      state_version: nextVersion,
      last_tick_at: new Date().toISOString(),
      money: newMoney,
    })
    .eq('user_id', auth.userId)
    .eq('state_version', currentVersion) // optimistic lock
    .select('state_version')
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: 'Concurrent state change — please retry', code: 'STATE_VERSION_CONFLICT' },
      { status: 409 },
    );
  }

  // ─── Audit Log (fire-and-forget) ──────────────────────────────────────

  logActionAsync({
    userId: auth.userId,
    actionType: 'tick',
    payload: { offlineTicksRequested: body.ticks ?? null, offlineTicksApplied: elapsedTicks },
    gameTick: newGameTick,
    moneyAfter: newMoney,
    isValid: true,
  });

  // ─── Return Result ────────────────────────────────────────────────────

  return NextResponse.json({
    newState: result.newState,
    productionSnapshot: result.productionSnapshot,
    ticksApplied: elapsedTicks,
    elapsedSeconds,
  } satisfies OfflinePostResponse);
}
