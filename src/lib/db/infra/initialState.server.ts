// ============================================
// IndustryaX: Server-authoritative canonical initial GameState builder
// ============================================
//
// Phase 12 (2026-07-10) — fixes the P0 data-loss bug in which
// `initializeGuestGameState` inserted an empty `full_state = {}`.
// Client-side `createInitialState()` used to be the only source of
// truth for 30+ fields (resourceCapacity, drones, weather,
// payoutConfig, megaProjects, quests, stats, etc.); on a 409
// auto-hydrate the client would fetch the empty `{}` and silently
// wipe state.
//
// This module builds the same canonical shape server-side, driven
// entirely by rows in `game_config_*` tables. All new guest inserts
// go through `fetchCanonicalInitialState()`. The result is cached
// for 5 minutes to match `configLoader.server.ts` semantics.
//
// Fail-closed: any DB / RPC failure throws. Callers translate to 5xx.

import { createServiceRoleClient } from '@/lib/db/access';;
import { ensureConfigLoaded } from "@/lib/game/config/server/configLoader.server";
import {
  INITIAL_MARKET,
  AUTOMATION_UNLOCKS,
  PRESTIGE_BONUSES,
  QUEST_DEFS,
  INITIAL_MEGA_PROJECTS,
} from "@/lib/game/config/configCache";
import type { ServerGameData, ResourceType, WeatherType } from "@/lib/game/shared/types/types";

const INITIAL_STATE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  state: ServerGameData;
  loadedAt: number;
}

let cache: CacheEntry | null = null;

interface GameConfigRow {
  starting_money: number;
  base_payout_interval: number;
  weather_change_min_ticks: number;
  weather_change_max_ticks: number;
  initial_drone_speed_level: number;
  initial_drone_capacity_level: number;
  initial_drone_fuel_efficiency_level: number;
}

interface ResourceRow {
  id: string;
  base_capacity: number;
}

/**
 * Build a fresh canonical ServerGameData from Supabase config tables.
 *
 * Reads:
 *   • game_config_resources (id, base_capacity)  → resources + resourceCapacity
 *   • game_config_game (starting_money, base_payout_interval,
 *                       weather cadence, initial drone defaults)
 *   • configCache (INITIAL_MARKET, AUTOMATION_UNLOCKS,
 *                  PRESTIGE_BONUSES, QUEST_DEFS, INITIAL_MEGA_PROJECTS)
 *
 * Phase 13 (2026-07-10): returns ServerGameData only. NO UI fields.
 * The client store merges these into UISessionState (activeTab,
 * notifications, hydrated, ...) locally.
 *
 * Rules:
 *   • money = starting_money
 *   • totalMoneyEarned = 0 (spend/income invariant — seed is NOT earned)
 *   • drones.fleet[0].id = crypto.randomUUID() (SEC-007)
 *   • weather.nextChange = min + serverRandom(0, max-min)
 *
 * Cached 5 minutes. Any subsequent config edit will show up on the
 * next TTL boundary.
 */
