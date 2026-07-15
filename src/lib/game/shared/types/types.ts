// ============================================
// FACTORY DOMINION: SHARED TYPES
// Compatibility barrel. Domain types live in split modules.
// ============================================

export type {
  CostResourceType,
  RawResource,
  ResourceAmount,
  ResourceType,
  Tier1Resource,
  Tier2Resource,
  Tier3Resource,
  Tier4Resource,
  Tier5Resource,
} from "./resources";
export type {
  Blueprint,
  Building,
  BuildingDefinition,
  BuildingInstance,
  BuildingType,
  ExtractorType,
  FactoryType,
  PowerPlantType,
} from "./buildings";
export type { TransportDefinition, TransportLine, TransportType, Drone, DroneMission } from "./transport";
export type { ResearchCategory, ResearchEffect, ResearchNode } from "./research";
export type { Worker, WorkerDefinition, WorkerType } from "./workers";
export type { MarketPrice } from "./market";
export type { PowerGrid, WeatherDefinition, WeatherState, WeatherType } from "./production";
export type { EventEffect, GameEvent, GameNotification } from "./notifications";
export type { AutomationType, AutomationUnlock, PrestigeBonus, PrestigeState } from "./prestige";
export type {
  Contract,
  ContractReward,
  DailyReward,
  LeaderboardEntry,
  LoginStreak,
  MegaProject,
  MegaProjectBonusType,
  MegaProjectStage,
  MegaProjectType,
  PayoutConfig,
  PayoutRecord,
} from "./rewards";
export type { Quest, QuestStep, QuestType } from "./quests";
export type { ServerGameData } from "./server";
export type { GameState, GameTab, UISessionState } from "./state";
