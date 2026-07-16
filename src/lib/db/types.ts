export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/**
 * P2-14a (BUILDING_PRODUCTION_AUDIT §10.6 P2, 2026-07-16):
 * `.select("*")` over-fetches, leaks schema churn into runtime, and
 * widens the trust boundary. PER-003 forbids it in production API
 * paths. Per-table explicit column lists are exported here so call
 * sites can import them and stay schema-typed.
 *
 * Convention: column lists match the generated `Row` type for each
 * table. When a migration adds a column, the typed `Row<T>` forces
 * the consumer to re-evaluate which columns it needs.
 */
export const SUPPORT_TICKETS_COLUMNS =
  "id,user_id,subject,message,status,priority,accepted_by,resolved_at,created_at,updated_at";
export const SUPPORT_MESSAGES_COLUMNS =
  "id,ticket_id,sender_id,sender_type,message,created_at";

// Re-export SUPPORT_TICKETS_COLUMNS / SUPPORT_MESSAGES_COLUMNS through
// the config barrel for convenience in routes that already import from
// @/lib/game/config/config.

// Config table column whitelists (used by safeFetchTable and the generic
// admin config loaders). Each is the canonical column list for that
// table; adding a column requires updating this list AND the migration.
export const CONFIG_TABLE_COLUMNS = {
  game_config_buildings:
    "id,name,description,category,tier,base_cost,cost_multiplier,base_power_consumption,base_power_production,base_production_rate,cycle_time,building_multiplier,fuel,fuel_rate,unlock_research,unlock_prestige,icon,sort_order,created_at,updated_at",
  game_config_production_recipes:
    "id,building_id,resource_id,amount,is_input,created_at",
  game_config_research:
    "id,name,description,category,tier,cost,time_required,prerequisites,effects,icon,requires_research,sort_order,created_at,updated_at",
  game_config_production_chains:
    "id,upstream_building,downstream_building,resource_id,created_at",
  game_config_workers:
    "id,name,description,base_hire_cost,effects,icon,sort_order,created_at,updated_at",
  game_config_weather:
    "id,name,icon,production_multiplier,solar_multiplier,wind_multiplier,description,sort_order,created_at,updated_at",
  game_config_market:
    "resource_id,base_price,demand,supply,volatility,sort_order,is_tradable",
} as const;

