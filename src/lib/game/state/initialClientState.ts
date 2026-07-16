// ============================================
// initialClientState.ts
//
// Pure client-only stub state for the game store. Three builders plus
// a merge helper:
//
//   1. createStubServerData()       — empty ServerGameData (server-owned
//                                     fields, zeroed so UI gates
//                                     correctly behind hydrated=true).
//   2. createStubUISessionState()   — empty UISessionState (client-owned
//                                     presentation, hydrated=false).
//   3. createStubInitialState()     — composite of both. Back-compat
//                                     with the pre-Phase-13 entry point.
//   4. mergeCanonicalWithUI()       — merges server-canonical
//                                     ServerGameData with local UI
//                                     session state. UI fields are
//                                     ALWAYS preserved — server never
//                                     dictates activeTab / notifications
//                                     / selectedBuilding / productionSnapshot.
//
// No I/O, no fetch, no side effects. Safe to call at module init.
// ============================================

import type {
  ServerGameData,
  UISessionState,
  GameState,
  ResourceType,
  WeatherType,
} from "../shared/types/types";
import { emptyProductionSnapshot } from "./stubProductionSnapshot";

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
    researchQueue: [],

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
      tradesCompleted: 0,
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
