/**
 * Table configuration metadata for all 19 game_config tables.
 * Used for CRUD API validation, column display, and sidebar navigation.
 */

export interface ColumnConfig {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "json" | "date" | "integer";
  editable: boolean;
  hidden?: boolean;
  required?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  width?: number;
}

export interface TableConfig {
  id: string;
  displayName: string;
  icon: string;
  category: string;
  primaryKey: string;
  columns: ColumnConfig[];
}

// ─── Column factory helpers ────────────────────────────────────────────────

const pk = (key: string, label: string, type: ColumnConfig["type"] = "text", width = 140): ColumnConfig => ({
  key,
  label,
  type,
  editable: true,
  required: true,
  sortable: true,
  filterable: true,
  width,
});

const col = (key: string, label: string, type: ColumnConfig["type"] = "text", width = 140): ColumnConfig => ({
  key,
  label,
  type,
  editable: true,
  required: false,
  sortable: type === "number" || type === "integer",
  filterable: type === "text" || type === "boolean",
  width,
});

const req = (key: string, label: string, type: ColumnConfig["type"] = "text", width = 140): ColumnConfig => ({
  key,
  label,
  type,
  editable: true,
  required: true,
  sortable: type === "number" || type === "integer",
  filterable: type === "text" || type === "boolean",
  width,
});

const jsonCol = (key: string, label: string, required = false, width = 200): ColumnConfig => ({
  key,
  label,
  type: "json",
  editable: true,
  required,
  sortable: false,
  filterable: false,
  width,
});

const ts = (key: string): ColumnConfig => ({
  key,
  label: key === "created_at" ? "Created At" : "Updated At",
  type: "date",
  editable: false,
  hidden: true,
  required: false,
  sortable: true,
  filterable: false,
  width: 180,
});

// ─── Table Definitions ─────────────────────────────────────────────────────

