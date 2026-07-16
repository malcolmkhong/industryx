// ============================================
// FACTORY DOMINION: GAME CONFIG
// Compatibility barrel. Domain logic lives in split config modules.
// ============================================

export { fetchGameConfig } from "./client/configLoader.client";
export {
  DEFAULT_BALANCE_SUBSET,
  type GameConfig,
} from "./types/gameConfig";
export type {
  SupabaseAutomation,
  SupabaseBalancingRule,
  SupabaseBuilding,
  SupabaseDailyReward,
  SupabaseEventTemplate,
  SupabaseGameConfig,
  SupabaseMarket,
  SupabaseMegaProject,
  SupabasePrestigeBonus,
  SupabaseProductionChain,
  SupabaseQuestDefinition,
  SupabaseRankThreshold,
  SupabaseRecipe,
  SupabaseResearch,
  SupabaseResource,
  SupabaseSeasonalEvent,
  SupabaseTransport,
  SupabaseWeather,
  SupabaseWorker,
} from "./types/supabaseRows";
