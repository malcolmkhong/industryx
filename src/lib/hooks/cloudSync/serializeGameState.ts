// ============================================
// Cloud Sync — Serialize Game State
// ============================================
//
// Pure utility that extracts the 30+ field game state from the
// Zustand store for cloud sync. Extracted from the original
// useCloudSync.ts inline definition.
// ============================================

import { useGameStore } from '@/lib/game/store';

/**
 * Extract the full game state from the Zustand store for cloud sync.
 * Returns a plain object containing only the fields the cloud sync
 * endpoint needs — no actions, no functions, no transient UI state.
 */
export function extractGameState(): Record<string, unknown> {
  const state = useGameStore.getState();
  return {
    money: state.money,
    totalMoneyEarned: state.totalMoneyEarned,
    gameTick: state.gameTick,
    buildings: state.buildings,
    resources: state.resources,
    resourceCapacity: state.resourceCapacity,
    transportLines: state.transportLines,
    powerGrid: state.powerGrid,
    researchPoints: state.researchPoints,
    completedResearch: state.completedResearch,
    activeResearch: state.activeResearch,
    researchProgress: state.researchProgress,
    workers: state.workers,
    market: state.market,
    contracts: state.contracts,
    completedContracts: state.completedContracts,
    automationUnlocks: state.automationUnlocks,
    prestigeState: state.prestigeState,
    activeEvents: state.activeEvents,
    stats: state.stats,
    megaProjects: state.megaProjects,
    blueprints: state.blueprints,
    autoSellResources: state.autoSellResources,
    storageUpgradeLevels: state.storageUpgradeLevels,
    lastOnlineTimestamp: state.lastOnlineTimestamp,
    loginStreak: state.loginStreak,
    weather: state.weather,
    quests: state.quests,
    payoutConfig: state.payoutConfig,
    pendingPayout: state.pendingPayout,
    payoutHistory: state.payoutHistory,
    trackedQuest: state.trackedQuest,
    drones: state.drones,
    notifications: state.notifications,
    gameSpeed: state.gameSpeed,
    paused: state.paused,
    productionSnapshot: state.productionSnapshot,
    marketSimState: state.marketSimState,
    sectorTrends: state.sectorTrends,
    marketNews: state.marketNews,
    marketNarratives: state.marketNarratives,
    eventLog: state.eventLog,
    productionHistory: state.productionHistory,
    _version: state._version,
  };
}
