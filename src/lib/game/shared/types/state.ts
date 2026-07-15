// ============================================
// state.ts — top-level GameState composition + UI session + tab enum.
// ============================================
//
// Phase 13 (Option C, 2026-07-10) — server-authoritative data lives
// in `./server`. Client-only UI flags live here in `UISessionState`.
// `GameState` is a back-compat composite so existing code keeps working
// without changing every call site.
// ============================================

import type { ProductionSnapshot } from "../../production/productionCalculator";
import type { GameNotification } from "./notifications";
import type { ServerGameData } from "./server";

/**
 * Client-only UI/session state. NEVER persisted to DB. NEVER returned
 * by any server endpoint. The store manages this locally; hydration
 * merges it with incoming server data.
 */
export interface UISessionState {
  /**
   * True after the store has been hydrated with server data. UI
   * gates render behind this. Pure presentation flag.
   */
  hydrated: boolean;

  /** Currently visible game tab. */
  activeTab: GameTab;

  /** Currently selected building in the map. */
  selectedBuilding: string | null;

  /** Pending toast/notification list. */
  notifications: GameNotification[];

  /** Cached production snapshot. UI reads ONLY from this. */
  productionSnapshot: ProductionSnapshot;
}

/** Back-compat alias. Prefer `ServerGameData & UISessionState` for new code. */
export type GameState = ServerGameData & UISessionState;

export type GameTab =
  | "dashboard"
  | "advisor"
  | "factoryMap"
  | "resourceMonitor"
  | "resources"
  | "factories"
  | "productionChains"
  | "storage"
  | "transport"
  | "power"
  | "market"
  | "research"
  | "workers"
  | "contracts"
  | "quests"
  | "automation"
  | "prestige"
  | "events"
  | "megaprojects"
  | "statistics"
  | "blueprints"
  | "guide"
  | "achievements"
  | "leaderboard"
  | "dailyRewards"
  | "payouts"
  | "droneDelivery"
  | "tradePost"
  | "notifications"
  | "settings";
