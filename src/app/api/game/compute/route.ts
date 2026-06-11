// ============================================
// FACTORY DOMINION: Game Compute API
// POST endpoint that computes game ticks
// server-side using Supabase config
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
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

// ─── Types ──────────────────────────────────────────────────────────────

interface ComputeRequest {
  userId: string;
  gameState: GameState;
  ticks: number;
}

interface ComputeResponse {
  newState: GameState;
  productionSnapshot: ProductionSnapshot;
}

// ─── In-Memory Config Cache ─────────────────────────────────────────────

let cachedConfig: GameConfig | null = null;
let configFetchedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helper: Parse cost JSON ────────────────────────────────────────────

function parseCostMap(costMap: Record<string, number> | Array<{resource: string; amount: number}> | null): ResourceAmount[] {
  if (!costMap) return [{ resource: 'money', amount: 100 }];
  // Handle array format from Supabase: [{resource: 'money', amount: 500}]
  if (Array.isArray(costMap)) {
    return costMap.map(item => ({
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
    // Fetch all tables needed for full computation
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

    // Critical tables check
    if (buildingsRes.error || !buildingsRes.data) {
      console.error('[ComputeAPI] Failed to fetch buildings:', buildingsRes.error);
      return null;
    }
    if (recipesRes.error || !recipesRes.data) {
      console.error('[ComputeAPI] Failed to fetch recipes:', recipesRes.error);
      return null;
    }

    const buildings = buildingsRes.data as SupabaseBuilding[];
    const recipes = recipesRes.data as SupabaseRecipe[];
    const research = (researchRes.data as SupabaseResearch[]) ?? [];
    const chains = (chainsRes.data as SupabaseProductionChain[]) ?? [];
    const workers = (workersRes.data as SupabaseWorker[]) ?? [];
    const weather = (weatherRes.data as SupabaseWeather[]) ?? [];
    const market = (marketRes.data as SupabaseMarket[]) ?? [];

    // Transform buildings
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

    // Transform weather
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
    console.error('[ComputeAPI] Failed to load config:', err);
    return null;
  }
}

// ─── Main POST Handler ──────────────────────────────────────────────────

export async function POST(request: Request) {
  // ✅ Auth check: Must be authenticated to compute ticks
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  // ✅ Rate limit check
  const rateLimitResponse = await checkRateLimit(auth.userId, RATE_LIMITS.compute, '/api/game/compute');
  if (rateLimitResponse) return rateLimitResponse;

  let body: ComputeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { userId, gameState, ticks } = body;

  // ✅ Ownership check: userId in request must match authenticated user
  if (userId && userId !== auth.userId) {
    console.warn(`[ComputeAPI] User ${auth.userId} attempted compute for ${userId}`);
    return NextResponse.json(
      { error: 'You can only compute for your own game', code: 'FORBIDDEN_OWNERSHIP' },
      { status: 403 },
    );
  }

  // Validate inputs
  if (!gameState || typeof gameState !== 'object') {
    return NextResponse.json(
      { error: 'Missing or invalid gameState' },
      { status: 400 },
    );
  }

  if (!ticks || typeof ticks !== 'number' || ticks <= 0) {
    return NextResponse.json(
      { error: 'Invalid ticks value. Must be a positive number.' },
      { status: 400 },
    );
  }

  // Cap maximum ticks to prevent abuse
  const MAX_TICKS = 60000; // ~16 hours of game time at 1x speed
  const cappedTicks = Math.min(ticks, MAX_TICKS);

  if (cappedTicks !== ticks) {
    console.warn(`[ComputeAPI] Ticks capped from ${ticks} to ${MAX_TICKS}`);
  }

  // Load config from Supabase (with cache)
  const config = await loadFullConfig();
  if (!config) {
    return NextResponse.json(
      { error: 'Game config unavailable — cannot compute ticks' },
      { status: 503 },
    );
  }

  try {
    // Run the server-side tick computation
    const result = runServerTicks(gameState, cappedTicks, config);

    const response: ComputeResponse = {
      newState: result.newState,
      productionSnapshot: result.productionSnapshot,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[ComputeAPI] Computation error:', err);
    return NextResponse.json(
      { error: 'Computation failed', details: String(err) },
      { status: 500 },
    );
  }
}
