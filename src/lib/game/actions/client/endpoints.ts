// Action → API endpoint map. Centralized so route paths are not duplicated
// across the request builder, the legacy route, and tests.

"use client";

const ACTION_ENDPOINTS: Record<string, string> = {
  build: "/api/game/actions/build",
  sell: "/api/game/actions/sell",
  sell_market: "/api/game/actions/sell",
  buy: "/api/game/actions/buy",
  buy_market: "/api/game/actions/buy",
  research: "/api/game/actions/research",
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

export function actionEndpoint(actionType: string): string {
  return ACTION_ENDPOINTS[actionType] ?? "/api/game/actions/legacy";
}
