// ============================================
// FACTORY DOMINION: AUTOMATED EMPIRE
// Zustand Game Store + Game Engine
// src/lib/game/store.ts
// ============================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createInitialState } from "./constants/initialState";
import { SAVE_VERSION } from "./constants/saveVersion";
import { migrateSaveState } from "./utils/saveMigration";
import debouncedPersistStorage from "./store/persistence";
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
import { createSaveActions } from "./actions/save";
import { createCoreActions } from "./actions/core";
import { createLeaderboardActions } from "./actions/leaderboard";
import { createDailyRewardActions } from "./actions/dailyRewards";
import { createQuestActions } from "./actions/quests";
import { createStorageActions } from "./actions/storage";
import { createOfflineActions } from "./actions/offline";
import { createRankActions } from "./actions/rank";
import { createNewsActions } from "./actions/news";
import { createGameTickActions } from "./actions/gameTick";
import { GameStore } from "./store-types";

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
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
      ...createSaveActions(set, get),
      ...createCoreActions(set, get),
      ...createLeaderboardActions(set, get),
      ...createDailyRewardActions(set, get),
      ...createQuestActions(set, get),
      ...createStorageActions(set, get),
      ...createOfflineActions(set, get),
      ...createRankActions(set, get),
      ...createNewsActions(set, get),
      ...createGameTickActions(set, get),
    }),
    {
      name: "factory-dominion-save",
      storage: debouncedPersistStorage,
      partialize: (state) => ({
        money: state.money,
        totalMoneyEarned: state.totalMoneyEarned,
        gameTick: state.gameTick,
        resources: state.resources,
        resourceCapacity: state.resourceCapacity,
        buildings: state.buildings,
        transportLines: state.transportLines,
        researchPoints: state.researchPoints,
        completedResearch: state.completedResearch,
        workers: state.workers,
        contracts: state.contracts,
        completedContracts: state.completedContracts,
        automationUnlocks: state.automationUnlocks,
        prestigeState: state.prestigeState,
        stats: state.stats,
        megaProjects: state.megaProjects,
        productionHistory: state.productionHistory,
        blueprints: state.blueprints,
        autoSellResources: state.autoSellResources,
        storageUpgradeLevels: state.storageUpgradeLevels,
        lastOnlineTimestamp: state.lastOnlineTimestamp,
        leaderboardEntries: state.leaderboardEntries,
        loginStreak: state.loginStreak,
        weather: state.weather,
        quests: state.quests,
        payoutConfig: state.payoutConfig,
        pendingPayout: state.pendingPayout,
        payoutHistory: state.payoutHistory,
        trackedQuest: state.trackedQuest,
        drones: state.drones,
        _version: SAVE_VERSION,
      }),
      version: SAVE_VERSION,
      migrate: (persistedState: unknown, savedVersion: number) => {
        return migrateSaveState(
          persistedState as Record<string, unknown>,
          savedVersion,
        );
      },
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) {
            console.error("[Zustand Persist] Rehydration error:", error);
            // If rehydration fails due to corrupted data, clear the save
            try {
              localStorage.removeItem("factory-dominion-save");
              console.warn("[Zustand Persist] Cleared corrupted save data");
            } catch {
              // Ignore
            }
          }
        };
      },
    },
  ),
);

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as Record<string, unknown>).__gameStore = useGameStore;
}

export { formatNumber } from "./utils/formatNumber";
export {
  getBuildingCost,
  isResearchUnlocked,
  isBuildingUnlocked,
} from "./utils/costCalculator";
export { generateId } from "./utils/generateId";
export { hasUnlimitedStorage } from "./utils/hasUnlimitedStorage";
