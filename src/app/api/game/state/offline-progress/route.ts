// ============================================
// IndustriaX: Offline Progress API
// POST handler — server-authoritative offline tick
// computation with optimistic locking. Client-sent
// `ticks` and `gameState` are IGNORED. The server
// computes elapsed ticks from last_tick_at and runs
// runServerTicks() server-side.
//
// All gameplay-tuning constants (tick interval, max
// offline ticks, min offline floor) are server-driven
// via game_config_game. The route has NO code-level
// fallback for these values; if the DB is missing or
// returns invalid data, loadFullConfig() returns null
// and the route responds 503 (per RULES.md [SEC-002]).
// ============================================

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { logActionAsync } from "@/lib/auth/gameStateValidator";
import {
  loadServerGameStateForTick,
  saveServerGameStateOptimistic,
  isServerGameStateAvailable,
} from "@/lib/db/serverGameState";
import {
  DEFAULT_BALANCE_SUBSET,
  type SupabaseBuilding,
  type SupabaseRecipe,
  type SupabaseResearch,
  type SupabaseProductionChain,
  type SupabaseWorker,
  type SupabaseWeather,
  type SupabaseMarket,
  type SupabaseGameConfig,
  type GameConfig,
} from "@/lib/game/config/config";
import type {
  BuildingDefinition,
  ResourceAmount,
  ResourceType,
  CostResourceType,
  ServerGameData,
} from "@/lib/game/shared/types/types";
import type { ProductionSnapshot } from "@/lib/game/production/productionCalculator";
import { runServerTicks } from "@/lib/game/production/engine/serverEngine";
import { asFullState } from "@/lib/db/serverGameStatePayload";

// ─── In-Memory Config Cache ─────────────────────────────────────────────

let cachedConfig: GameConfig | null = null;
let configFetchedAt = 0;
// Server-operational constant: how long to cache the in-process
// config snapshot before re-querying Supabase. This is NOT a
// gameplay tunable (per RULES.md [ARC-002] intent) — it controls
// server load and DB pressure, not what the player experiences.
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

function rememberConfig(config: GameConfig): GameConfig {
  cachedConfig = config;
  configFetchedAt = Date.now();
  return config;
}

// ─── Helper: Parse cost JSON ────────────────────────────────────────────
// Fail-closed per RULES.md [SEC-002]: if the DB row has a null/missing
// cost, the caller must treat the building as malformed and abort the
// entire config load (return null from loadFullConfig → 503). We do NOT
// silently substitute a fake cost because that would mask DB integrity
// bugs and could let a player build something for a non-existent price.

