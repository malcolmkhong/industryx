// ============================================
// FACTORY DOMINION: Game Action Validation API
// POST endpoint that validates player actions
// using Supabase config (anti-cheat layer)
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  SupabaseBuilding,
  SupabaseRecipe,
  SupabaseResearch,
  SupabaseProductionChain,
  GameConfig,
} from '@/lib/game/config';
import { BuildingDefinition, ResourceAmount, ResourceType, CostResourceType, GameState } from '@/lib/game/types';
import {
  validateBuildAction,
  validateSellAction,
  validateBuyAction,
  validateResearchAction,
  validateUpgradeAction,
  validateTransportAction,
} from '@/lib/game/serverEngine';

// ─── Types ──────────────────────────────────────────────────────────────

interface ActionRequest {
  action: 'build' | 'sell' | 'buy' | 'research' | 'upgrade' | 'transport';
  payload: Record<string, unknown>;
  gameState: Partial<GameState>;
}

interface ActionResponse {
  valid: boolean;
  error?: string;
  correctedState?: Partial<GameState>;
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

// ─── Helper: Load Config from Supabase ──────────────────────────────────

async function loadConfig(): Promise<GameConfig | null> {
  if (cachedConfig && (Date.now() - configFetchedAt) < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  const supabase = createServiceRoleClient();

  try {
    // Fetch critical tables for action validation
    const [buildingsRes, recipesRes, researchRes, chainsRes] = await Promise.all([
      supabase.from('game_config_buildings').select('*').order('sort_order', { ascending: true, nullsFirst: false }),
      supabase.from('game_config_production_recipes').select('*'),
      supabase.from('game_config_research').select('*').order('sort_order', { ascending: true, nullsFirst: false }),
      supabase.from('game_config_production_chains').select('*'),
    ]);

    if (buildingsRes.error || !buildingsRes.data) {
      console.error('[ActionAPI] Failed to fetch buildings:', buildingsRes.error);
      return null;
    }
    if (recipesRes.error || !recipesRes.data) {
      console.error('[ActionAPI] Failed to fetch recipes:', recipesRes.error);
      return null;
    }
    if (researchRes.error || !researchRes.data) {
      console.error('[ActionAPI] Failed to fetch research:', researchRes.error);
      return null;
    }

    const buildings = buildingsRes.data as SupabaseBuilding[];
    const recipes = recipesRes.data as SupabaseRecipe[];
    const research = researchRes.data as SupabaseResearch[];
    const chains = (chainsRes.data as SupabaseProductionChain[]) ?? [];

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

    // Transform research
    const researchList = research.map(r => ({
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
    console.error('[ActionAPI] Failed to load config:', err);
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
    return { valid: false, error: 'Missing buildingType in payload' };
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
    return { valid: false, error: 'Missing resource in payload' };
  }
  if (!amount || amount <= 0) {
    return { valid: false, error: 'Invalid amount in payload' };
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
    return { valid: false, error: 'Missing resource in payload' };
  }
  if (!amount || amount <= 0) {
    return { valid: false, error: 'Invalid amount in payload' };
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
    return { valid: false, error: 'Missing researchId in payload' };
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
    return { valid: false, error: 'Missing buildingId in payload' };
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
    return { valid: false, error: 'Missing fromBuildingId or toBuildingId in payload' };
  }
  if (!resource) {
    return { valid: false, error: 'Missing resource in payload' };
  }

  return validateTransportAction(fromBuildingId, toBuildingId, resource, gameState, config);
}

// ─── Main POST Handler ──────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: ActionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { valid: false, error: 'Invalid JSON body' } satisfies ActionResponse,
      { status: 400 },
    );
  }

  const { action, payload, gameState } = body;

  // Validate action type
  const validActions = ['build', 'sell', 'buy', 'research', 'upgrade', 'transport'];
  if (!action || !validActions.includes(action)) {
    return NextResponse.json(
      { valid: false, error: `Invalid action "${action}". Must be one of: ${validActions.join(', ')}` } satisfies ActionResponse,
      { status: 400 },
    );
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json(
      { valid: false, error: 'Missing or invalid payload' } satisfies ActionResponse,
      { status: 400 },
    );
  }

  if (!gameState || typeof gameState !== 'object') {
    return NextResponse.json(
      { valid: false, error: 'Missing or invalid gameState' } satisfies ActionResponse,
      { status: 400 },
    );
  }

  // Load config from Supabase (with cache)
  const config = await loadConfig();
  if (!config) {
    return NextResponse.json(
      { valid: false, error: 'Game config unavailable — cannot validate action' } satisfies ActionResponse,
      { status: 503 },
    );
  }

  // Dispatch to action handler
  let result: ActionResponse;

  switch (action) {
    case 'build':
      result = handleBuildAction(payload, gameState, config);
      break;
    case 'sell':
      result = handleSellAction(payload, gameState);
      break;
    case 'buy':
      result = handleBuyAction(payload, gameState);
      break;
    case 'research':
      result = handleResearchAction(payload, gameState, config);
      break;
    case 'upgrade':
      result = handleUpgradeAction(payload, gameState, config);
      break;
    case 'transport':
      result = handleTransportAction(payload, gameState, config);
      break;
    default:
      result = { valid: false, error: `Unhandled action: ${action}` };
  }

  return NextResponse.json(result);
}
