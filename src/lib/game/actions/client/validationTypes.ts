// Client-side action validation result types and the allow-list of
// server-authoritative actions that must return a correctedState.

"use client";

import type { ServerGameData } from "@/lib/game/shared/types/types";

export type ValidatedActionType =
  | "build"
  | "sell"
  | "buy"
  | "research"
  | "cancel_research"
  | "add_research_to_queue"
  | "remove_research_from_queue"
  | "upgrade"
  | "transport"
  | "toggle_building"
  | "hire_worker"
  | "assign_worker"
  | "do_prestige"
  | "set_game_speed"
  | "buy_market"
  | "sell_market"
  | "start_drone_mission"
  | "collect_drone"
  | "claim_quest"
  | "upgrade_storage"
  | "collect_payout"
  | "fulfill_contract"
  | "claim_daily_reward"
  | "upgrade_transport_line"
  | "upgrade_worker";

export interface ValidatedActionResult {
  approved: boolean;
  error?: string;
  /**
   * When the server is authoritative on the action result, it returns
   * the authoritative post-action state to apply on the client. Callers
   * SHOULD use these fields to update local state rather than computing
   * cost/deductions locally — this prevents client/server divergence
   * when the cost formula, mega-project bonuses, or scaled-cost exponent
   * differs between the two sides.
   *
   * Phase 13 (2026-07-10, Option C): this is now a precise
   * Partial<ServerGameData>. UI fields (hydrated, activeTab, etc.)
   * NEVER appear here — server-authoritative data only.
   */
  correctedState?: Partial<ServerGameData>;
}

export const ACTIONS_WITH_SERVER_STATE = new Set<ValidatedActionType>([
  "build",
  "sell",
  "buy",
  "research",
  "cancel_research",
  "add_research_to_queue",
  "remove_research_from_queue",
  "upgrade",
  "transport",
  "toggle_building",
  "hire_worker",
  "assign_worker",
  "do_prestige",
  "buy_market",
  "sell_market",
  "start_drone_mission",
  "collect_drone",
  "claim_quest",
  "upgrade_storage",
  "collect_payout",
  "fulfill_contract",
  "claim_daily_reward",
  "upgrade_transport_line",
  "upgrade_worker",
]);
