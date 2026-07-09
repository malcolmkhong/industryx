// ============================================
// FACTORY DOMINION: AUTOMATED EMPIRE
// Zustand Game Store + Game Engine
// src/lib/game/store.ts
// ============================================
//
// Server-authoritative persistence (v15):
//   - Store initializes from `createInitialState()` on mount
//   - `applyServerState(data)` injects server-loaded game state from cloud load
//   - No localStorage, no manual export/import, no client reset
//   - Autosave fires every 2 minutes via CloudSyncService.startAutoSave
//   - Transient UI state (activeTab, notifications, selectedBuilding,
//     productionSnapshot) is preserved across applyServerState calls

import { create } from "zustand";
import { createInitialState } from "./constants/initialState";
import { createNotificationActions } from "./actions/notifications";
import { createPayoutActions } from "./actions/payouts";
import { createAutomationActions } from "./actions/automation";
import { createBlueprintActions } from "./actions/blueprints";
import { createContractActions } from "./actions/contracts";
import { createTransportActions } from "./actions/transport";
import { createBuildingActions } from "./actions/buildings";
import { createMarketActions } from "./actions/market";
import { createPrestigeActions } from "./actions/prestige";
import { createDroneActions } from "./actions/drones";
import { createResearchActions } from "./actions/research";
import { createWorkerActions } from "./actions/workers";
import { createMegaProjectActions } from "./actions/megaProjects";
import { createCoreActions } from "./actions/core";
import { createLeaderboardActions } from "./actions/leaderboard";
import { createDailyRewardActions } from "./actions/dailyRewards";
import { createQuestActions } from "./actions/quests";
import { createStorageActions } from "./actions/storage";
import { createRankActions } from "./actions/rank";
import { createNewsActions } from "./actions/news";
import { createGameTickActions } from "./actions/gameTick";
import type { GameStore } from "./store-types";

// Fields replaced verbatim from server response. Server already validated.
const SERVER_FIELDS = [
  "money",
  "totalMoneyEarned",
  "gameTick",
  "gameSpeed",
  "paused",
  "resources",
  "resourceCapacity",
  "buildings",
  "transportLines",
  "powerGrid",
  "researchPoints",
  "completedResearch",
  "activeResearch",
  "researchProgress",
  "workers",
  "market",
  "sectorTrends",
  "marketNews",
  "marketNarratives",
  "serverMarket",
  "contracts",
  "completedContracts",
  "automationUnlocks",
  "prestigeState",
  "activeEvents",
  "eventLog",
  "stats",
  "megaProjects",
  "productionHistory",
  "blueprints",
  "autoSellResources",
  "storageUpgradeLevels",
  "lastOnlineTimestamp",
  "leaderboardEntries",
  "loginStreak",
  "weather",
  "quests",
  "payoutConfig",
  "pendingPayout",
  "payoutHistory",
  "trackedQuest",
  "drones",
] as const;

export const useGameStore = create<GameStore>()((set, get) => ({
  ...createInitialState(),
  ...createNotificationActions(set, get),
  ...createPayoutActions(set, get),
  ...createAutomationActions(set, get),
  ...createBlueprintActions(set, get),
  ...createContractActions(set, get),
  ...createTransportActions(set, get),
  ...createBuildingActions(set, get),
  ...createMarketActions(set, get),
  ...createPrestigeActions(set, get),
  ...createDroneActions(set, get),
  ...createResearchActions(set, get),
  ...createWorkerActions(set, get),
  ...createMegaProjectActions(set, get),
  ...createCoreActions(set, get),
  ...createLeaderboardActions(set, get),
  ...createDailyRewardActions(set, get),
  ...createQuestActions(set, get),
  ...createStorageActions(set, get),
  ...createRankActions(set, get),
  ...createNewsActions(set, get),
  ...createGameTickActions(set, get),
}));

/**
 * Apply server-loaded game state to the client store. Called from the cloud
 * load path in AuthProvider.onReady. Server is authoritative — no bounds
 * checks. Transient UI state (activeTab, notifications, selectedBuilding,
 * productionSnapshot, paused) is preserved from the previous client state.
 */
export function applyServerState(data: Record<string, unknown> | null | undefined): void {
  if (!data || typeof data !== "object") return;

  const next: Record<string, unknown> = {};
  for (const key of SERVER_FIELDS) {
    if (key in data) {
      next[key] = data[key];
    }
  }

  useGameStore.setState((prev) => ({
    ...next,
    // Preserve transient UI state across server-state application.
    activeTab: prev.activeTab,
    selectedBuilding: prev.selectedBuilding,
    notifications: prev.notifications,
  }));
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as Record<string, unknown>).__gameStore = useGameStore;
  (window as unknown as Record<string, unknown>).__applyServerState = applyServerState;
}

export { formatNumber } from "./utils/formatNumber";
export {
  getBuildingCost,
  isResearchUnlocked,
  isBuildingUnlocked,
} from "./utils/costCalculator";
export { generateId } from "./utils/generateId";
export { hasUnlimitedStorage } from "./utils/hasUnlimitedStorage";