export const TABLE_CONFIGS: TableConfig[] = [
  // ── Core ──────────────────────────────────────────────────────────────
  {
    id: "game_config_buildings",
    displayName: "Buildings",
    icon: "🏭",
    category: "Core",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("description", "Description", "text", 260),
      req("category", "Category", "text", 120),
      req("tier", "Tier", "integer", 70),
      jsonCol("base_cost", "Base Cost", true, 200),
      req("cost_multiplier", "Cost Multiplier", "number", 130),
      req("base_power_consumption", "Power Consumption", "number", 140),
      req("base_power_production", "Power Production", "number", 140),
      req("cycle_time", "Cycle Time", "integer", 100),
      req("building_multiplier", "Building Multiplier", "number", 140),
      col("base_production_rate", "Production Rate", "number", 130),
      col("fuel", "Fuel", "text", 100),
      col("fuel_rate", "Fuel Rate", "number", 100),
      col("unlock_research", "Unlock Research", "text", 150),
      col("unlock_prestige", "Unlock Prestige", "integer", 130),
      req("icon", "Icon", "text", 80),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_resources",
    displayName: "Resources",
    icon: "💎",
    category: "Core",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("icon", "Icon", "text", 80),
      req("tier", "Tier", "integer", 70),
      req("color", "Color", "text", 80),
      req("category", "Category", "text", 120),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },

  // ── Production ────────────────────────────────────────────────────────
  {
    id: "game_config_production_recipes",
    displayName: "Production Recipes",
    icon: "⚗️",
    category: "Production",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("building_id", "Building ID", "text", 160),
      req("resource_id", "Resource ID", "text", 160),
      req("is_input", "Is Input", "boolean", 90),
      req("amount", "Amount", "number", 90),
      ts("created_at"),
    ],
  },
  {
    id: "game_config_production_chains",
    displayName: "Production Chains",
    icon: "🔗",
    category: "Production",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("upstream_building", "Upstream Building", "text", 180),
      req("downstream_building", "Downstream Building", "text", 180),
      req("resource_id", "Resource ID", "text", 160),
      ts("created_at"),
    ],
  },
  {
    id: "game_config_research",
    displayName: "Research",
    icon: "🔬",
    category: "Production",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("description", "Description", "text", 260),
      req("category", "Category", "text", 120),
      req("tier", "Tier", "integer", 70),
      req("cost", "Cost", "integer", 80),
      req("time_required", "Time Required", "integer", 120),
      jsonCol("prerequisites", "Prerequisites", true, 200),
      jsonCol("effects", "Effects", true, 200),
      req("icon", "Icon", "text", 80),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_automation",
    displayName: "Automation",
    icon: "🤖",
    category: "Production",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("description", "Description", "text", 260),
      req("cost", "Cost", "integer", 80),
      col("requires_research", "Requires Research", "text", 180),
      req("icon", "Icon", "text", 80),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_workers",
    displayName: "Workers",
    icon: "👷",
    category: "Production",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("description", "Description", "text", 260),
      req("base_hire_cost", "Base Hire Cost", "integer", 120),
      jsonCol("effects", "Effects", true, 200),
      req("icon", "Icon", "text", 80),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_transport",
    displayName: "Transport",
    icon: "🚚",
    category: "Production",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("description", "Description", "text", 260),
      jsonCol("base_cost", "Base Cost", true, 200),
      req("base_throughput", "Base Throughput", "number", 140),
      req("upgrade_multiplier", "Upgrade Multiplier", "number", 150),
      req("icon", "Icon", "text", 80),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },

  // ── Economy ───────────────────────────────────────────────────────────
  {
    id: "game_config_market",
    displayName: "Market",
    icon: "📊",
    category: "Economy",
    primaryKey: "resource_id",
    columns: [
      pk("resource_id", "Resource ID", "text", 160),
      req("base_price", "Base Price", "number", 110),
      req("demand", "Demand", "number", 90),
      req("supply", "Supply", "number", 90),
      req("volatility", "Volatility", "number", 100),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_prestige_bonuses",
    displayName: "Prestige Bonuses",
    icon: "⭐",
    category: "Economy",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("description", "Description", "text", 260),
      req("cost", "Cost", "integer", 80),
      jsonCol("effect", "Effect", true, 200),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_rank_thresholds",
    displayName: "Rank Thresholds",
    icon: "🏅",
    category: "Economy",
    primaryKey: "rank",
    columns: [
      pk("rank", "Rank", "integer", 80),
      req("name", "Name", "text", 180),
      req("score_required", "Score Required", "integer", 130),
      ts("created_at"),
    ],
  },

  // ── Events ────────────────────────────────────────────────────────────
  {
    id: "game_config_quest_definitions",
    displayName: "Quest Definitions",
    icon: "📜",
    category: "Events",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("description", "Description", "text", 260),
      req("type", "Type", "text", 100),
      req("category", "Category", "text", 120),
      col("game_tier", "Game Tier", "integer", 90),
      jsonCol("steps", "Steps", true, 200),
      jsonCol("reward", "Reward", true, 200),
      col("target_resource", "Target Resource", "text", 140),
      col("target_building", "Target Building", "text", 140),
      req("icon", "Icon", "text", 80),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_daily_rewards",
    displayName: "Daily Rewards",
    icon: "🎁",
    category: "Events",
    primaryKey: "day",
    columns: [
      pk("day", "Day", "integer", 70),
      req("type", "Type", "text", 100),
      req("amount", "Amount", "integer", 90),
      col("resource_id", "Resource ID", "text", 140),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_event_templates",
    displayName: "Event Templates",
    icon: "⚡",
    category: "Events",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("description", "Description", "text", 260),
      req("type", "Type", "text", 100),
      req("duration", "Duration", "integer", 100),
      jsonCol("effects", "Effects", true, 200),
      req("icon", "Icon", "text", 80),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_seasonal_events",
    displayName: "Seasonal Events",
    icon: "🌸",
    category: "Events",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("description", "Description", "text", 260),
      req("season", "Season", "text", 100),
      col("start_date", "Start Date", "date", 120),
      col("end_date", "End Date", "date", 120),
      jsonCol("effects", "Effects", true, 200),
      jsonCol("rewards", "Rewards", true, 200),
      req("icon", "Icon", "text", 80),
      req("is_active", "Is Active", "boolean", 90),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_mega_projects",
    displayName: "Mega Projects",
    icon: "🏗️",
    category: "Events",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("description", "Description", "text", 260),
      req("icon", "Icon", "text", 80),
      jsonCol("stages", "Stages", true, 250),
      jsonCol("bonus", "Bonus", true, 200),
      jsonCol("unlock_requirement", "Unlock Requirement", true, 200),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },

  // ── System ────────────────────────────────────────────────────────────
  {
    id: "game_config_game",
    displayName: "Game Config",
    icon: "⚙️",
    category: "System",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      col("starting_money", "Starting Money", "number", 130),
      col("passive_rp_per_tick", "Passive RP/Tick", "number", 130),
      col("base_payout_interval", "Payout Interval", "integer", 130),
      col("auto_sell_multiplier", "Auto Sell Mult", "number", 140),
      col("min_power_efficiency", "Min Power Eff", "number", 140),
      col("worker_power_reduction_cap", "Worker Power Red Cap", "number", 180),
      col("rp_extractor_rate", "RP Extractor Rate", "number", 150),
      col("rp_power_rate", "RP Power Rate", "number", 130),
      col("rp_factory_t1_rate", "RP Factory T1", "number", 130),
      col("rp_factory_t2_rate", "RP Factory T2", "number", 130),
      col("rp_factory_t3_rate", "RP Factory T3", "number", 130),
      col("rp_factory_t4_rate", "RP Factory T4", "number", 130),
      col("event_trigger_interval", "Event Interval", "integer", 130),
      col("event_trigger_chance", "Event Chance", "number", 120),
      col("max_concurrent_events", "Max Events", "integer", 110),
      col("worker_xp_rate", "Worker XP Rate", "number", 130),
      col("worker_levelup_xp_base", "Worker Lvl XP Base", "integer", 160),
      col("t5_drain_rate", "T5 Drain Rate", "number", 120),
      col("market_cycle_expansion_min", "Mkt Cycle Exp Min", "integer", 170),
      col("market_cycle_expansion_max", "Mkt Cycle Exp Max", "integer", 170),
      col("market_cycle_peak_min", "Mkt Cycle Peak Min", "integer", 160),
      col("market_cycle_peak_max", "Mkt Cycle Peak Max", "integer", 160),
      col("market_cycle_recession_min", "Mkt Cycle Rec Min", "integer", 170),
      col("market_cycle_recession_max", "Mkt Cycle Rec Max", "integer", 170),
      col("market_cycle_recovery_min", "Mkt Cycle Recov Min", "integer", 170),
      col("market_cycle_recovery_max", "Mkt Cycle Recov Max", "integer", 170),
      col("market_phase_expansion_mult", "Mkt Phase Exp Mult", "number", 180),
      col("market_phase_peak_mult", "Mkt Phase Peak Mult", "number", 170),
      col("market_phase_recession_mult", "Mkt Phase Rec Mult", "number", 180),
      col("market_phase_recovery_mult", "Mkt Phase Recov Mult", "number", 180),
      col("market_micro_event_chance", "Mkt Micro Chance", "number", 160),
      col("market_macro_event_chance", "Mkt Macro Chance", "number", 160),
      col("market_max_injection_effect", "Mkt Max Injection", "number", 170),
      col("market_trade_decay_rate", "Mkt Trade Decay", "number", 160),
      col("market_mean_reversion_rate", "Mkt Mean Reversion", "number", 180),
      col("market_price_lower_bound", "Mkt Price Lower", "number", 160),
      col("market_price_upper_bound", "Mkt Price Upper", "number", 160),
      col("save_version", "Save Version", "integer", 110),
      col("persist_throttle_ms", "Persist Throttle", "integer", 140),
      col("forced_save_ms", "Forced Save", "integer", 120),
      col("max_save_size_bytes", "Max Save Size", "integer", 140),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_weather",
    displayName: "Weather",
    icon: "🌤️",
    category: "System",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("icon", "Icon", "text", 80),
      req("production_multiplier", "Production Mult", "number", 150),
      req("solar_multiplier", "Solar Mult", "number", 120),
      req("wind_multiplier", "Wind Mult", "number", 120),
      req("description", "Description", "text", 260),
      req("sort_order", "Sort Order", "integer", 90),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
  {
    id: "game_config_balancing_rules",
    displayName: "Balancing Rules",
    icon: "⚖️",
    category: "System",
    primaryKey: "id",
    columns: [
      pk("id", "ID", "text", 160),
      req("name", "Name", "text", 180),
      req("description", "Description", "text", 260),
      req("category", "Category", "text", 120),
      col("target", "Target", "text", 140),
      req("multiplier", "Multiplier", "number", 110),
      req("is_active", "Is Active", "boolean", 90),
      col("effective_from", "Effective From", "date", 140),
      col("effective_until", "Effective Until", "date", 140),
      ts("created_at"),
      ts("updated_at"),
    ],
  },
];

// ─── Lookup helpers ─────────────────────────────────────────────────────────

const TABLE_MAP = new Map(TABLE_CONFIGS.map((t) => [t.id, t]));

/** Get a table config by ID, or undefined if not found */
export function getTableConfig(tableId: string): TableConfig | undefined {
  return TABLE_MAP.get(tableId);
}

/** Check if a table ID is in the allowed list */
export function isAllowedTable(tableId: string): boolean {
  return TABLE_MAP.has(tableId);
}

/** Get all allowed table IDs */
export function getAllowedTableIds(): string[] {
  return TABLE_CONFIGS.map((t) => t.id);
}

/** Get table configs grouped by category */
export function getTablesByCategory(): Record<string, TableConfig[]> {
  const result: Record<string, TableConfig[]> = {};
  for (const table of TABLE_CONFIGS) {
    if (!result[table.category]) {
      result[table.category] = [];
    }
    result[table.category].push(table);
  }
  return result;
}
