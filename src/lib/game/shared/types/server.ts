// ============================================
// server.ts — ServerGameData (server-authoritative shape).
// ============================================
//
// Pure server-authoritative data. The server builds, validates, persists,
// and returns ONLY this shape. NEVER has UI concerns. Composition
// across the other 12 domain types is intentional — this is the SSOT
// for everything the server persists and returns.
// ============================================

import type {
  MarketSector,
  MarketNews,
  MarketNarrative,
} from "../../market/marketSimulator";
import type { BuildingInstance, Blueprint } from "./buildings";
import type { TransportLine, Drone } from "./transport";
import type { PowerGrid, WeatherState } from "./production";
import type { Worker } from "./workers";
import type { MarketPrice } from "./market";
import type {
  Contract,
  MegaProject,
  LeaderboardEntry,
  LoginStreak,
  PayoutConfig,
  PayoutRecord,
} from "./rewards";
import type { AutomationUnlock, PrestigeState } from "./prestige";
import type { GameEvent } from "./notifications";
import type { Quest } from "./quests";
import type { ResourceType } from "./resources";

export interface ServerGameData {
  // Core
  money: number;
  totalMoneyEarned: number;
  gameTick: number;
  gameSpeed: number;
  paused: boolean;

  // Resources
  resources: Record<ResourceType, number>;
  resourceCapacity: Record<ResourceType, number>;

  // Buildings
  buildings: BuildingInstance[];

  // Transport
  transportLines: TransportLine[];

  // Power
  powerGrid: PowerGrid;

  // Research
  researchPoints: number;
  completedResearch: string[];
  activeResearch: string | null;
  researchProgress: number;
  /**
   * Server-authoritative research queue (max 5 by config; enforced in
   * validateAddResearchToQueueAction). RP cost is deducted at queue
   * time and refunded when the entry is removed — symmetric with the
   * startResearch / cancelResearch flows. PR-1 (server-tick advance)
   * will auto-promote the head of this queue into `activeResearch`
   * when the current active research completes.
   */
  researchQueue: string[];

  // Workers
  workers: Worker[];

  // Market
  market: MarketPrice[];
  sectorTrends: Partial<Record<MarketSector, "up" | "down" | "stable">>;
  marketNews: MarketNews[];
  marketNarratives: MarketNarrative[];
  serverMarket?: {
    prices: Array<{
      resource: string;
      currentPrice: number;
      basePrice: number;
      trend: string;
      volume: number;
    }>;
    news: Array<{
      title: string;
      description: string;
      affectedResources: string[];
    }>;
    tick: number;
    volatility: number;
  };

  // Contracts
  contracts: Contract[];
  completedContracts: number;

  // Automation
  automationUnlocks: AutomationUnlock[];

  // Prestige
  prestigeState: PrestigeState;

  // Events
  activeEvents: GameEvent[];
  eventLog: GameEvent[];

  // Stats
  stats: {
    totalResourcesProduced: Record<ResourceType, number>;
    totalResourcesSold: Record<ResourceType, number>;
    peakEfficiency: number;
    factoriesBuilt: number;
    transportLinesBuilt: number;
    researchCompleted: number;
    contractsCompleted: number;
    tradesCompleted: number;
    playTime: number; // in ticks
  };

  // MegaProjects
  megaProjects: MegaProject[];

  // Blueprints
  blueprints: Blueprint[];

  // Production History
  productionHistory: {
    timestamp: number;
    resources: Record<ResourceType, number>;
    money: number;
    powerProduction: number;
    powerConsumption: number;
  }[];

  // Auto-Sell Resources
  autoSellResources: ResourceType[];

  // Storage Upgrades
  storageUpgradeLevels: Record<ResourceType, number>;

  // Offline Progress
  lastOnlineTimestamp: number;

  // Leaderboard
  leaderboardEntries: LeaderboardEntry[];

  // Login Streak
  loginStreak: LoginStreak;

  // Weather
  weather: WeatherState;

  // Quests
  quests: Quest[];

  // Payout System
  payoutConfig: PayoutConfig;
  pendingPayout: number;
  payoutHistory: PayoutRecord[];

  // Tracked Quest
  trackedQuest: string | null; // quest id that is being tracked/pinned

  // Drone Delivery
  drones: {
    fleet: Drone[];
    completedMissions: number;
    totalEarned: number;
  };
}
