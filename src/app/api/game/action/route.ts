// ============================================
// FACTORY DOMINION: Game Action Validation API
// POST endpoint that validates player actions
// using Supabase config (anti-cheat layer)
// LEAN MVP — no validated_actions, no PII
// ============================================

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { logActionAsync } from "@/lib/auth/gameStateValidator";
import {
  loadServerGameStateForAction,
  saveServerGameStateOptimistic,
  isServerGameStateAvailable,
} from "@/lib/db/serverGameState";
import {
  SupabaseBuilding,
  SupabaseRecipe,
  SupabaseResearch,
  SupabaseProductionChain,
  GameConfig,
} from "@/lib/game/config";
import {
  BuildingDefinition,
  ResourceAmount,
  ResourceType,
  CostResourceType,
  GameState,
} from "@/lib/game/types";
import {
  validateBuildAction,
  validateSellAction,
  validateBuyAction,
  validateResearchAction,
  validateUpgradeAction,
  validateTransportAction,
  validateToggleBuildingAction,
  validateUpgradeStorageAction,
  validateHireWorkerAction,
  validateAssignWorkerAction,
  validateCollectPayoutAction,
} from "@/lib/game/serverEngine";
import { applyElapsedTicks } from "@/lib/auth/applyElapsedTicks";
import type { ServerGameStateForAction } from "@/lib/db/serverGameState";

// ─── Types ──────────────────────────────────────────────────────────────

interface ActionRequest {
  userId?: string;
  requestId?: string; // Phase 4.3: UUID v4 nonce for replay protection
  actionType?: string; // New field matching client-side
  action?: string; // Legacy field
  payload: Record<string, unknown>;
  gameState: Partial<GameState>;
}

interface ActionResponse {
  valid: boolean;
  error?: string;
  code?: string;
  correctedState?: Partial<GameState>;
}

// ─── In-Memory Config Cache ─────────────────────────────────────────────

let cachedConfig: GameConfig | null = null;
let configFetchedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helper: Parse cost JSON ────────────────────────────────────────────

function parseCostMap(
  costMap:
    Record<string, number> | Array<{ resource: string; amount: number }> | null,
): ResourceAmount[] {
  if (!costMap) return [{ resource: "money", amount: 100 }];
  // Handle array format from Supabase: [{resource: 'money', amount: 500}]
  if (Array.isArray(costMap)) {
    return costMap.map((item) => ({
      resource: item.resource as CostResourceType,
      amount: item.amount,
    }));
  }
  // Handle legacy object format: {money: 500}
  return Object.entries(costMap).map(([resource, amount]) => ({
    resource: resource as CostResourceType,
    amount,
  }));
}

// ─── Helper: Load Config from Supabase ──────────────────────────────────

async function loadConfig(): Promise<GameConfig | null> {
  if (cachedConfig && Date.now() - configFetchedAt < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    throw new Error("Supabase service role not configured");
  }

  try {
    // Fetch critical tables for action validation
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

    // Transform buildings
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

    // Transform research
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
      tradableResourceIds: [],
      productionChains: chains.map((c) => ({
        id: c.id,
        upstreamBuilding: c.upstream_building,
        downstreamBuilding: c.downstream_building,
        resourceId: c.resource_id,
      })),
      loadedAt: Date.now(),
      source: "supabase",
    };

    cachedConfig = config;
    configFetchedAt = Date.now();
    return config;
  } catch (err) {
    console.error("[ActionAPI] Failed to load config:", err);
    return null;
  }
}

// ─── Action Handlers ────────────────────────────────────────────────────

function handleBuildAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const buildingType = payload.buildingType as string;
  if (!buildingType) {
    return { valid: false, error: "Missing buildingType in payload" };
  }

  return validateBuildAction(buildingType, gameState, config);
}

function handleSellAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const resource = payload.resource as string;
  const amount = payload.amount as number;

  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (!amount || amount <= 0) {
    return { valid: false, error: "Invalid amount in payload" };
  }

  return validateSellAction(resource, amount, gameState);
}

function handleBuyAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const resource = payload.resource as string;
  const amount = payload.amount as number;

  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (!amount || amount <= 0) {
    return { valid: false, error: "Invalid amount in payload" };
  }

  return validateBuyAction(resource, amount, gameState);
}

function handleResearchAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const researchId = payload.researchId as string;
  if (!researchId) {
    return { valid: false, error: "Missing researchId in payload" };
  }

  return validateResearchAction(researchId, gameState, config);
}

function handleUpgradeAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const buildingId = payload.buildingId as string;
  if (!buildingId) {
    return { valid: false, error: "Missing buildingId in payload" };
  }

  return validateUpgradeAction(buildingId, gameState, config);
}

function handleTransportAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const fromBuildingId = payload.fromBuildingId as string;
  const toBuildingId = payload.toBuildingId as string;
  const resource = payload.resource as string;

  if (!fromBuildingId || !toBuildingId) {
    return {
      valid: false,
      error: "Missing fromBuildingId or toBuildingId in payload",
    };
  }
  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }

  return validateTransportAction(
    fromBuildingId,
    toBuildingId,
    resource,
    gameState,
    config,
  );
}

function handleToggleBuildingAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const buildingId = payload.buildingId as string;
  const enabled = payload.enabled as boolean;

  if (!buildingId) {
    return { valid: false, error: "Missing buildingId in payload" };
  }
  if (typeof enabled !== "boolean") {
    return {
      valid: false,
      error: "Missing 'enabled' boolean in payload",
    };
  }

  return validateToggleBuildingAction(buildingId, enabled, gameState);
}

function handleUpgradeStorageAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const resource = payload.resource as string;
  const levels = payload.levels as number;

  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }
  if (typeof levels !== "number") {
    return { valid: false, error: "Missing 'levels' number in payload" };
  }

  return validateUpgradeStorageAction(resource, levels, gameState);
}

function handleHireWorkerAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
  config: GameConfig,
): ActionResponse {
  const workerType = payload.workerType as string;
  if (!workerType) {
    return { valid: false, error: "Missing workerType in payload" };
  }
  return validateHireWorkerAction(workerType, gameState, config);
}

function handleAssignWorkerAction(
  payload: Record<string, unknown>,
  gameState: Partial<GameState>,
): ActionResponse {
  const workerId = payload.workerId as string;
  const buildingId = payload.buildingId as string | null | undefined;
  if (!workerId) {
    return { valid: false, error: "Missing workerId in payload" };
  }
  // Normalize undefined -> null (matches the type: buildingId is string | null)
  const normalizedBuildingId = buildingId === undefined ? null : buildingId;
  return validateAssignWorkerAction(workerId, normalizedBuildingId, gameState);
}

function handleCollectPayoutAction(
  gameState: Partial<GameState>,
): ActionResponse {
  // collect_payout has no payload; the server reads state.pendingPayout
  // (which was computed by applyElapsedTicks -> runServerTicks).
  return validateCollectPayoutAction(gameState);
}

function handleSetGameSpeed(
  payload: Record<string, unknown>,
  serverState: { state_version: number },
  userId: string,
): ActionResponse {
  const speed = payload.speed as number;
  const ALLOWED_SPEEDS = [1, 2, 5, 10];

  if (typeof speed !== "number" || !ALLOWED_SPEEDS.includes(speed)) {
    return {
      valid: false,
      error: `Invalid game speed: ${speed}. Allowed: ${ALLOWED_SPEEDS.join(", ")}`,
    };
  }

  // Persist game_speed to server_game_state
  const currentVersion = Number(serverState.state_version) || 0;
  saveServerGameStateOptimistic(userId, currentVersion, {
    game_speed: speed,
    state_version: currentVersion + 1,
  }).catch((err) => {
    console.error("[ActionAPI] Failed to persist game_speed:", err);
  });

  return { valid: true };
}

// ─── Main POST Handler ──────────────────────────────────────────────────