function parseCostMap(
  costMap:
    Record<string, number> | Array<{ resource: string; amount: number }> | null,
): ResourceAmount[] {
  if (!costMap) {
    throw new Error(
      "[OfflineAPI] building has null/missing base_cost — refusing to fabricate a cost",
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

// ─── Helper: Type guard for ServerGameData ───────────────────────────
// RULES.md [PRF-012] — narrow `unknown` (JSONB value) at the trust boundary
// via a type predicate, rather than `as unknown as ServerGameData`. We only
// check for the fields the engine actually reads top-level; nested shape is
// validated by runServerTicks.

function isServerGameData(value: unknown): value is ServerGameData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.money === "number" &&
    typeof obj.gameTick === "number" &&
    typeof obj.gameSpeed === "number"
  );
}

// ─── Helper: Load Full Config from Supabase ──────────────────────────────

async function loadFullConfig(): Promise<GameConfig | null> {
  if (cachedConfig && Date.now() - configFetchedAt < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  const supabase = createServiceRoleClient();
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
      gameConfigRes,
    ] = await Promise.all([
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
      supabase
        .from("game_config_workers")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase
        .from("game_config_weather")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase
        .from("game_config_market")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase.from("game_config_game").select("*").single(),
    ]);

    if (buildingsRes.error || !buildingsRes.data) {
      console.error(
        "[OfflineAPI] Failed to fetch buildings:",
        buildingsRes.error,
      );
      return null;
    }
    if (recipesRes.error || !recipesRes.data) {
      console.error("[OfflineAPI] Failed to fetch recipes:", recipesRes.error);
      return null;
    }
    if (gameConfigRes.error || !gameConfigRes.data) {
      console.error(
        "[OfflineAPI] Failed to fetch game_config_game:",
        gameConfigRes.error,
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
    const gameConfigRow = gameConfigRes.data as SupabaseGameConfig;

    // ─── Validate offline-tick constants — fail-closed (RULES.md [SEC-002])
    // DB has CHECK constraints as the last line of defense, but we also
    // validate in code so a corrupt-but-not-rejected value (e.g. one that
    // bypassed the CHECK via a direct edit) cannot reach the request path.
    // After validation the values are typed `number` (not `unknown`),
    // per RULES.md [PRF-012] — no `unknown` propagating past this boundary.
    const tickIntervalMs = gameConfigRow.tick_interval_ms;
    const maxOfflineTicks = gameConfigRow.max_offline_ticks;
    const minOfflineMs = gameConfigRow.min_offline_ms;

    if (
      !Number.isInteger(tickIntervalMs) ||
      tickIntervalMs < 1 ||
      tickIntervalMs > 60_000
    ) {
      console.error(
        "[OfflineAPI] tick_interval_ms invalid:",
        tickIntervalMs,
      );
      return null;
    }
    if (
      !Number.isInteger(maxOfflineTicks) ||
      maxOfflineTicks < 1 ||
      maxOfflineTicks > 604_800
    ) {
      console.error(
        "[OfflineAPI] max_offline_ticks invalid:",
        maxOfflineTicks,
      );
      return null;
    }
    if (
      !Number.isInteger(minOfflineMs) ||
      minOfflineMs < 0 ||
      minOfflineMs > 3_600_000
    ) {
      console.error("[OfflineAPI] min_offline_ms invalid:", minOfflineMs);
      return null;
    }

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
      gameConfig: {
        tickIntervalMs,
        maxOfflineTicks,
        minOfflineMs,
      },
      balance: DEFAULT_BALANCE_SUBSET,
      productionChains: chains.map((c) => ({
        id: c.id,
        upstreamBuilding: c.upstream_building,
        downstreamBuilding: c.downstream_building,
        resourceId: c.resource_id,
      })),
      loadedAt: Date.now(),
      source: "supabase",
    };

    return rememberConfig(config);
  } catch (err) {
    console.error("[OfflineAPI] Failed to load config:", err);
    return null;
  }
}

// ─── POST Response Type ─────────────────────────────────────────────────

interface OfflinePostResponse {
  newState: ServerGameData;
  // null when elapsedTicks <= 0 (sub-floor absence or zero game_speed),
  // meaning no engine pass ran. Per RULES.md [SEC-011] — a required
  // (non-nullable) field must NOT receive `null`; use the type system to
  // express "absent" rather than literal null. Clients read this field
  // only when ticksApplied > 0.
  productionSnapshot: ProductionSnapshot | null;
  ticksApplied: number;
  elapsedSeconds: number;
}

// ─── Main POST Handler (Phase 2.5: Server-Authoritative) ────────────────

export async function POST(request: Request) {
  // ✅ Auth check
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  // ✅ Rate limit — use compute profile (offline precompute)
  const rateLimitResponse = await checkRateLimit(
    auth.userId,
    RATE_LIMITS.compute,
    "/api/game/state/offline-progress",
  );
  if (rateLimitResponse) return rateLimitResponse;

  // Read request body (for audit; ticks is NOT trusted — only logged)
  let body: { ticks?: number; userId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional — proceed with defaults
  }

  // ✅ Ownership check: userId in request must match authenticated user
  if (body.userId && body.userId !== auth.userId) {
    console.warn(
      `[OfflineAPI] User ${auth.userId} attempted offline compute for ${body.userId}`,
    );
    return NextResponse.json(
      {
        error: "You can only compute offline progress for your own game",
        code: "FORBIDDEN_OWNERSHIP",
      },
      { status: 403 },
    );
  }

  // ─── Load Authoritative Server State ──────────────────────────────────

  if (!isServerGameStateAvailable()) {
    return NextResponse.json(
      { error: "Service temporarily unavailable — database not configured" },
      { status: 503 },
    );
  }

  const serverState = await loadServerGameStateForTick(auth.userId);

  if (!serverState) {
    return NextResponse.json(
      { error: "No authoritative server state found", code: "NO_SERVER_STATE" },
      { status: 404 },
    );
  }

  // ✅ Account lock check
  if (serverState.is_locked) {
    return NextResponse.json(
      {
        error: serverState.lock_reason || "Account is locked",
        code: "ACCOUNT_LOCKED",
      },
      { status: 403 },
    );
  }

  // ─── Compute Elapsed Ticks (Server-Authoritative) ─────────────────────
  // Use server's last_tick_at and game_speed — ignore any client-sent ticks.
  // tickIntervalMs / maxOfflineTicks / minOfflineMs come from game_config_game
  // (validated in loadFullConfig). NO code-level fallbacks per RULES.md [SEC-002].

  // Load game config first so we can use server-driven tick constants.
  const config = await loadFullConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Game config unavailable — cannot compute ticks" },
      { status: 503 },
    );
  }

  // Coerce at the trust boundary (config.gameConfig is Record<string, unknown>
  // upstream). loadFullConfig already validated these are finite positive
  // integers; Number() here narrows to `number` with no `as` cast
  // (RULES.md [PRF-012] — no `unknown` propagating past trust boundary).
  const tickIntervalMs = Number(config.gameConfig.tickIntervalMs);
  const maxOfflineTicks = Number(config.gameConfig.maxOfflineTicks);
  const minOfflineMs = Number(config.gameConfig.minOfflineMs);

  const timeClient = createServiceRoleClient();
  if (!timeClient) {
    return NextResponse.json(
      { error: "Service temporarily unavailable — database not configured" },
      { status: 503 },
    );
  }
  const { data: serverNowData, error: serverNowError } =
    await timeClient.rpc("now_iso");
  if (serverNowError || !serverNowData) {
    console.error(
      "[OfflineAPI] Failed to read server time:",
      serverNowError?.message ?? "no data",
    );
    return NextResponse.json(
      { error: "Server time unavailable", code: "SERVER_TIME_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const serverNow = String(serverNowData);
  const lastTickAt = new Date(serverState.last_tick_at).getTime();
  const nowMs = new Date(serverNow).getTime();
  if (Number.isNaN(lastTickAt) || Number.isNaN(nowMs)) {
    console.error("[OfflineAPI] Invalid tick timestamp", {
      lastTickAt: serverState.last_tick_at,
      serverNow,
    });
    return NextResponse.json(
      { error: "Invalid tick timestamp", code: "INVALID_TICK_TIMESTAMP" },
      { status: 503 },
    );
  }

  const elapsedMs = Math.max(0, nowMs - lastTickAt);
  const elapsedSeconds = Math.floor(elapsedMs / tickIntervalMs);

  // Fail-closed on invalid game_speed (DB has CHECK 1|2|5|10 but if a
  // corrupt row bypasses it, we refuse the request rather than silently
  // substitute a default that masks the bug).
  const gameSpeed = Number(serverState.game_speed);
  if (!Number.isFinite(gameSpeed) || gameSpeed <= 0) {
    console.error(
      "[OfflineAPI] Invalid game_speed in server state:",
      serverState.game_speed,
    );
    return NextResponse.json(
      { error: "Invalid game speed in state", code: "INVALID_GAME_SPEED" },
      { status: 503 },
    );
  }

  const rawTicks = Math.floor((elapsedMs / tickIntervalMs) * gameSpeed);
  const elapsedTicks = Math.min(rawTicks, maxOfflineTicks);

  if (elapsedMs < minOfflineMs || elapsedTicks <= 0) {
    return NextResponse.json({
      newState: serverState.full_state,
      productionSnapshot: null,
      ticksApplied: 0,
      elapsedSeconds,
    });
  }

  // ─── Run Server Ticks ──────────────────────────────────────────────────
  // Use serverState.full_state as the authoritative base — never client-sent gameState

  // Validate at the trust boundary (RULES.md [PRF-012] — no `unknown`
  // propagating). full_state is JSONB in Supabase (typed `Json`); a type
  // predicate narrows it to ServerGameData with no `as` cast.
  const fullState = serverState.full_state;
  if (!isServerGameData(fullState)) {
    console.error(
      "[OfflineAPI] Corrupt full_state in server state:",
      typeof fullState,
    );
    return NextResponse.json(
      { error: "Corrupt game state", code: "INVALID_FULL_STATE" },
      { status: 503 },
    );
  }
  const baseGameState = fullState;

  let result: { newState: ServerGameData; productionSnapshot: ProductionSnapshot };
  try {
    result = runServerTicks(baseGameState, elapsedTicks, config);
  } catch (err) {
    console.error("[OfflineAPI] runServerTicks failed:", err);
    return NextResponse.json(
      { error: "Tick computation failed — server engine error" },
      { status: 500 },
    );
  }

  // ─── Persist to DB with Optimistic Locking ────────────────────────────
  // Fail-closed per RULES.md [SEC-011]: validate required server data and
  // refuse the request rather than silently substitute a default (e.g.
  // `Number(...) || 0` or `... ?? 0`) that would mask data corruption.

  const currentVersion = Number(serverState.state_version);
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    console.error(
      "[OfflineAPI] Invalid state_version in server state:",
      serverState.state_version,
    );
    return NextResponse.json(
      { error: "Invalid state version", code: "INVALID_STATE_VERSION" },
      { status: 503 },
    );
  }

  const previousGameTick = Number(serverState.game_tick);
  if (!Number.isInteger(previousGameTick) || previousGameTick < 0) {
    console.error(
      "[OfflineAPI] Invalid game_tick in server state:",
      serverState.game_tick,
    );
    return NextResponse.json(
      { error: "Invalid game tick", code: "INVALID_GAME_TICK" },
      { status: 503 },
    );
  }

  const newGameTick = previousGameTick + elapsedTicks;
  const newMoney = Number(result.newState.money);
  if (!Number.isFinite(newMoney) || newMoney < 0) {
    console.error(
      "[OfflineAPI] Engine returned invalid money:",
      result.newState.money,
    );
    return NextResponse.json(
      { error: "Engine produced invalid state", code: "INVALID_MONEY" },
      { status: 500 },
    );
  }

  const nextVersion = currentVersion + 1;

  const updated = await saveServerGameStateOptimistic(
    auth.userId,
    currentVersion, // optimistic lock
    {
      full_state: asFullState(result.newState),
      game_tick: newGameTick,
      state_version: nextVersion,
      last_tick_at: serverNow,
      last_saved_at: serverNow,
      money: newMoney,
    },
  );

  if (!updated) {
    return NextResponse.json(
      {
        error: "Concurrent state change — please retry",
        code: "STATE_VERSION_CONFLICT",
      },
      { status: 409 },
    );
  }

  // ─── Audit Log (fire-and-forget) ──────────────────────────────────────

  logActionAsync({
    userId: auth.userId,
    actionType: "tick",
    payload: {
      offlineTicksRequested: body.ticks ?? null,
      offlineTicksApplied: elapsedTicks,
    },
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