export type ConfigTableName = keyof typeof CONFIG_TABLE_COLUMNS;

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action_type: string
          admin_user_id: string
          created_at: string
          details: Json
          id: string
          ip_address: unknown
          payload: Json | null
          target_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          admin_user_id: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          payload?: Json | null
          target_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          admin_user_id?: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          payload?: Json | null
          target_id?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          added_by: string | null
          created_at: string
          email: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          email: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          email?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      cheat_investigations: {
        Row: {
          created_at: string
          description: string
          detection_type: string
          device_id: string | null
          evidence: Json
          fingerprint_hash: string | null
          id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          detection_type: string
          device_id?: string | null
          evidence?: Json
          fingerprint_hash?: string | null
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          detection_type?: string
          device_id?: string | null
          evidence?: Json
          fingerprint_hash?: string | null
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      game_config_automation: {
        Row: {
          cost: number
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          requires_research: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          cost: number
          created_at?: string
          description?: string
          icon: string
          id: string
          name: string
          requires_research?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cost?: number
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          requires_research?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      game_config_balancing_rules: {
        Row: {
          category: string
          created_at: string
          description: string
          effective_from: string | null
          effective_until: string | null
          id: string
          is_active: boolean
          multiplier: number
          name: string
          target: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string
          effective_from?: string | null
          effective_until?: string | null
          id: string
          is_active?: boolean
          multiplier?: number
          name: string
          target?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean
          multiplier?: number
          name?: string
          target?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      game_config_buildings: {
        Row: {
          base_cost: Json
          base_power_consumption: number
          base_power_production: number
          base_production_rate: number | null
          building_multiplier: number
          category: string
          cost_multiplier: number
          created_at: string
          cycle_time: number
          description: string
          fuel: string | null
          fuel_rate: number | null
          icon: string
          id: string
          name: string
          sort_order: number
          tier: number
          unlock_prestige: number | null
          unlock_research: string | null
          updated_at: string
        }
        Insert: {
          base_cost?: Json
          base_power_consumption?: number
          base_power_production?: number
          base_production_rate?: number | null
          building_multiplier?: number
          category: string
          cost_multiplier?: number
          created_at?: string
          cycle_time?: number
          description?: string
          fuel?: string | null
          fuel_rate?: number | null
          icon: string
          id: string
          name: string
          sort_order?: number
          tier?: number
          unlock_prestige?: number | null
          unlock_research?: string | null
          updated_at?: string
        }
        Update: {
          base_cost?: Json
          base_power_consumption?: number
          base_power_production?: number
          base_production_rate?: number | null
          building_multiplier?: number
          category?: string
          cost_multiplier?: number
          created_at?: string
          cycle_time?: number
          description?: string
          fuel?: string | null
          fuel_rate?: number | null
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          tier?: number
          unlock_prestige?: number | null
          unlock_research?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      game_config_daily_rewards: {
        Row: {
          amount: number
          created_at: string
          day: number
          resource_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          day: number
          resource_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          day?: number
          resource_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_config_event_templates: {
        Row: {
          created_at: string
          description: string
          duration: number
          effects: Json
          icon: string
          id: string
          name: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          duration: number
          effects?: Json
          icon: string
          id: string
          name: string
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          duration?: number
          effects?: Json
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_config_game: {
        Row: {
          auto_sell_multiplier: number
          base_payout_interval: number
          created_at: string
          event_trigger_chance: number
          event_trigger_interval: number
          forced_save_ms: number
          id: string
          market_cycle_expansion_max: number
          market_cycle_expansion_min: number
          market_cycle_peak_max: number
          market_cycle_peak_min: number
          market_cycle_recession_max: number
          market_cycle_recession_min: number
          market_cycle_recovery_max: number
          market_cycle_recovery_min: number
          market_macro_event_chance: number
          market_max_injection_effect: number
          market_mean_reversion_rate: number
          market_micro_event_chance: number
          market_phase_expansion_mult: number
          market_phase_peak_mult: number
          market_phase_recession_mult: number
          market_phase_recovery_mult: number
          market_price_lower_bound: number
          market_price_upper_bound: number
          market_trade_decay_rate: number
          max_concurrent_events: number
          max_offline_ticks: number
          max_save_size_bytes: number
          min_offline_ms: number
          min_power_efficiency: number
          passive_rp_per_tick: number
          persist_throttle_ms: number
          rp_extractor_rate: number
          rp_factory_t1_rate: number
          rp_factory_t2_rate: number
          rp_factory_t3_rate: number
          rp_factory_t4_rate: number
          rp_power_rate: number
          save_version: number
          starting_money: number
          t5_drain_rate: number
          tick_interval_ms: number
          updated_at: string
          worker_levelup_xp_base: number
          worker_power_reduction_cap: number
          worker_xp_rate: number
        }
        Insert: {
          auto_sell_multiplier?: number
          base_payout_interval?: number
          created_at?: string
          event_trigger_chance?: number
          event_trigger_interval?: number
          forced_save_ms?: number
          id?: string
          market_cycle_expansion_max?: number
          market_cycle_expansion_min?: number
          market_cycle_peak_max?: number
          market_cycle_peak_min?: number
          market_cycle_recession_max?: number
          market_cycle_recession_min?: number
          market_cycle_recovery_max?: number
          market_cycle_recovery_min?: number
          market_macro_event_chance?: number
          market_max_injection_effect?: number
          market_mean_reversion_rate?: number
          market_micro_event_chance?: number
          market_phase_expansion_mult?: number
          market_phase_peak_mult?: number
          market_phase_recession_mult?: number
          market_phase_recovery_mult?: number
          market_price_lower_bound?: number
          market_price_upper_bound?: number
          market_trade_decay_rate?: number
          max_concurrent_events?: number
          max_save_size_bytes?: number
          min_power_efficiency?: number
          passive_rp_per_tick?: number
          persist_throttle_ms?: number
          rp_extractor_rate?: number
          rp_factory_t1_rate?: number
          rp_factory_t2_rate?: number
          rp_factory_t3_rate?: number
          rp_factory_t4_rate?: number
          rp_power_rate?: number
          save_version?: number
          starting_money?: number
          t5_drain_rate?: number
          updated_at?: string
          worker_levelup_xp_base?: number
          worker_power_reduction_cap?: number
          worker_xp_rate?: number
        }
        Update: {
          auto_sell_multiplier?: number
          base_payout_interval?: number
          created_at?: string
          event_trigger_chance?: number
          event_trigger_interval?: number
          forced_save_ms?: number
          id?: string
          market_cycle_expansion_max?: number
          market_cycle_expansion_min?: number
          market_cycle_peak_max?: number
          market_cycle_peak_min?: number
          market_cycle_recession_max?: number
          market_cycle_recession_min?: number
          market_cycle_recovery_max?: number
          market_cycle_recovery_min?: number
          market_macro_event_chance?: number
          market_max_injection_effect?: number
          market_mean_reversion_rate?: number
          market_micro_event_chance?: number
          market_phase_expansion_mult?: number
          market_phase_peak_mult?: number
          market_phase_recession_mult?: number
          market_phase_recovery_mult?: number
          market_price_lower_bound?: number
          market_price_upper_bound?: number
          market_trade_decay_rate?: number
          max_concurrent_events?: number
          max_save_size_bytes?: number
          min_power_efficiency?: number
          passive_rp_per_tick?: number
          persist_throttle_ms?: number
          rp_extractor_rate?: number
          rp_factory_t1_rate?: number
          rp_factory_t2_rate?: number
          rp_factory_t3_rate?: number
          rp_factory_t4_rate?: number
          rp_power_rate?: number
          save_version?: number
          starting_money?: number
          t5_drain_rate?: number
          updated_at?: string
          worker_levelup_xp_base?: number
          worker_power_reduction_cap?: number
          worker_xp_rate?: number
        }
        Relationships: []
      }
      game_config_market: {
        Row: {
          base_price: number
          created_at: string
          demand: number
          elasticity: number
          is_tradable: boolean
          resource_id: string
          sector: string
          sort_order: number
          supply: number
          updated_at: string
          volatility: number
        }
        Insert: {
          base_price: number
          created_at?: string
          demand?: number
          elasticity?: number
          is_tradable?: boolean
          resource_id: string
          sector?: string
          sort_order?: number
          supply?: number
          updated_at?: string
          volatility?: number
        }
        Update: {
          base_price?: number
          created_at?: string
          demand?: number
          elasticity?: number
          is_tradable?: boolean
          resource_id?: string
          sector?: string
          sort_order?: number
          supply?: number
          updated_at?: string
          volatility?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_config_market_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "game_config_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      game_config_market_history: {
        Row: {
          base_price: number
          game_tick: number | null
          id: number
          market_phase: string | null
          recorded_at: string
          resource_id: string
        }
        Insert: {
          base_price: number
          game_tick?: number | null
          id?: number
          market_phase?: string | null
          recorded_at?: string
          resource_id: string
        }
        Update: {
          base_price?: number
          game_tick?: number | null
          id?: number
          market_phase?: string | null
          recorded_at?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_config_market_history_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "game_config_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      game_config_mega_projects: {
        Row: {
          bonus: Json
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          sort_order: number
          stages: Json
          unlock_requirement: Json
          updated_at: string
        }
        Insert: {
          bonus?: Json
          created_at?: string
          description?: string
          icon: string
          id: string
          name: string
          sort_order?: number
          stages?: Json
          unlock_requirement?: Json
          updated_at?: string
        }
        Update: {
          bonus?: Json
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          stages?: Json
          unlock_requirement?: Json
          updated_at?: string
        }
        Relationships: []
      }
      game_config_prestige_bonuses: {
        Row: {
          cost: number
          created_at: string
          description: string
          effect: Json
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cost: number
          created_at?: string
          description?: string
          effect: Json
          id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cost?: number
          created_at?: string
          description?: string
          effect?: Json
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      game_config_production_chains: {
        Row: {
          created_at: string
          downstream_building: string
          id: string
          resource_id: string
          upstream_building: string
        }
        Insert: {
          created_at?: string
          downstream_building: string
          id: string
          resource_id: string
          upstream_building: string
        }
        Update: {
          created_at?: string
          downstream_building?: string
          id?: string
          resource_id?: string
          upstream_building?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_config_production_chains_downstream_building_fkey"
            columns: ["downstream_building"]
            isOneToOne: false
            referencedRelation: "game_config_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_config_production_chains_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "game_config_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_config_production_chains_upstream_building_fkey"
            columns: ["upstream_building"]
            isOneToOne: false
            referencedRelation: "game_config_buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      game_config_production_recipes: {
        Row: {
          amount: number
          building_id: string
          created_at: string
          id: string
          is_input: boolean
          resource_id: string
        }
        Insert: {
          amount?: number
          building_id: string
          created_at?: string
          id: string
          is_input: boolean
          resource_id: string
        }
        Update: {
          amount?: number
          building_id?: string
          created_at?: string
          id?: string
          is_input?: boolean
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_config_production_recipes_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "game_config_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_config_production_recipes_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "game_config_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      game_config_quest_definitions: {
        Row: {
          category: string
          created_at: string
          description: string
          game_tier: number | null
          icon: string
          id: string
          name: string
          reward: Json
          sort_order: number
          steps: Json
          target_building: string | null
          target_resource: string | null
          type: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string
          game_tier?: number | null
          icon: string
          id: string
          name: string
          reward?: Json
          sort_order?: number
          steps?: Json
          target_building?: string | null
          target_resource?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          game_tier?: number | null
          icon?: string
          id?: string
          name?: string
          reward?: Json
          sort_order?: number
          steps?: Json
          target_building?: string | null
          target_resource?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_config_rank_thresholds: {
        Row: {
          created_at: string
          name: string
          rank: number
          score_required: number
        }
        Insert: {
          created_at?: string
          name: string
          rank: number
          score_required: number
        }
        Update: {
          created_at?: string
          name?: string
          rank?: number
          score_required?: number
        }
        Relationships: []
      }
      game_config_research: {
        Row: {
          category: string
          cost: number
          created_at: string
          description: string
          effects: Json
          icon: string
          id: string
          name: string
          prerequisites: Json
          sort_order: number
          tier: number
          time_required: number
          updated_at: string
        }
        Insert: {
          category: string
          cost: number
          created_at?: string
          description?: string
          effects?: Json
          icon: string
          id: string
          name: string
          prerequisites?: Json
          sort_order?: number
          tier?: number
          time_required: number
          updated_at?: string
        }
        Update: {
          category?: string
          cost?: number
          created_at?: string
          description?: string
          effects?: Json
          icon?: string
          id?: string
          name?: string
          prerequisites?: Json
          sort_order?: number
          tier?: number
          time_required?: number
          updated_at?: string
        }
        Relationships: []
      }
      game_config_resources: {
        Row: {
          category: string
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          sort_order: number
          tier: number
          updated_at: string
        }
        Insert: {
          category?: string
          color?: string
          created_at?: string
          icon: string
          id: string
          name: string
          sort_order?: number
          tier?: number
          updated_at?: string
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      game_config_seasonal_events: {
        Row: {
          created_at: string
          description: string
          effects: Json
          end_date: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          rewards: Json
          season: string
          sort_order: number
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          effects?: Json
          end_date?: string | null
          icon: string
          id: string
          is_active?: boolean
          name: string
          rewards?: Json
          season: string
          sort_order?: number
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          effects?: Json
          end_date?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          rewards?: Json
          season?: string
          sort_order?: number
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      game_config_transport: {
        Row: {
          base_cost: Json
          base_throughput: number
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          upgrade_multiplier: number
        }
        Insert: {
          base_cost?: Json
          base_throughput: number
          created_at?: string
          description?: string
          icon: string
          id: string
          name: string
          sort_order?: number
          updated_at?: string
          upgrade_multiplier?: number
        }
        Update: {
          base_cost?: Json
          base_throughput?: number
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          upgrade_multiplier?: number
        }
        Relationships: []
      }
      game_config_weather: {
        Row: {
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          production_multiplier: number
          solar_multiplier: number
          sort_order: number
          updated_at: string
          wind_multiplier: number
        }
        Insert: {
          created_at?: string
          description?: string
          icon: string
          id: string
          name: string
          production_multiplier?: number
          solar_multiplier?: number
          sort_order?: number
          updated_at?: string
          wind_multiplier?: number
        }
        Update: {
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          production_multiplier?: number
          solar_multiplier?: number
          sort_order?: number
          updated_at?: string
          wind_multiplier?: number
        }
        Relationships: []
      }
      game_config_workers: {
        Row: {
          base_hire_cost: number
          created_at: string
          description: string
          effects: Json
          icon: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          base_hire_cost: number
          created_at?: string
          description?: string
          effects: Json
          icon: string
          id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          base_hire_cost?: number
          created_at?: string
          description?: string
          effects?: Json
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      guest_identities: {
        Row: {
          claimed_at: string
          created_at: string
          device_id: string | null
          fingerprint: string
          fingerprint_hash: string | null
          id: string
          is_primary: boolean
          last_used_at: string
          superseded_at: string | null
          superseded_by: string | null
          user_id: string
        }
        Insert: {
          claimed_at?: string
          created_at?: string
          device_id?: string | null
          fingerprint: string
          fingerprint_hash?: string | null
          id?: string
          is_primary?: boolean
          last_used_at?: string
          superseded_at?: string | null
          superseded_by?: string | null
          user_id: string
        }
        Update: {
          claimed_at?: string
          created_at?: string
          device_id?: string | null
          fingerprint?: string
          fingerprint_hash?: string | null
          id?: string
          is_primary?: boolean
          last_used_at?: string
          superseded_at?: string | null
          superseded_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      leaderboard: {
        Row: {
          buildings_built: number
          contracts_completed: number
          corporation_name: string
          created_at: string
          game_tick: number
          id: string
          play_time_ticks: number
          prestige_count: number
          rank_name: string | null
          research_completed: number
          score: number
          total_money_earned: number
          user_id: string
        }
        Insert: {
          buildings_built?: number
          contracts_completed?: number
          corporation_name?: string
          created_at?: string
          game_tick?: number
          id?: string
          play_time_ticks?: number
          prestige_count?: number
          rank_name?: string | null
          research_completed?: number
          score: number
          total_money_earned?: number
          user_id: string
        }
        Update: {
          buildings_built?: number
          contracts_completed?: number
          corporation_name?: string
          created_at?: string
          game_tick?: number
          id?: string
          play_time_ticks?: number
          prestige_count?: number
          rank_name?: string | null
          research_completed?: number
          score?: number
          total_money_earned?: number
          user_id?: string
        }
        Relationships: []
      }
      market_player_pressure: {
        Row: {
          buy_volume: number
          resource: string
          sell_volume: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          buy_volume?: number
          resource: string
          sell_volume?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          buy_volume?: number
          resource?: string
          sell_volume?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      market_supply_demand: {
        Row: {
          consumption: number
          net_pressure: number
          player_count: number
          production: number
          resource: string
          updated_at: string
        }
        Insert: {
          consumption?: number
          net_pressure?: number
          player_count?: number
          production?: number
          resource: string
          updated_at?: string
        }
        Update: {
          consumption?: number
          net_pressure?: number
          player_count?: number
          production?: number
          resource?: string
          updated_at?: string
        }
        Relationships: []
      }
      merge_audit_log: {
        Row: {
          actor_ip_hash: string | null
          actor_ip_region: string | null
          actor_user_agent: string | null
          actor_user_id: string
          created_at: string
          fingerprint_hash: string | null
          google_state_after: Json | null
          google_state_before: Json | null
          google_user_id: string
          guest_state_after: Json | null
          guest_state_before: Json | null
          guest_user_id: string
          id: string
          idempotency_key: string
          merge_receipt_id: string
          merge_result: Json | null
          preference: string
          preview_version: Json | null
          risk_flags: Json | null
          risk_score: number | null
        }
        Insert: {
          actor_ip_hash?: string | null
          actor_ip_region?: string | null
          actor_user_agent?: string | null
          actor_user_id: string
          created_at?: string
          fingerprint_hash?: string | null
          google_state_after?: Json | null
          google_state_before?: Json | null
          google_user_id: string
          guest_state_after?: Json | null
          guest_state_before?: Json | null
          guest_user_id: string
          id?: string
          idempotency_key: string
          merge_receipt_id: string
          merge_result?: Json | null
          preference: string
          preview_version?: Json | null
          risk_flags?: Json | null
          risk_score?: number | null
        }
        Update: {
          actor_ip_hash?: string | null
          actor_ip_region?: string | null
          actor_user_agent?: string | null
          actor_user_id?: string
          created_at?: string
          fingerprint_hash?: string | null
          google_state_after?: Json | null
          google_state_before?: Json | null
          google_user_id?: string
          guest_state_after?: Json | null
          guest_state_before?: Json | null
          guest_user_id?: string
          id?: string
          idempotency_key?: string
          merge_receipt_id?: string
          merge_result?: Json | null
          preference?: string
          preview_version?: Json | null
          risk_flags?: Json | null
          risk_score?: number | null
        }
        Relationships: []
      }
      merge_receipts: {
        Row: {
          archived_user_id: string | null
          created_at: string | null
          decision_type: string
          expires_at: string | null
          google_state_snapshot: Json | null
          guest_state_snapshot: Json | null
          id: string
          kept_user_id: string
          operation_id: string
          risk_score: number | null
        }
        Insert: {
          archived_user_id?: string | null
          created_at?: string | null
          decision_type: string
          expires_at?: string | null
          google_state_snapshot?: Json | null
          guest_state_snapshot?: Json | null
          id?: string
          kept_user_id: string
          operation_id: string
          risk_score?: number | null
        }
        Update: {
          archived_user_id?: string | null
          created_at?: string | null
          decision_type?: string
          expires_at?: string | null
          google_state_snapshot?: Json | null
          guest_state_snapshot?: Json | null
          id?: string
          kept_user_id?: string
          operation_id?: string
          risk_score?: number | null
        }
        Relationships: []
      }
      pending_link_operations: {
        Row: {
          completed_at: string | null
          confirmed_email: string | null
          created_at: string
          device_id: string | null
          expires_at: string
          fingerprint_hash: string | null
          google_user_id: string | null
          guest_user_id: string
          id: string
          idempotency_key: string
          ip_hash: string | null
          ip_region: string | null
          merge_result: Json | null
          preference: string | null
          preview_version: Json | null
          risk_flags: Json | null
          risk_score: number | null
          status: string
          user_agent: string | null
        }
        Insert: {
          completed_at?: string | null
          confirmed_email?: string | null
          created_at?: string
          device_id?: string | null
          expires_at: string
          fingerprint_hash?: string | null
          google_user_id?: string | null
          guest_user_id: string
          id?: string
          idempotency_key: string
          ip_hash?: string | null
          ip_region?: string | null
          merge_result?: Json | null
          preference?: string | null
          preview_version?: Json | null
          risk_flags?: Json | null
          risk_score?: number | null
          status?: string
          user_agent?: string | null
        }
        Update: {
          completed_at?: string | null
          confirmed_email?: string | null
          created_at?: string
          device_id?: string | null
          expires_at?: string
          fingerprint_hash?: string | null
          google_user_id?: string | null
          guest_user_id?: string
          id?: string
          idempotency_key?: string
          ip_hash?: string | null
          ip_region?: string | null
          merge_result?: Json | null
          preference?: string | null
          preview_version?: Json | null
          risk_flags?: Json | null
          risk_score?: number | null
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      player_actions: {
        Row: {
          action_type: string
          checksum: string | null
          created_at: string
          game_tick: number
          id: string
          is_valid: boolean
          money_after: number
          payload: Json
          rejection_reason: string | null
          user_id: string
          validation_risk: string | null
        }
        Insert: {
          action_type: string
          checksum?: string | null
          created_at?: string
          game_tick?: number
          id?: string
          is_valid?: boolean
          money_after?: number
          payload?: Json
          rejection_reason?: string | null
          user_id: string
          validation_risk?: string | null
        }
        Update: {
          action_type?: string
          checksum?: string | null
          created_at?: string
          game_tick?: number
          id?: string
          is_valid?: boolean
          money_after?: number
          payload?: Json
          rejection_reason?: string | null
          user_id?: string
          validation_risk?: string | null
        }
        Relationships: []
      }
      player_progress: {
        Row: {
          active_research: string | null
          auto_collect: boolean | null
          auto_sell_resources: Json | null
          blueprints: Json | null
          completed_research: Json
          contracts: Json
          created_at: string
          daily_login_streak: number | null
          daily_rewards_claimed: Json | null
          display_name: string | null
          drones: Json | null
          events: Json
          game_state: Json | null
          last_daily_login_at: string | null
          last_tick_at: string
          market_state: Json
          mega_projects: Json
          payout_config: Json
          pending_payout: number | null
          power_grid: Json | null
          prestige_state: Json
          quests: Json
          research_points: number
          research_progress: number
          resource_capacity: Json | null
          stats: Json
          storage_upgrade_levels: Json | null
          transport_lines: Json
          updated_at: string
          user_id: string
          weather: Json
          workers: Json
        }
        Insert: {
          active_research?: string | null
          auto_collect?: boolean | null
          auto_sell_resources?: Json | null
          blueprints?: Json | null
          completed_research?: Json
          contracts?: Json
          created_at?: string
          daily_login_streak?: number | null
          daily_rewards_claimed?: Json | null
          display_name?: string | null
          drones?: Json | null
          events?: Json
          game_state?: Json | null
          last_daily_login_at?: string | null
          last_tick_at?: string
          market_state?: Json
          mega_projects?: Json
          payout_config?: Json
          pending_payout?: number | null
          power_grid?: Json | null
          prestige_state?: Json
          quests?: Json
          research_points?: number
          research_progress?: number
          resource_capacity?: Json | null
          stats?: Json
          storage_upgrade_levels?: Json | null
          transport_lines?: Json
          updated_at?: string
          user_id: string
          weather?: Json
          workers?: Json
        }
        Update: {
          active_research?: string | null
          auto_collect?: boolean | null
          auto_sell_resources?: Json | null
          blueprints?: Json | null
          completed_research?: Json
          contracts?: Json
          created_at?: string
          daily_login_streak?: number | null
          daily_rewards_claimed?: Json | null
          display_name?: string | null
          drones?: Json | null
          events?: Json
          game_state?: Json | null
          last_daily_login_at?: string | null
          last_tick_at?: string
          market_state?: Json
          mega_projects?: Json
          payout_config?: Json
          pending_payout?: number | null
          power_grid?: Json | null
          prestige_state?: Json
          quests?: Json
          research_points?: number
          research_progress?: number
          resource_capacity?: Json | null
          stats?: Json
          storage_upgrade_levels?: Json | null
          transport_lines?: Json
          updated_at?: string
          user_id?: string
          weather?: Json
          workers?: Json
        }
        Relationships: []
      }
      player_sessions: {
        Row: {
          connected_at: string
          created_at: string
          disconnected_at: string | null
          id: string
          is_online: boolean
          last_heartbeat_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          created_at?: string
          disconnected_at?: string | null
          id?: string
          is_online?: boolean
          last_heartbeat_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          created_at?: string
          disconnected_at?: string | null
          id?: string
          is_online?: boolean
          last_heartbeat_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          device_fingerprint: string | null
          display_name: string | null
          id: string
          is_guest: boolean
          last_active: string | null
          linked_account_id: string | null
          linked_at: string | null
          season_id: string | null
          session_count: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          device_fingerprint?: string | null
          display_name?: string | null
          id: string
          is_guest?: boolean
          last_active?: string | null
          linked_account_id?: string | null
          linked_at?: string | null
          season_id?: string | null
          session_count?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          device_fingerprint?: string | null
          display_name?: string | null
          id?: string
          is_guest?: boolean
          last_active?: string | null
          linked_account_id?: string | null
          linked_at?: string | null
          season_id?: string | null
          session_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          endpoint: string
          id: number
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          endpoint: string
          id?: number
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          endpoint?: string
          id?: number
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      request_ip_log: {
        Row: {
          created_at: string
          endpoint: string
          id: number
          ip_hash: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: number
          ip_hash: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: number
          ip_hash?: string
          user_id?: string | null
        }
        Relationships: []
      }
      server_game_state: {
        Row: {
          buildings: Json
          buildings_count: number
          cheat_flag_count: number
          completed_research: Json
          created_at: string
          full_state: Json
          game_speed: number
          game_tick: number
          id: string
          is_locked: boolean
          last_saved_at: string
          last_tick_at: string
          last_trade_at: string | null
          lock_reason: string | null
          market_supply: Json
          money: number
          research_points: number
          resources: Json
          state_hash: string
          state_version: number
          total_money_earned: number
          user_id: string
          workers: Json
        }
        Insert: {
          buildings?: Json
          buildings_count?: number
          cheat_flag_count?: number
          completed_research?: Json
          created_at?: string
          full_state?: Json
          game_speed?: number
          game_tick?: number
          id?: string
          is_locked?: boolean
          last_saved_at?: string
          last_tick_at?: string
          last_trade_at?: string | null
          lock_reason?: string | null
          market_supply?: Json
          money?: number
          research_points?: number
          resources?: Json
          state_hash: string
          state_version?: number
          total_money_earned?: number
          user_id: string
          workers?: Json
        }
        Update: {
          buildings?: Json
          buildings_count?: number
          cheat_flag_count?: number
          completed_research?: Json
          created_at?: string
          full_state?: Json
          game_speed?: number
          game_tick?: number
          id?: string
          is_locked?: boolean
          last_saved_at?: string
          last_tick_at?: string
          last_trade_at?: string | null
          lock_reason?: string | null
          market_supply?: Json
          money?: number
          research_points?: number
          resources?: Json
          state_hash?: string
          state_version?: number
          total_money_earned?: number
          user_id?: string
          workers?: Json
        }
        Relationships: []
      }
      server_market_state: {
        Row: {
          base_prices: Json
          circuit_breakers: Json | null
          id: number
          news: Json
          prices: Json
          tick: number
          updated_at: string | null
          volatility: number
        }
        Insert: {
          base_prices?: Json
          circuit_breakers?: Json | null
          id?: number
          news?: Json
          prices?: Json
          tick?: number
          updated_at?: string | null
          volatility?: number
        }
        Update: {
          base_prices?: Json
          circuit_breakers?: Json | null
          id?: number
          news?: Json
          prices?: Json
          tick?: number
          updated_at?: string | null
          volatility?: number
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          sender_id: string | null
          sender_type: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender_id?: string | null
          sender_type: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender_id?: string | null
          sender_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          accepted_by: string | null
          created_at: string
          id: string
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          id?: string
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          id?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      trade_history: {
        Row: {
          commission_rate: number
          created_at: string
          exchange_rate_used: number | null
          game_tick: number
          give_amount: number
          give_resource: string
          id: string
          market_phase: string | null
          receive_amount: number
          receive_resource: string
          server_state_version: number | null
          server_validated: boolean
          user_id: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          exchange_rate_used?: number | null
          game_tick?: number
          give_amount: number
          give_resource: string
          id?: string
          market_phase?: string | null
          receive_amount: number
          receive_resource: string
          server_state_version?: number | null
          server_validated?: boolean
          user_id: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          exchange_rate_used?: number | null
          game_tick?: number
          give_amount?: number
          give_resource?: string
          id?: string
          market_phase?: string | null
          receive_amount?: number
          receive_resource?: string
          server_state_version?: number | null
          server_validated?: boolean
          user_id?: string
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          converted_at: string | null
          created_at: string
          email: string
          id: string
          invited_at: string | null
          name: string | null
          notes: string | null
          source: string | null
          status: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_at?: string | null
          name?: string | null
          notes?: string | null
          source?: string | null
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_at?: string | null
          name?: string | null
          notes?: string | null
          source?: string | null
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_market_tick: {
        Args: {
          p_breakers: Json
          p_events: Json
          p_prices: Json
          p_tick: number
          p_volatility: number
        }
        Returns: {
          events_recorded: number
          history_inserted: number
          prices_recorded: number
          tick_number: number
        }[]
      }
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_identifier: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          max_requests: number
          reset_at: string
        }[]
      }
      cleanup_orphan_anon_users: { Args: never; Returns: number }
      cleanup_rate_limits: { Args: { p_older_than?: string }; Returns: number }
      cleanup_stale_sessions: { Args: never; Returns: number }
      clear_supply_demand: { Args: never; Returns: undefined }
      compute_offline_ticks: {
        Args: { p_max_ticks?: number; p_user_id: string }
        Returns: number
      }
      expire_stale_pending_operations: { Args: never; Returns: number }
      get_capacity_status: {
        Args: never
        Returns: {
          active_15m: number
          active_24h: number
          active_7d: number
          guest_users: number
          max_total_players: number
          registered_users: number
          status: string
          total_players: number
          utilization_pct: number
          waitlist_count: number
        }[]
      }
      get_leaderboard: {
        Args: { p_limit?: number; p_user_id?: string }
        Returns: {
          buildings_built: number
          contracts_completed: number
          corporation_name: string
          created_at: string
          game_tick: number
          id: string
          play_time_ticks: number
          prestige_count: number
          rank: number
          rank_name: string
          research_completed: number
          score: number
          total_money_earned: number
          user_id: string
        }[]
      }
      get_user_rank: {
        Args: { p_user_id: string }
        Returns: {
          best_rank: number
          best_score: number
          total_runs: number
        }[]
      }
      increment_cheat_flag: {
        Args: {
          p_description: string
          p_flag_type: string
          p_severity: string
          p_user_id: string
        }
        Returns: undefined
      }
      is_game_admin: { Args: never; Returns: boolean }
      lock_cheater_account: {
        Args: { p_reason: string; p_user_id: string }
        Returns: undefined
      }
      now_iso: { Args: never; Returns: string }
      set_capacity: { Args: { p_max: number }; Returns: undefined }
      submit_waitlist: {
        Args: { p_email: string; p_name?: string; p_source?: string }
        Returns: {
          estimated_wait_days: number
          position: number
          status: string
          ticket_id: string
          waitlist_id: string
        }[]
      }
      unlock_account: {
        Args: { p_note: string; p_user_id: string }
        Returns: undefined
      }
      upsert_market_pressure: {
        Args: {
          p_buy_volume: number
          p_resource: string
          p_sell_volume: number
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_supply_demand: {
        Args: {
          p_consumption: number
          p_player_count: number
          p_production: number
          p_resource: string
        }
        Returns: undefined
      }
      validate_game_action: {
        Args: {
          p_action_type: string
          p_current_game_tick: number
          p_current_money: number
          p_payload: Json
          p_user_id: string
        }
        Returns: Json
      }
      validate_research_prereqs: {
        Args: { p_completed_research: string[]; p_research_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
