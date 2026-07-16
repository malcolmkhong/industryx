// ============================================
// FACTORY DOMINION: AUTOMATED EMPIRE
// Zustand Game Store + Game Engine
// src/lib/game/store.ts
// ============================================
//
// Server-authoritative persistence (v15):
//   - Store initializes from `createStubInitialState()` on mount
//     (Phase 12 — placeholder shape only, hydrated=false)
//   - `hydrateInitialStateFromServer()` fetches the canonical initial
//     state from GET /api/game/state/initial (called from AuthProvider)
//   - `applyServerState(data)` injects server-loaded game state from cloud load
//   - No localStorage, no manual export/import, no client reset
//   - Autosave fires every 2 minutes via CloudSyncService.startAutoSave
//   - Transient UI state (activeTab, notifications, selectedBuilding,
//     productionSnapshot) is preserved across applyServerState calls

import { create } from "zustand";
import {
  createStubInitialState,
  mergeCanonicalWithUI,
  hydrateInitialStateFromServer,
} from "./store-bootstrap";
import { createNotificationActions } from "./store-actions/notifications";
import { createPayoutActions } from "./store-actions/payouts/payoutsActions";
import { createAutomationActions } from "./store-actions/automation";
import { createBlueprintActions } from "./store-actions/blueprints";
import { createContractActions } from "./store-actions/contracts/contractsActions";
import { createTransportActions } from "./store-actions/transport/transportActions";
import { createBuildingActions } from "./store-actions/buildings/buildingsActions";
import { createMarketActions } from "./store-actions/market/marketActions";
import { createPrestigeActions } from "./store-actions/prestige/prestigeActions";
import { createDroneActions } from "./store-actions/drones/dronesActions";
import { createResearchActions } from "./store-actions/research/researchActions";
import { createWorkerActions } from "./store-actions/workers/workersActions";
import { createMegaProjectActions } from "./store-actions/megaProjects";
import { createCoreActions } from "./store-actions/core";
import { createLeaderboardActions } from "./store-actions/leaderboard";
import { createDailyRewardActions } from "./store-actions/dailyRewards/dailyRewardsActions";
import { createQuestActions } from "./store-actions/quests/questsActions";
import { createStorageActions } from "./store-actions/storage/storageActions";
import { createRankActions } from "./store-actions/rank";
import { createNewsActions } from "./store-actions/news";
import type { GameStore } from "./store-types";
import type { ProductionSnapshot } from "@/lib/game/production/productionCalculator";

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
  ...createStubInitialState(),
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
}));

/**
 * Apply server-loaded game state to the client store. Called from the cloud
 * load path in AuthProvider.onReady and from useLiveServerTick /
 * useOfflineProgressCheck. Server is authoritative — no bounds checks.
 * Transient UI state (activeTab, notifications, selectedBuilding, paused)
 * is preserved from the previous client state.
 *
 * Phase 13: server returns ServerGameData. UI session preserved locally.
 *
 * `productionSnapshot?: ProductionSnapshot | null` — V-001 plumbing:
 *   - `undefined` (omitted): preserve prev.productionSnapshot (cloud load path)
 *   - `null`: zero-tick response / cold-start; fall back to prev to keep UI
 *     consumers non-nullable
 *   - non-null: install the new authoritative snapshot (live-tick / offline)
 *
 * The store type stays `productionSnapshot: ProductionSnapshot` (non-null)
 * for the 14 UI consumers; only the apply boundary allows `null` so the
 * response contract can carry it.
 *
 * The snapshot is treated as a client-only UI cache and is never persisted
 * in `full_state`; the response contract is the sole transport.
 */
export function applyServerState(
  data: Record<string, unknown> | null | undefined,
  productionSnapshot?: ProductionSnapshot | null,
): void {
  if (!data || typeof data !== "object") return;

  const next: Record<string, unknown> = {};
  for (const key of SERVER_FIELDS) {
    if (key in data) {
      next[key] = data[key];
    }
  }

  // V-001 (2026-07-15): When the caller passes a non-null productionSnapshot
  // (live/offline settlement), install it. When the caller passes null
  // explicitly, OR omits it, preserve `prev.productionSnapshot`. This keeps
  // the type contract non-null for the 14 UI consumers (`productionSnapshot`
  // is `ProductionSnapshot`) while still letting the response carry
  // `null` for zero-tick or cold-start cases.
  const incomingSnapshot = productionSnapshot as ProductionSnapshot | null | undefined;
  const shouldInstallSnapshot = incomingSnapshot != null;

  useGameStore.setState((prev) => ({
    ...next,
    // Cloud state is a full ServerGameData shape. Mark hydrated so gated
    // UI can render. UI fields are preserved from prev — server has no
    // say in activeTab / notifications / selectedBuilding.
    hydrated: true,
    activeTab: prev.activeTab,
    selectedBuilding: prev.selectedBuilding,
    notifications: prev.notifications,
    productionSnapshot: shouldInstallSnapshot
      ? (incomingSnapshot as ProductionSnapshot)
      : prev.productionSnapshot,
  }));
}

/**
 * Fetch the canonical initial state from the server and apply it to the
 * store. Called by AuthProvider.onReady BEFORE cloud load so that even
 * cold-cache guests see a populated UI. Idempotent — safe to re-call.
 *
 * Phase 13: server returns ServerGameData; we merge with current
 * UI session state. UI is NEVER overwritten from server data.
 *
 * On success, sets `hydrated: true` (also set by applyServerState).
 * On failure, leaves the store in stub state and the caller is
 * responsible for surfacing an error banner or retry.
 */
export async function hydrateInitialState(): Promise<boolean> {
  if (useGameStore.getState().hydrated) return true;
  const canonical = await hydrateInitialStateFromServer();
  if (!canonical) return false;
  useGameStore.setState((prev) =>
    mergeCanonicalWithUI(canonical, {
      activeTab: prev.activeTab,
      selectedBuilding: prev.selectedBuilding,
      notifications: prev.notifications,
      productionSnapshot: prev.productionSnapshot,
      hydrated: true,
    }),
  );
  return true;
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as Record<string, unknown>).__gameStore = useGameStore;
  (window as unknown as Record<string, unknown>).__applyServerState = applyServerState;
}

export { formatNumber } from "../shared/utils/formatNumber";

/**
 * C-007 (BUILDING_PRODUCTION_AUDIT §10.4, 2026-07-16):
 * Server-authoritative payout per cycle + game speed + configured
 * payout interval give the actual cycles-per-minute income. Used by
 * DashboardPanel and the two header components so all surfaces show
 * the same number.
 */
export function computeNetIncomePerMinute(
  payoutPerCycle: number,
  effectiveSpeed: number,
  basePayoutInterval: number,
): number {
  if (basePayoutInterval <= 0) return 0;
  const cyclesPerMinute = (effectiveSpeed / basePayoutInterval) * 60;
  return Math.floor(payoutPerCycle * cyclesPerMinute);
}
export {
  getBuildingCost,
  isResearchUnlocked,
  isBuildingUnlocked,
} from "../shared/utils/costCalculator";
export { generateId } from "../shared/utils/generateId";
export { hasUnlimitedStorage } from "../shared/utils/hasUnlimitedStorage";
