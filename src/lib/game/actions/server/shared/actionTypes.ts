import type { GameState } from "@/lib/game/shared/types/types";

export const VALID_ACTIONS = [
  "build",
  "sell",
  "buy",
  "research",
  "cancel_research",
  "add_research_to_queue",
  "remove_research_from_queue",
  "upgrade",
  "transport",
  "set_game_speed",
  "toggle_building",
  "upgrade_storage",
  "hire_worker",
  "assign_worker",
  "upgrade_worker",
  "collect_payout",
  "claim_quest",
  "claim_daily_reward",
  "fulfill_contract",
  "start_drone_mission",
  "collect_drone",
  "upgrade_transport_line",
  "do_prestige",
] as const;

export type ActionType = (typeof VALID_ACTIONS)[number];

export const ACTION_ROUTE_PATHS: Record<ActionType, string> = {
  build: "/api/game/actions/build",
  sell: "/api/game/actions/sell",
  buy: "/api/game/actions/buy",
  research: "/api/game/actions/research",
  cancel_research: "/api/game/actions/cancel-research",
  add_research_to_queue: "/api/game/actions/add-research-to-queue",
  remove_research_from_queue: "/api/game/actions/remove-research-from-queue",
  upgrade: "/api/game/actions/upgrade",
  transport: "/api/game/actions/transport",
  set_game_speed: "/api/game/actions/set-game-speed",
  toggle_building: "/api/game/actions/toggle-building",
  upgrade_storage: "/api/game/actions/upgrade-storage",
  hire_worker: "/api/game/actions/hire-worker",
  assign_worker: "/api/game/actions/assign-worker",
  upgrade_worker: "/api/game/actions/upgrade-worker",
  collect_payout: "/api/game/actions/collect-payout",
  claim_quest: "/api/game/actions/claim-quest",
  claim_daily_reward: "/api/game/actions/claim-daily-reward",
  fulfill_contract: "/api/game/actions/fulfill-contract",
  start_drone_mission: "/api/game/actions/start-drone-mission",
  collect_drone: "/api/game/actions/collect-drone",
  upgrade_transport_line: "/api/game/actions/upgrade-transport-line",
  do_prestige: "/api/game/actions/prestige",
};

export interface ActionRequest {
  userId?: string;
  deviceId?: string | null;
  requestId?: string;
  actionType?: string;
  action?: string;
  payload: Record<string, unknown>;
  gameState: Partial<GameState>;
}

export interface ActionResponse {
  valid: boolean;
  error?: string;
  code?: string;
  correctedState?: Partial<GameState>;
}
