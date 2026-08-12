export interface SupabaseBuilding {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: number;
  base_cost: Record<string, number> | Array<{resource: string; amount: number}>; // e.g. { money: 500 } or [{resource: 'money', amount: 500}]
  cost_multiplier: number;
  base_power_consumption: number;
  base_power_production: number;
  cycle_time: number;
  building_multiplier: number;
  base_production_rate: number;
  fuel: string | null;
  fuel_rate: number | null;
  unlock_research: string | null;
  unlock_prestige: number | null;
  icon: string;
  sort_order: number;
}

export interface SupabaseResource {
  id: string;
  name: string;
  icon: string;
  tier: number;
  color: string;
  category: string;
  sort_order: number;
  /** Default storage cap for a fresh player (Phase 12). Migration 069 seeds this. */
  base_capacity?: number;
}

export interface SupabaseRecipe {
  id: string;
  building_id: string;
  resource_id: string;
  is_input: boolean;
  amount: number;
}

export interface SupabaseProductionChain {
  id: string;
  upstream_building: string;
  downstream_building: string;
  resource_id: string;
}

export interface SupabaseResearch {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: number;
  cost: number;
  time_required: number;
  prerequisites: string[] | null;
  effects: Record<string, unknown>[] | null;
  icon: string;
  sort_order: number;
}

export interface SupabaseMarket {
  resource_id: string;
  base_price: number;
  demand: number;
  supply: number;
  volatility: number;
  sort_order: number;
  is_tradable: boolean;
}

export interface SupabaseWeather {
  id: string;
  name: string;
  icon: string;
  production_multiplier: number;
  solar_multiplier: number;
  wind_multiplier: number;
  // Added in a later migration; older game_config_weather rows don't
  // have this column and the transformer falls back to 1.0.
  transport_multiplier?: number;
  description: string;
  sort_order: number;
}

export interface SupabaseWorker {
  id: string;
  name: string;
  description: string;
  base_hire_cost: number;
  effects: Record<string, unknown>;
  icon: string;
  sort_order: number;
}

export interface SupabaseTransport {
  id: string;
  name: string;
  description: string;
  base_cost: Record<string, number> | Array<{resource: string; amount: number}>;
  base_throughput: number;
  upgrade_multiplier: number;
  icon: string;
  sort_order: number;
}

export interface SupabaseAutomation {
  id: string;
  name: string;
  description: string;
  cost: number;
  requires_research: string | null;
  icon: string;
  sort_order: number;
}

export interface SupabasePrestigeBonus {
  id: string;
  name: string;
  description: string;
  cost: number;
  effect: Record<string, unknown>;
  sort_order: number;
}

export interface SupabaseRankThreshold {
  rank: number;
  name: string;
  score_required: number;
}

export interface SupabaseQuestDefinition {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  game_tier: number;
  steps: Record<string, unknown>[];
  reward: Record<string, unknown>;
  target_resource: string | null;
  target_building: string | null;
  icon: string;
  sort_order: number;
}

export interface SupabaseDailyReward {
  day: number;
  type: string;
  amount: number;
  resource_id: string | null;
}

export interface SupabaseEventTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  duration: number;
  effects: Record<string, unknown>[];
  icon: string;
  sort_order: number;
}

export interface SupabaseSeasonalEvent {
  id: string;
  name: string;
  description: string;
  season: string;
  start_date: string;
  end_date: string;
  effects: Record<string, unknown>[];
  rewards: Record<string, unknown>[];
  icon: string;
  is_active: boolean;
  sort_order: number;
}

export interface SupabaseMegaProject {
  id: string;
  name: string;
  description: string;
  icon: string;
  stages: Record<string, unknown>[];
  bonus: Record<string, unknown>;
  unlock_requirement: Record<string, unknown>;
  sort_order: number;
}

export interface SupabaseGameConfig {
  id: string;
  // Offline-tick tuning (added 2026-07-09, see .rules [ARC-011]/[SEC-011]).
  // DB CHECK constraints enforce ranges; routes re-validate and fail closed.
  tick_interval_ms: number;
  max_offline_ticks: number;
  min_offline_ms: number;
  [key: string]: unknown; // remaining numeric config columns
}

export interface SupabaseBalancingRule {
  id: string;
  name: string;
  description: string;
  category: string;
  target: string;
  multiplier: number;
  is_active: boolean;
  effective_from: string | null;
  effective_until: string | null;
}
