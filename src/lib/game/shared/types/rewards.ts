// ============================================
// rewards.ts — contract, payout, mega-project, leaderboard types.
// ============================================
//
// Reward-bearing gameplay surfaces co-located here. Daily / login
// rewards live next to payouts because both share a "deliver money
// or points on tick" contract; mega-projects and leaderboards live
// here because they're scoring-shaped entities owned by the server.
// ============================================

import type {
  ResourceAmount,
  ResourceType,
} from "./resources";
import type { BuildingType } from "./buildings";

// --- Contracts ---
export interface Contract {
  id: string;
  name: string;
  description: string;
  type: "delivery" | "supply" | "construction" | "military" | "research";
  requiredResources: ResourceAmount[];
  timeLimit: number; // ticks
  timeRemaining: number;
  reward: ContractReward;
  progress: number; // 0-1
  completed: boolean;
  failed: boolean;
  difficulty: number; // 1-5
  gameTier?: number; // 0-3, determines when contract becomes available
  icon: string;
}

export interface ContractReward {
  money: number;
  researchPoints?: number;
  corporationPoints?: number;
  blueprints?: string[];
  unlockBuilding?: BuildingType;
}

// --- Daily Rewards ---
export interface DailyReward {
  day: number; // 1-7 (resets weekly)
  type: "money" | "researchPoints" | "resources" | "corporationPoints";
  amount: number;
  resource?: ResourceType; // only for type='resources'
  claimed: boolean;
}

export interface LoginStreak {
  currentStreak: number;
  longestStreak: number;
  lastLoginDate: string; // YYYY-MM-DD format
  totalLogins: number;
  weeklyRewards: DailyReward[]; // 7 rewards for current week
}

// --- Payout ---
export interface PayoutConfig {
  basePayoutInterval: number; // ticks between payouts
  lastPayoutTick: number;
  totalPayoutsReceived: number;
  autoCollect: boolean; // whether payouts are auto-collected
}

export interface PayoutRecord {
  tick: number;
  amount: number;
  buildingCount: number;
  efficiency: number;
}

// --- MegaProjects ---
export type MegaProjectType =
  | "spaceElevator"
  | "dysonSphere"
  | "quantumInternet"
  | "fusionCity"
  | "terraformingEngine"
  | "galacticTradeHub"
  | "deepCoreExtractor"
  | "neuralCommandCenter"
  | "nanoAssemblyMatrix";

export type MegaProjectBonusType =
  | "transportMultiplier"
  | "powerMultiplier"
  | "researchMultiplier"
  | "productionMultiplier"
  | "unlimitedStorage"
  | "marketMultiplier"
  | "extractionMultiplier"
  | "workerEfficiency"
  | "buildingCostReduction";

export interface MegaProjectStage {
  name: string;
  requiredResources: ResourceAmount[];
  timeRequired: number; // ticks
  completed: boolean;
}

export interface MegaProject {
  type: MegaProjectType;
  name: string;
  description: string;
  icon: string;
  stages: MegaProjectStage[];
  currentStage: number;
  progress: number; // 0-1 for current stage
  active: boolean;
  completed: boolean;
  bonus: {
    type: MegaProjectBonusType;
    description: string;
    value: number;
  };
  unlockRequirement: {
    buildings?: number;
    research?: number;
    prestige?: number;
  };
}

// --- Leaderboard ---
export interface LeaderboardEntry {
  id: string;
  rank: number;
  score: number;
  corporationName: string;
  buildingsBuilt: number;
  researchCompleted: number;
  contractsCompleted: number;
  totalMoneyEarned: number;
  playTime: number;
  prestigeCount: number;
  achievedAt: number; // game tick
  rankName: string; // from RANK_THRESHOLDS
}