export async function fetchCanonicalInitialState(): Promise<ServerGameData> {
  const now = Date.now();
  const cached = cache;
  if (cached && now - cached.loadedAt < INITIAL_STATE_TTL_MS) {
    return cloneState(cached.state);
  }

  // Ensure INITIAL_MARKET / AUTOMATION_UNLOCKS / PRESTIGE_BONUSES / QUEST_DEFS
  // / INITIAL_MEGA_PROJECTS are populated in configCache.
  const configResult = await ensureConfigLoaded();
  if (!configResult.ok) {
    throw new Error(
      `[fetchCanonicalInitialState] Config unavailable: ${configResult.error ?? configResult.partialErrors.join(", ")}`,
    );
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    throw new Error(
      "[fetchCanonicalInitialState] Supabase service role client not configured",
    );
  }

  const [resourcesRes, gameRes] = await Promise.all([
    supabase
      .from("game_config_resources")
      .select("id, base_capacity"),
    supabase
      .from("game_config_game")
      .select(
        "starting_money, base_payout_interval, weather_change_min_ticks, weather_change_max_ticks, initial_drone_speed_level, initial_drone_capacity_level, initial_drone_fuel_efficiency_level",
      )
      .limit(1),
  ]);

  if (resourcesRes.error || !resourcesRes.data || resourcesRes.data.length === 0) {
    throw new Error(
      `[fetchCanonicalInitialState] game_config_resources unavailable: ${resourcesRes.error?.message ?? "empty"}`,
    );
  }
  if (gameRes.error || !gameRes.data || gameRes.data.length === 0) {
    throw new Error(
      `[fetchCanonicalInitialState] game_config_game unavailable: ${gameRes.error?.message ?? "empty"}`,
    );
  }

  const resourceRows = resourcesRes.data as ResourceRow[];
  const game = gameRes.data[0] as GameConfigRow;

  // Build resources / capacity / storageUpgradeLevels / stats resource maps
  const resources = {} as Record<ResourceType, number>;
  const resourceCapacity = {} as Record<ResourceType, number>;
  const zeroResources = {} as Record<ResourceType, number>;
  for (const row of resourceRows) {
    const key = row.id as ResourceType;
    resources[key] = 0;
    resourceCapacity[key] = Number(row.base_capacity) || 0;
    zeroResources[key] = 0;
  }

  // Weather cadence — server-side random (replaces client Math.random()).
  const wmin = Number(game.weather_change_min_ticks) || 100;
  const wmax = Number(game.weather_change_max_ticks) || 300;
  const nextChange = wmin + Math.floor(Math.random() * Math.max(1, wmax - wmin));

  const state: ServerGameData = {
    money: Number(game.starting_money) || 0,
    totalMoneyEarned: 0,
    gameTick: 0,
    gameSpeed: 1,
    paused: false,

    resources,
    resourceCapacity,

    buildings: [],
    transportLines: [],
    powerGrid: {
      totalProduction: 0,
      totalConsumption: 0,
      efficiency: 1,
      overload: false,
      plants: [],
    },

    researchPoints: 0,
    completedResearch: [],
    activeResearch: null,
    researchProgress: 0,
    researchQueue: [],

    workers: [],

    market: INITIAL_MARKET.map((m) => ({ ...m })),
    sectorTrends: {},
    marketNews: [],
    marketNarratives: [],
    serverMarket: {
      prices: [],
      news: [],
      tick: 0,
      volatility: 0,
    },

    contracts: [],
    completedContracts: 0,

    automationUnlocks: AUTOMATION_UNLOCKS.map((a) => ({ ...a })),

    prestigeState: {
      corporationPoints: 0,
      totalPrestiges: 0,
      megaFactoryUnlocked: false,
      bonuses: PRESTIGE_BONUSES.map((b) => ({ ...b })),
    },

    activeEvents: [],
    eventLog: [],

    stats: {
      totalResourcesProduced: { ...zeroResources },
      totalResourcesSold: { ...zeroResources },
      peakEfficiency: 0,
      factoriesBuilt: 0,
      transportLinesBuilt: 0,
      researchCompleted: 0,
      contractsCompleted: 0,
      playTime: 0,
    },

    megaProjects: INITIAL_MEGA_PROJECTS.map((p) => ({
      ...p,
      stages: p.stages.map((s) => ({ ...s })),
    })),

    productionHistory: [],
    blueprints: [],
    autoSellResources: [],
    storageUpgradeLevels: { ...zeroResources },
    lastOnlineTimestamp: Date.now(),

    leaderboardEntries: [],
    loginStreak: {
      currentStreak: 0,
      longestStreak: 0,
      lastLoginDate: "",
      totalLogins: 0,
      weeklyRewards: [],
    },

    weather: {
      current: "clear" as WeatherType,
      intensity: 0,
      remaining: 0,
      nextChange,
    },

    quests: QUEST_DEFS.map((q) => ({
      ...q,
      steps: q.steps.map((s) => ({ ...s })),
    })),

    payoutConfig: {
      basePayoutInterval: Number(game.base_payout_interval) || 100,
      lastPayoutTick: 0,
      totalPayoutsReceived: 0,
      autoCollect: true,
    },
    pendingPayout: 0,
    payoutHistory: [],
    trackedQuest: null,

    drones: {
      fleet: [
        {
          id: crypto.randomUUID(),
          status: "idle" as const,
          missionEndTick: 0,
          missionId: null,
          speedLevel: Number(game.initial_drone_speed_level) || 1,
          capacityLevel: Number(game.initial_drone_capacity_level) || 1,
          fuelEfficiencyLevel:
            Number(game.initial_drone_fuel_efficiency_level) || 1,
        },
      ],
      completedMissions: 0,
      totalEarned: 0,
    },

    // Phase 13: NO UI fields here. Server returns pure ServerGameData.
    // activeTab, selectedBuilding, notifications, productionSnapshot,
    // hydrated are added by the client store on merge.
  };

  cache = { state, loadedAt: now };
  return cloneState(state);
}

/** Force the next call to re-fetch. Used by admin config-invalidation. */
export function invalidateCanonicalInitialStateCache(): void {
  cache = null;
}

/**
 * Deep-clone the cached template so callers can freely mutate without
 * poisoning other consumers. Uses structuredClone (Node 17+, Next.js 16 OK).
 */
function cloneState(state: ServerGameData): ServerGameData {
  // Refresh volatile fields on every clone.
  const cloned = structuredClone(state);
  cloned.lastOnlineTimestamp = Date.now();
  // Give each guest their own drone id so backfilled fleets do not collide.
  if (cloned.drones.fleet.length > 0) {
    cloned.drones.fleet[0].id = crypto.randomUUID();
  }
  return cloned;
}
