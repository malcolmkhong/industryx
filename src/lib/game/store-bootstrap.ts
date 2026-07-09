// ============================================
// Store bootstrap — minimal stub state used before hydration.
// ============================================
//
// Phase 13 (2026-07-10, Option C). The store is now built from two layers:
//
//   1. ServerGameData  — pure data. Server-owned. Stub = empty / zeros.
//   2. UISessionState  — client-only presentation. Stub = empty.
//
// The store is created synchronously at module load, but the canonical
// initial state lives server-side in `game_config_*` tables. So the
// store starts from a STUB and is hydrated asynchronously via
//   • GET /api/game/initial-state  (fresh guest / first paint)
//   • applyServerState()           (cloud load, refetches via /api/game/state)
//
// Consumers MUST gate any resource / building / drone / weather UI
// on `state.hydrated === true`. See GameShell for the render gate.
//
// Phase 13 architecture:
//   Server returns ONLY ServerGameData. Client adds UISessionState on
//   merge via `mergeCanonicalWithUI()`. Strict separation — server
//   never sees activeTab/notifications/hydrated/selectedBuilding.

import type {
  ServerGameData,
  UISessionState,
  GameState,
  ResourceType,
  WeatherType,
} from "@/lib/game/types";
import { emptyProductionSnapshot } from "@/lib/game/productionCalculator";

/**
 * Stub ServerGameData for pre-hydration. Empty / zero so UI gates
 * correctly behind `hydrated === true`.
 */
export function createStubServerData(): ServerGameData {
  return {
    money: 0,
    totalMoneyEarned: 0,
    gameTick: 0,
    gameSpeed: 1,
    paused: false,

    resources: {} as Record<ResourceType, number>,
    resourceCapacity: {} as Record<ResourceType, number>,

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

    workers: [],

    market: [],
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

    automationUnlocks: [],

    prestigeState: {
      corporationPoints: 0,
      totalPrestiges: 0,
      megaFactoryUnlocked: false,
      bonuses: [],
    },

    activeEvents: [],
    eventLog: [],

    stats: {
      totalResourcesProduced: {} as Record<ResourceType, number>,
      totalResourcesSold: {} as Record<ResourceType, number>,
      peakEfficiency: 0,
      factoriesBuilt: 0,
      transportLinesBuilt: 0,
      researchCompleted: 0,
      contractsCompleted: 0,
      playTime: 0,
    },

    megaProjects: [],

    productionHistory: [],
    blueprints: [],
    autoSellResources: [],
    storageUpgradeLevels: {} as Record<ResourceType, number>,
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
      nextChange: 100,
    },

    quests: [],

    payoutConfig: {
      basePayoutInterval: 100,
      lastPayoutTick: 0,
      totalPayoutsReceived: 0,
      autoCollect: true,
    },
    pendingPayout: 0,
    payoutHistory: [],
    trackedQuest: null,

    drones: {
      fleet: [],
      completedMissions: 0,
      totalEarned: 0,
    },
  };
}

/**
 * Stub UISessionState for pre-hydration. UI flags default to "loading"
 * state (hydrated=false). Real values come from the local user session.
 */
export function createStubUISessionState(): UISessionState {
  return {
    hydrated: false,
    activeTab: "dashboard",
    selectedBuilding: null,
    notifications: [],
    productionSnapshot: emptyProductionSnapshot(),
  };
}

/**
 * Composite stub. Back-compat with the pre-Phase-13 `createStubInitialState()`.
 * New code should prefer `createStubServerData() + createStubUISessionState()`.
 */
export function createStubInitialState(): GameState {
  return {
    ...createStubServerData(),
    ...createStubUISessionState(),
  };
}

/**
 * Merge canonical ServerGameData (from server) with current UI session
 * state. UI state is preserved across hydration — the server never
 * dictates the player's active tab or notification queue.
 *
 * Phase 13 invariant: server NEVER returns UI fields. Client merges.
 */
export function mergeCanonicalWithUI(
  canonical: ServerGameData,
  current: UISessionState,
): GameState {
  return {
    ...canonical,
    ...current,
    hydrated: true,
  };
}

/**
 * Fetch the canonical initial state from the server and apply it to the
 * Zustand store. Called by AuthProvider.onReady BEFORE cloud sync load
 * so that guests without a cloud row still see a properly populated UI.
 *
 * Returns the raw ServerGameData response for callers who want to
 * inspect it. The wrapping with UISessionState happens in the store
 * via mergeCanonicalWithUI() — NOT here. This function returns PURE
 * server data so the split is visible at every layer.
 *
 * Failure is logged; the store remains in stub-empty / hydrated:false
 * state and the caller decides whether to retry.
 */
export async function hydrateInitialStateFromServer(): Promise<ServerGameData | null> {
  try {
    const res = await fetch("/api/game/initial-state", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(
        `[hydrateInitialStateFromServer] HTTP ${res.status} ${res.statusText}`,
      );
      return null;
    }
    const body = (await res.json()) as { initialState?: ServerGameData };
    if (!body.initialState) {
      console.warn("[hydrateInitialStateFromServer] empty response");
      return null;
    }
    return body.initialState;
  } catch (err) {
    console.error("[hydrateInitialStateFromServer] fetch failed:", err);
    return null;
  }
}
