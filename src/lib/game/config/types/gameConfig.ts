import type { BuildingDefinition, ResourceAmount } from "../../shared/types/types";
import type { ClientPowerBalance } from "../balance/balanceTypes";

export type ClientBalanceConfig = {
  tradeCommissionRate: number;
  tradeCooldownSeconds: number;
  workerLevelUpXpBase: number;
  autoSellThresholdRatio: number;
} & Partial<ClientPowerBalance>;

export interface GameConfig {
  buildings: Record<string, BuildingDefinition>;
  resources: Record<string, { name: string; icon: string; tier: number; color: string; category: string; baseCapacity: number }>;
  research: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    tier: number;
    cost: number;
    timeRequired: number;
    prerequisites: string[];
    effects: Record<string, unknown>[];
    icon: string;
  }>;
  market: Array<{
    resource: string;
    basePrice: number;
    demand: number;
    supply: number;
    volatility: number;
    isTradable: boolean;
  }>;
  /** Convenience field: just the resource IDs where isTradable=true. */
  tradableResourceIds: string[];
  weather: Record<string, {
    name: string;
    icon: string;
    productionMultiplier: number;
    solarMultiplier: number;
    windMultiplier: number;
    transportMultiplier?: number;
    description: string;
  }>;
  workers: Array<{
    id: string;
    name: string;
    description: string;
    baseHireCost: number;
    effects: Record<string, unknown>;
    icon: string;
  }>;
  transport: Array<{
    id: string;
    name: string;
    description: string;
    baseCost: ResourceAmount[];
    baseThroughput: number;
    upgradeMultiplier: number;
    icon: string;
  }>;
  automation: Array<{
    id: string;
    name: string;
    description: string;
    cost: number;
    requiresResearch: string | null;
    icon: string;
  }>;
  prestigeBonuses: Array<{
    id: string;
    name: string;
    description: string;
    cost: number;
    effect: Record<string, unknown>;
  }>;
  rankThresholds: Array<{
    rank: number;
    name: string;
    scoreRequired: number;
  }>;
  quests: Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    category: string;
    gameTier: number;
    steps: Record<string, unknown>[];
    reward: Record<string, unknown>;
    targetResource: string | null;
    targetBuilding: string | null;
    icon: string;
  }>;
  dailyRewards: Array<{
    day: number;
    type: string;
    amount: number;
    resourceId: string | null;
  }>;
  eventTemplates: Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    duration: number;
    effects: Record<string, unknown>[];
    icon: string;
  }>;
  seasonalEvents: Array<{
    id: string;
    name: string;
    description: string;
    season: string;
    startDate: string;
    endDate: string;
    effects: Record<string, unknown>[];
    rewards: Record<string, unknown>[];
    icon: string;
    isActive: boolean;
  }>;
  megaProjects: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    stages: Record<string, unknown>[];
    bonus: Record<string, unknown>;
    unlockRequirement: Record<string, unknown>;
  }>;
  gameConfig: Record<string, unknown>;
  /**
   * Client-safe subset of the server-authoritative game_config_balance
   * values. The server is the source of truth for actual gameplay
   * enforcement (cooldowns, commissions, etc.); the client uses these
   * for display-only UX (showing commission %, cooldown progress bars,
   * level-up thresholds).
   *
   * Populated by fetchGameConfigFromSupabase() from the game_config_balance
   * table. If the table is unreachable or the row is missing, sensible
   * defaults are returned (matching the migration 072 seed values).
   */
  balance: ClientBalanceConfig;
  balancingRules?: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    target: string;
    multiplier: number;
    isActive: boolean;
  }>;
  productionChains: Array<{
    id: string;
    upstreamBuilding: string;
    downstreamBuilding: string;
    resourceId: string;
  }>;
  // Metadata
  loadedAt: number;
  source: 'supabase' | 'fallback';
}

/**
 * Default values for the client-safe `GameConfig.balance` subset. Used by:
 * - The /api/game/config/definitions 503 fallback
 * - The /api/game/config/definitions success path when the game_config_balance
 *   table is unreachable or missing the relevant row
 * - The GameConfigProvider client-side fallback config
 * - Route handlers that build a GameConfig literal for server-side
 *   validation (game/compute, game/offline, admin/investigations)
 *
 * Values match the migration 072 seed for game_config_balance.
 */
export const DEFAULT_BALANCE_SUBSET: GameConfig["balance"] = {
  tradeCommissionRate: 0.15,
  tradeCooldownSeconds: 300,
  workerLevelUpXpBase: 100,
  autoSellThresholdRatio: 0.8,
};
