/**
 * Autonoma test-data — factory registry.
 *
 * Aggregates the per-domain factories into one `FactoryRegistry` the
 * SDK handler consumes. Adding a new entity: drop a factory into the
 * matching `factories.*` file, import it here, and add it to
 * `registry`. The recipe will pick it up automatically.
 */

import type { FactoryRegistry } from "@autonoma-ai/sdk";

import {
  deviceBindingsFactory,
  guestIdentitiesFactory,
  playerSessionsFactory,
  profilesFactory,
} from "./factories.users";

import {
  dailyRewardsFactory,
  gameConfigMarketHistoryFactory,
  gameStateRecoveryCasesFactory,
  gameStateRecoveryReceiptsFactory,
  leaderboardFactory,
  marketPlayerPressureFactory,
  marketSupplyDemandFactory,
  playerActionsFactory,
  playerProgressFactory,
  serverGameStateFactory,
  tradeHistoryFactory,
  userStreaksFactory,
} from "./factories.gameplay";

import {
  gameConfigAutomationFactory,
  gameConfigBalanceFactory,
  gameConfigBalancingRulesFactory,
  gameConfigBuildingsFactory,
  gameConfigDailyRewardsFactory,
  gameConfigEventTemplatesFactory,
  gameConfigGameFactory,
  gameConfigMarketFactory,
  gameConfigMegaProjectsFactory,
  gameConfigPrestigeBonusesFactory,
  gameConfigProductionChainsFactory,
  gameConfigProductionRecipesFactory,
  gameConfigQuestDefinitionsFactory,
  gameConfigRankThresholdsFactory,
  gameConfigResearchFactory,
  gameConfigResourcesFactory,
  gameConfigSeasonalEventsFactory,
  gameConfigTransportFactory,
  gameConfigWeatherFactory,
  gameConfigWorkersFactory,
} from "./factories.config";

import {
  adminActionsFactory,
  adminPermissionsFactory,
  adminUsersFactory,
  bootstrapTelemetryFactory,
  cheatInvestigationsFactory,
  fingerprintEventsFactory,
  rateLimitsFactory,
  requestIpLogFactory,
  supportMessagesFactory,
  supportTicketsFactory,
  waitlistEntriesFactory,
} from "./factories.admin";

import {
  guestStateArchiveFactory,
  mergeAuditLogFactory,
  mergeReceiptsFactory,
  pendingLinkOperationsFactory,
} from "./factories.merge";

import {
  appConfigFactory,
  globalMarketEventScheduleFactory,
  globalWeatherScheduleFactory,
  serverMarketStateFactory,
  serverWeatherStateFactory,
} from "./factories.singleton";

export const factories: FactoryRegistry = {
  // user & identity
  profiles: profilesFactory,
  device_bindings: deviceBindingsFactory,
  guest_identities: guestIdentitiesFactory,
  player_sessions: playerSessionsFactory,

  // gameplay
  server_game_state: serverGameStateFactory,
  player_progress: playerProgressFactory,
  player_actions: playerActionsFactory,
  trade_history: tradeHistoryFactory,
  game_config_market_history: gameConfigMarketHistoryFactory,
  market_player_pressure: marketPlayerPressureFactory,
  market_supply_demand: marketSupplyDemandFactory,
  leaderboard: leaderboardFactory,
  daily_rewards: dailyRewardsFactory,
  user_streaks: userStreaksFactory,
  game_state_recovery_cases: gameStateRecoveryCasesFactory,
  game_state_recovery_receipts: gameStateRecoveryReceiptsFactory,

  // config
  game_config_resources: gameConfigResourcesFactory,
  game_config_buildings: gameConfigBuildingsFactory,
  game_config_research: gameConfigResearchFactory,
  game_config_production_recipes: gameConfigProductionRecipesFactory,
  game_config_production_chains: gameConfigProductionChainsFactory,
  game_config_automation: gameConfigAutomationFactory,
  game_config_workers: gameConfigWorkersFactory,
  game_config_transport: gameConfigTransportFactory,
  game_config_market: gameConfigMarketFactory,
  game_config_prestige_bonuses: gameConfigPrestigeBonusesFactory,
  game_config_rank_thresholds: gameConfigRankThresholdsFactory,
  game_config_quest_definitions: gameConfigQuestDefinitionsFactory,
  game_config_daily_rewards: gameConfigDailyRewardsFactory,
  game_config_event_templates: gameConfigEventTemplatesFactory,
  game_config_seasonal_events: gameConfigSeasonalEventsFactory,
  game_config_mega_projects: gameConfigMegaProjectsFactory,
  game_config_game: gameConfigGameFactory,
  game_config_weather: gameConfigWeatherFactory,
  game_config_balancing_rules: gameConfigBalancingRulesFactory,
  game_config_balance: gameConfigBalanceFactory,

  // admin / moderation / ops
  admin_users: adminUsersFactory,
  admin_actions: adminActionsFactory,
  cheat_investigations: cheatInvestigationsFactory,
  support_tickets: supportTicketsFactory,
  support_messages: supportMessagesFactory,
  waitlist_entries: waitlistEntriesFactory,
  rate_limits: rateLimitsFactory,
  request_ip_log: requestIpLogFactory,
  fingerprint_events: fingerprintEventsFactory,
  bootstrap_telemetry: bootstrapTelemetryFactory,

  // auth-merge
  pending_link_operations: pendingLinkOperationsFactory,
  merge_receipts: mergeReceiptsFactory,
  merge_audit_log: mergeAuditLogFactory,
  guest_state_archive: guestStateArchiveFactory,

  // singleton global state
  server_market_state: serverMarketStateFactory,
  server_weather_state: serverWeatherStateFactory,
  app_config: appConfigFactory,
  global_weather_schedule: globalWeatherScheduleFactory,
  global_market_event_schedule: globalMarketEventScheduleFactory,
};