export async function POST(request: Request) {
  // ✅ Auth check: Must be authenticated to validate actions
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  // ✅ Rate limit check
  const rateLimitResponse = await checkRateLimit(
    auth.userId,
    RATE_LIMITS.action,
    "/api/game/action",
  );
  if (rateLimitResponse) return rateLimitResponse;

  let body: ActionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { valid: false, error: "Invalid JSON body" } satisfies ActionResponse,
      { status: 400 },
    );
  }

  const { userId, requestId, action: legacyAction, actionType, payload } = body;
  const action = legacyAction || actionType; // Support both field names

  // ✅ Phase 3.7: userId is mandatory (audit M8).
  if (!userId) {
    return NextResponse.json(
      {
        valid: false,
        error: "userId is required in request body",
      } satisfies ActionResponse,
      { status: 400 },
    );
  }

  // ✅ Ownership check: userId in request must match authenticated user
  if (userId !== auth.userId) {
    console.warn(
      `[ActionAPI] User ${auth.userId} attempted action for ${userId}`,
    );
    return NextResponse.json(
      {
        valid: false,
        error: "You can only perform actions for your own game",
        code: "FORBIDDEN_OWNERSHIP",
      } satisfies ActionResponse,
      { status: 403 },
    );
  }

  // Validate action type
  const validActions = [
    "build",
    "sell",
    "buy",
    "research",
    "upgrade",
    "transport",
    "set_game_speed",
    "toggle_building",
    "upgrade_storage",
    "hire_worker",
    "assign_worker",
    "collect_payout",
  ];
  if (!action || !validActions.includes(action)) {
    return NextResponse.json(
      {
        valid: false,
        error: `Invalid action "${action}". Must be one of: ${validActions.join(", ")}`,
      } satisfies ActionResponse,
      { status: 400 },
    );
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      {
        valid: false,
        error: "Missing or invalid payload",
      } satisfies ActionResponse,
      { status: 400 },
    );
  }

  // Load config from Supabase (with cache)
  const config = await loadConfig();
  if (!config) {
    return NextResponse.json(
      {
        valid: false,
        error: "Game config unavailable — cannot validate action",
      } satisfies ActionResponse,
      { status: 503 },
    );
  }

  // ✅ Phase 2.3: Load authoritative server state from server_game_state.
  // NEVER trust the client-sent `gameState` — it can be tampered with via
  // __gameStore.setState or by replaying modified network requests.
  // The client-sent gameState is now ignored.
  if (!isServerGameStateAvailable()) {
    return NextResponse.json(
      {
        valid: false,
        error: "Server unavailable",
      } satisfies ActionResponse,
      { status: 503 },
    );
  }

  const serverState = await loadServerGameStateForAction(auth.userId);

  if (!serverState) {
    return NextResponse.json(
      {
        valid: false,
        error:
          "No authoritative server state found — initialize session first via /api/auth/initialize-guest or save via /api/game/state",
        code: "NO_SERVER_STATE",
      } satisfies ActionResponse,
      { status: 404 },
    );
  }

  // Phase 7: Tick injection. Advance resources/money/buildings by the
  // elapsed wall-clock time since the last server-side tick. This makes
  // per-second-tick authority server-driven without a per-second server
  // loop. Fail-closed: any DB/config error returns 503; do not silently
  // proceed with stale state.
  let activeServerState: ServerGameStateForAction = serverState;
  try {
    const elapsed = await applyElapsedTicks(
      (serverState.full_state as unknown as GameState) ?? ({} as GameState),
      serverState.last_tick_at ?? null,
      Number(serverState.game_speed) || 1,
    );
    // If elapsed > 0, persist the post-tick state immediately so subsequent
    // validators see fresh resources/money. Done BEFORE the action dispatch
    // so cost checks run against post-tick values.
    if (elapsed.elapsedTicks > 0) {
      const persisted = await saveServerGameStateOptimistic(
        auth.userId,
        serverState.state_version ?? 0,
        {
          full_state: elapsed.state as never,
          money: Number(elapsed.state.money) || 0,
          total_money_earned: Number(elapsed.state.totalMoneyEarned) || 0,
          buildings_count: Array.isArray(elapsed.state.buildings)
            ? elapsed.state.buildings.length
            : 0,
          state_version: (serverState.state_version ?? 0) + 1,
        },
      ).catch((err) => {
        console.error("[ActionAPI] Failed to persist elapsed-tick state:", err);
        return null;
      });
      if (!persisted) {
        return NextResponse.json(
          {
            valid: false,
            error: "Server failed to apply elapsed ticks — retry",
            code: "ELAPSED_TICK_PERSIST_FAILED",
          } satisfies ActionResponse,
          { status: 503 },
        );
      }
      activeServerState = persisted as ServerGameStateForAction;
    }
  } catch (err) {
    console.error("[ActionAPI] applyElapsedTicks failed:", err);
    return NextResponse.json(
      {
        valid: false,
        error: "Server tick computation unavailable — retry",
        code: "ELAPSED_TICK_FAILED",
      } satisfies ActionResponse,
      { status: 503 },
    );
  }

  // Use server state for validation (cast to Partial<GameState> for validator compat)
  const gameState = (activeServerState.full_state ?? {}) as Partial<GameState>;
  const serverGameTick = Number(activeServerState.game_tick) || 0;
  const serverMoney = Number(activeServerState.money) || 0;

  // Phase 4.3: Replay detection via requestId nonce.
  const actionHistory: string[] = Array.isArray(
    (activeServerState.full_state as Record<string, unknown>)?._action_history,
  )
    ? ((activeServerState.full_state as Record<string, unknown>)
        ._action_history as string[])
    : [];

  if (requestId !== undefined && requestId !== null) {
    if (actionHistory.includes(requestId)) {
      return NextResponse.json(
        {
          valid: false,
          error: "Duplicate request — possible replay attack",
          code: "REPLAY_DETECTED",
        } satisfies ActionResponse,
        { status: 409 },
      );
    }
  }

  // Dispatch to action handler
  let result: ActionResponse;

  switch (action) {
    case "build":
      result = handleBuildAction(payload, gameState, config);
      break;
    case "sell":
      result = handleSellAction(payload, gameState);
      break;
    case "buy":
      result = handleBuyAction(payload, gameState);
      break;
    case "research":
      result = handleResearchAction(payload, gameState, config);
      break;
    case "upgrade":
      result = handleUpgradeAction(payload, gameState, config);
      break;
    case "transport":
      result = handleTransportAction(payload, gameState, config);
      break;
    case "set_game_speed":
      result = handleSetGameSpeed(payload, serverState, auth.userId);
      break;
    case "toggle_building":
      result = handleToggleBuildingAction(payload, gameState);
      break;
    case "upgrade_storage":
      result = handleUpgradeStorageAction(payload, gameState);
      break;
    case "hire_worker":
      result = handleHireWorkerAction(payload, gameState, config);
      break;
    case "assign_worker":
      result = handleAssignWorkerAction(payload, gameState);
      break;
    case "collect_payout":
      result = handleCollectPayoutAction(gameState);
      break;
    default:
      result = { valid: false, error: `Unhandled action: ${action}` };
  }

  // Server-authoritative action application:
  // If the validator returned a `correctedState`, merge it into the stored
  // server state and persist immediately (atomic optimistic-locking write).
  // This is what guarantees client + server agree on money, buildings, and
  // resources after a build/upgrade/research/etc. action. The same persist
  // also folds in the Phase 4.3 requestId history append to avoid a second
  // version-conflict update.
  let appliedCorrectedState: Partial<GameState> | undefined;
  // Only persist via this block when:
  //   - Server returned a `correctedState` (build/upgrade/etc. — server owns
  //     the post-action state), OR
  //   - requestId was provided (replay-protection append needs to land).
  // `set_game_speed` already has its own persist in handleSetGameSpeed
  // (we don't want to double-bump state_version).
  const needPersist =
    result.valid &&
    Boolean(
      result.correctedState || (requestId !== undefined && requestId !== null),
    ) &&
    action !== "set_game_speed";
  if (needPersist) {
    appliedCorrectedState = result.correctedState;
    const historyAppend =
      requestId !== undefined && requestId !== null
        ? [...actionHistory, requestId].slice(-100)
        : actionHistory;
    const mergedFullState = {
      ...(activeServerState.full_state as Record<string, unknown>),
      ...(appliedCorrectedState ?? {}),
      ...(historyAppend !== actionHistory
        ? { _action_history: historyAppend }
        : {}),
    } as Record<string, unknown>;
    const persistedBuildings = (
      appliedCorrectedState as { buildings?: unknown }
    )?.buildings;
    const persistedBuildingsCount = Array.isArray(persistedBuildings)
      ? persistedBuildings.length
      : activeServerState.buildings_count;
    const currentVersion = activeServerState.state_version ?? 0;
    const nextVersion = currentVersion + 1;
    const persisted = await saveServerGameStateOptimistic(
      auth.userId,
      currentVersion,
      {
        full_state: mergedFullState as never,
        money:
          typeof appliedCorrectedState?.money === "number"
            ? appliedCorrectedState.money
            : Number(activeServerState.money),
        buildings_count: persistedBuildingsCount,
        state_version: nextVersion,
      },
    ).catch((err) => {
      console.error("[ActionAPI] Failed to persist correctedState:", err);
      return null;
    });
    if (!persisted) {
      // Persist failed (CAS mismatch or DB error). Refuse to apply the action
      // so the client doesn't commit to divergent state.
      return NextResponse.json(
        {
          valid: false,
          error: "Server failed to apply action — retry",
          code: "PERSIST_FAILED",
        } satisfies ActionResponse,
        { status: 503 },
      );
    }
  }

  // ✅ Audit log the action (single write to player_actions only).
  // Use post-action SERVER values (moneyAfter reflects the correctedState if
  // applied) so the audit log is trustworthy and replayable.
  const postActionMoney =
    typeof appliedCorrectedState?.money === "number"
      ? appliedCorrectedState.money
      : serverMoney;
  logActionAsync({
    userId: auth.userId,
    actionType: action as
      | "build"
      | "sell"
      | "buy"
      | "research"
      | "upgrade"
      | "transport"
      | "save"
      | "load"
      | "tick"
      | "prestige"
      | "import"
      | "claim_quest"
      | "hire_worker"
      | "assign_worker"
      | "upgrade_worker"
      | "start_drone_mission"
      | "collect_drone"
      | "buy_market"
      | "sell_market"
      | "toggle_building"
      | "upgrade_storage"
      | "collect_payout"
      | "set_game_speed"
      | "bulk_build"
      | "bulk_sell",
    payload: {
      ...payload,
      ...(appliedCorrectedState ? { applied: true } : {}),
    },
    gameTick: serverGameTick,
    moneyAfter: postActionMoney,
    isValid: result.valid,
    validationRisk: result.valid ? "none" : "high",
    rejectionReason: result.valid ? undefined : result.error,
  });

  // NOTE: Trade actions are handled by /api/game/trade.

  return NextResponse.json(result);
}
