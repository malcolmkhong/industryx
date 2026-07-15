// ============================================
// FACTORY DOMINION: AUTOMATED EMPIRE
// Game Store Type Definitions
// ============================================

import type {
  GameState,
  GameTab,
  ResourceType,
  BuildingType,
  TransportType,
  WorkerType,
  Contract,
  GameNotification,
  MegaProjectType,
  LeaderboardEntry,
  DroneMission,
} from '../shared/types/types';
import type { LLMEngineState } from '../market/news/newsLLM';

// --- Store Actions ---
export interface GameActions {
  // Core
  setGameSpeed: (speed: number) => Promise<void>;
  togglePause: () => void;
  setActiveTab: (tab: GameTab) => void;

  // Buildings
  buildBuilding: (type: BuildingType) => Promise<void>;
  upgradeBuilding: (id: string) => void;
  toggleBuilding: (id: string) => Promise<void>;
  selectBuilding: (id: string | null) => void;

  // Transport
  buildTransportLine: (type: TransportType, from: string, to: string, resource: ResourceType) => void;
  upgradeTransportLine: (id: string) => void;
  toggleTransportLine: (id: string) => void;

  // Research
  startResearch: (id: string) => Promise<void>;
  cancelResearch: (id: string) => Promise<void>;
  addToResearchQueue: (id: string) => Promise<void>;
  removeFromResearchQueue: (id: string) => Promise<void>;

  // Workers
  hireWorker: (type: WorkerType) => Promise<void>;
  assignWorker: (workerId: string, buildingId: string | null) => Promise<void>;
  levelUpWorker: (workerId: string) => void;

  // Market
  sellResource: (resource: ResourceType, amount: number) => Promise<void>;
  buyResource: (resource: ResourceType, amount: number) => Promise<void>;
  toggleAutoSell: (resource: ResourceType) => void;

  // Contracts
  acceptContract: (contract: Contract) => void;
  fulfillContract: (id: string) => void;

  // Automation
  activateAutomation: (type: string) => void;

  // Prestige
  doPrestige: () => Promise<void>;
  purchasePrestigeBonus: (id: string) => void;

  // Notifications
  addNotification: (type: GameNotification['type'], message: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;

  // MegaProjects
  startMegaProject: (type: MegaProjectType) => void;
  contributeToMegaProject: (type: MegaProjectType) => void;

  // Blueprints
  saveBlueprint: (name: string) => void;
  loadBlueprint: (id: string) => void;
  deleteBlueprint: (id: string) => void;
  renameBlueprint: (id: string, name: string) => void;
  exportBlueprint: (id: string) => string;
  importBlueprint: (code: string) => boolean;

  // Storage
  upgradeStorage: (resource: ResourceType, levels: number) => void;

  // Rank
  getCurrentRank: () => { name: string; icon: string; color: string; score: number; nextRankScore: number | null; progress: number };

  // Game Tier
  getPlayerGameTier: () => number;

  // Leaderboard
  addLeaderboardEntry: (entry: LeaderboardEntry) => void;

  // Daily Rewards
  checkDailyLogin: () => void;
  claimDailyReward: (day: number) => void;

  // Quests
  claimQuestReward: (questId: string) => Promise<void>;
  updateQuestProgress: (type: string, amount: number, targetId?: string) => void;
  setTrackedQuest: (id: string | null) => void;

  // Anti-Cheat — Phase 7.3: client-side divergence detection
  // Compares local money vs server-computed maximum (e.g., totalMoneyEarned).
  // Returns true if local exceeds expected by >10%, indicating possible state manipulation.
  divergesFromExpected: (serverComputedMax: number) => boolean;

  // Payouts
  collectPayout: () => void;
  toggleAutoCollect: () => void;

  // Drones
  buyDrone: () => void;
  sendDrone: (missionId: string, droneId: string) => Promise<void>;
  upgradeDrone: (droneId: string, type: 'speed' | 'capacity' | 'fuelEfficiency') => void;
  generateDroneMissions: () => DroneMission[];

  // LLM News State
  getNewsLLMState: () => LLMEngineState;
  refreshNewsFromLLM: (updates: Array<{ id: string; title: string; description: string; affectedResources?: string[]; textSource: 'llm' }>) => void;
}

export type GameStore = GameState & GameActions;
