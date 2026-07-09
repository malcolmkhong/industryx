import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeMaxPossibleMoney } from "@/lib/game/serverTickValidator";
import { listInvestigations, countResolvedSince } from "@/lib/db/cheatInvestigations";
import type { GameState } from "@/lib/game/types";
import type {
  GameConfig,
  SupabaseBuilding,
  SupabaseRecipe,
  SupabaseResearch,
  SupabaseProductionChain,
  SupabaseWorker,
  SupabaseWeather,
  SupabaseMarket,
} from "@/lib/game/config";
import type { BuildingDefinition, ResourceAmount, ResourceType, CostResourceType } from "@/lib/game/types";

// ─── Detection type human-readable labels ───────────────────────────────

const DETECTION_TYPE_LABELS: Record<string, string> = {
  money_manipulation: "Money Manipulation",
  tick_manipulation: "Tick Manipulation",
  invalid_building: "Invalid Building",
  invalid_research: "Invalid Research",
  speed_hack: "Speed Hack",
  import_hack: "Import Hack",
  state_tampering: "State Tampering",
  negative_resources: "Negative Resources",
  impossible_progression: "Impossible Progression",
  gradual_money_inflation: "Gradual Money Inflation",
  other: "Other",
};

// ─── In-Memory Config Cache (shared with compute route pattern) ─────────

let cachedConfig: GameConfig | null = null;
let configFetchedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helper: Parse cost JSON ────────────────────────────────────────────

function parseCostMap(
  costMap:
    | Record<string, number>
    | Array<{ resource: string; amount: number }>
    | null,
): ResourceAmount[] {
  if (!costMap) return [{ resource: "money", amount: 100 }];
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

// ─── Helper: Load Full Config from Supabase ─────────────────────────────

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
    ]);

    if (buildingsRes.error || !buildingsRes.data) {
      console.error(
        "[Admin/Investigations] Failed to fetch buildings:",
        buildingsRes.error,
      );
      return null;
    }
    if (recipesRes.error || !recipesRes.data) {
      console.error(
        "[Admin/Investigations] Failed to fetch recipes:",
        recipesRes.error,
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
                ...(b.unlock_research
                  ? { research: b.unlock_research }
                  : {}),
                ...(b.unlock_prestige
                  ? { prestige: b.unlock_prestige }
                  : {}),
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
      gameConfig: {},
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
    console.error("[Admin/Investigations] Failed to load config:", err);
    return null;
  }
}

// ─── POST body types ────────────────────────────────────────────────────

interface ResetMoneyBody {
  action: "reset-money";
  userId: string;
}

interface LockAccountBody {
  action: "lock-account";
  userId: string;
  reason: string;
}

type InvestigationActionBody = ResetMoneyBody | LockAccountBody;

/**
 * GET /api/admin/investigations
 * List cheat investigations with filters and pagination.
 * Query params: status, severity, detection_type, page, limit
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service temporarily unavailable — database not configured" },
        { status: 503 },
      );
    }
    const url = new URL(request.url);

    const status = url.searchParams.get("status") || "";
    const severity = url.searchParams.get("severity") || "";
    const detectionType = url.searchParams.get("detection_type") || "";
    const page = Math.max(
      1,
      parseInt(url.searchParams.get("page") || "1", 10),
    );
    const limit = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)),
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Fetch investigations via centralized helper
    const { data: investigations, total } = await listInvestigations({
      ...(status ? { status: status as 'open' | 'resolved' | 'dismissed' } : {}),
      ...(severity ? { severity: severity as 'low' | 'medium' | 'high' | 'critical' } : {}),
      ...(detectionType ? { detectionType } : {}),
      from,
      to,
    });

    // Batch lookup user emails via Supabase Auth Admin API
    let emailMap: Record<string, string> = {};
    const userIds = [
      ...new Set(
        (investigations || [])
          .map((inv: Record<string, unknown>) => inv.user_id as string)
          .filter(Boolean),
      ),
    ];

    if (userIds.length > 0) {
      try {
        const { data: usersData, error: usersError } =
          await supabase.auth.admin.listUsers();

        if (!usersError && usersData?.users) {
          for (const user of usersData.users) {
            if (userIds.includes(user.id)) {
              emailMap[user.id] = user.email ?? "";
            }
          }
        }
      } catch (authErr) {
        console.error(
          "[Admin/Investigations] Error fetching user emails:",
          authErr,
        );
      }
    }

    // Also fetch resolved_by admin emails
    const resolvedByIds = [
      ...new Set(
        (investigations || [])
          .map((inv: Record<string, unknown>) => inv.resolved_by as string)
          .filter(Boolean),
      ),
    ];

    let resolvedByEmailMap: Record<string, string> = {};
    if (resolvedByIds.length > 0) {
      try {
        const { data: adminUsers } = await supabase
          .from("admin_users")
          .select("user_id, email")
          .in("user_id", resolvedByIds);

        if (adminUsers) {
          for (const admin of adminUsers) {
            resolvedByEmailMap[admin.user_id] = admin.email;
          }
        }
      } catch {
        // Non-critical, skip
      }
    }

    // Enrich investigations with email info
    const enrichedInvestigations = (investigations || []).map(
      (inv: Record<string, unknown>) => ({
        ...inv,
        user_email: emailMap[inv.user_id as string] || null,
        resolved_by_email:
          resolvedByEmailMap[inv.resolved_by as string] || null,
      }),
    );

    const totalPages = Math.ceil(total / limit);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const resolvedToday = await countResolvedSince(today.toISOString());

    const response = NextResponse.json({
      data: enrichedInvestigations,
      detection_types: DETECTION_TYPE_LABELS,
      resolved_today: resolvedToday,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });

    return withSecurityHeaders(response);
  } catch (err) {
    console.error(
      "[Admin/Investigations] Error listing investigations:",
      err,
    );
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "Failed to list investigations",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/investigations
 * Perform admin actions on investigations.
 * Body: { action: "reset-money" | "lock-account", userId, ... }
 */
export async function POST(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  let body: InvestigationActionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { action, userId } = body;

  if (!action || !userId || typeof userId !== "string") {
    return NextResponse.json(
      { error: "Missing required fields: action, userId" },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  // ── Action: Reset money to theoretical max ──────────────────────────

  if (action === "reset-money") {
    try {
      // Load server game state for the target user
      const { data: serverState, error: stateError } = await supabase
        .from("server_game_state")
        .select("money, full_state, game_tick")
        .eq("user_id", userId)
        .single();

      if (stateError || !serverState) {
        return NextResponse.json(
          {
            error: "No server game state found for this user",
            code: "NO_SERVER_STATE",
          },
          { status: 404 },
        );
      }

      // Load game config for max-money computation
      const config = await loadFullConfig();
      if (!config) {
        return NextResponse.json(
          { error: "Game config unavailable — cannot compute max money" },
          { status: 503 },
        );
      }

      const gameState = serverState.full_state as GameState;
      const currentMoney = gameState.money;

      // Compute theoretical max. Use game_tick as elapsed ticks since
      // initialization — computeMaxPossibleMoney returns current money
      // plus what could have been earned over elapsedTicks.
      const elapsedTicks =
        typeof serverState.game_tick === "number"
          ? serverState.game_tick
          : gameState.gameTick || 0;
      const maxMoney = computeMaxPossibleMoney(gameState, elapsedTicks, config);

      // Only reset if money exceeds the theoretical max
      const resetMoney =
        currentMoney > maxMoney ? maxMoney : currentMoney;

      // Update server_game_state.money and full_state.money
      const updatedFullState = {
        ...gameState,
        money: resetMoney,
      };

      const { error: updateError } = await supabase
        .from("server_game_state")
        .update({
          money: resetMoney,
          full_state: updatedFullState,
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error(
          "[Admin/Investigations] Failed to update server_game_state:",
          updateError.message,
        );
        return NextResponse.json(
          {
            error: "Failed to update game state",
            message: updateError.message,
          },
          { status: 500 },
        );
      }

      // Log the admin action to player_actions
      const { error: logError } = await supabase.from("player_actions").insert({
        user_id: userId,
        action_type: "admin_money_reset",
        payload: {
          previous_money: currentMoney,
          reset_money: resetMoney,
          max_possible_money: maxMoney,
          was_over_max: currentMoney > maxMoney,
          admin_id: authResult.admin.id,
          admin_email: authResult.admin.email,
        },
        game_tick: gameState.gameTick || 0,
        created_at: new Date().toISOString(),
      });

      if (logError) {
        console.error(
          "[Admin/Investigations] Failed to log admin_money_reset:",
          logError.message,
        );
        // Non-fatal — the money reset already succeeded
      }

      return NextResponse.json({
        success: true,
        action: "reset-money",
        userId,
        previousMoney: currentMoney,
        resetMoney,
        maxPossibleMoney: maxMoney,
        wasOverMax: currentMoney > maxMoney,
      });
    } catch (err) {
      console.error(
        "[Admin/Investigations] Error in reset-money:",
        err,
      );
      return NextResponse.json(
        {
          error: "Internal Server Error",
          message: "Failed to reset money",
        },
        { status: 500 },
      );
    }
  }

  // ── Action: Lock account ────────────────────────────────────────────

  if (action === "lock-account") {
    const reason: string = (body as LockAccountBody).reason;
    if (!reason || typeof reason !== "string") {
      return NextResponse.json(
        { error: "Missing required field: reason" },
        { status: 400 },
      );
    }

    try {
      const { error: rpcError } = await supabase.rpc(
        "lock_cheater_account",
        {
          p_user_id: userId,
          p_reason: reason,
        },
      );

      if (rpcError) {
        console.error(
          "[Admin/Investigations] Failed to lock account:",
          rpcError.message,
        );
        return NextResponse.json(
          {
            error: "Failed to lock account",
            message: rpcError.message,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        action: "lock-account",
        userId,
        reason,
      });
    } catch (err) {
      console.error(
        "[Admin/Investigations] Error in lock-account:",
        err,
      );
      return NextResponse.json(
        {
          error: "Internal Server Error",
          message: "Failed to lock account",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}` },
    { status: 400 },
  );
}
