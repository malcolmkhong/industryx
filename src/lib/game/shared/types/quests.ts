// ============================================
// quests.ts — quest types.
// ============================================

import type { ResourceType } from "./resources";
import type { BuildingType } from "./buildings";

export type QuestType =
  | "build"
  | "produce"
  | "sell"
  | "research"
  | "earn"
  | "reach"
  | "contract"
  | "transport"
  | "worker"
  | "prestige"
  | "megaProject";

export interface QuestStep {
  /** Stable identifier assigned at config-load time as `${questId}-step-${index}`.
   *  Consumed by the UI as a React list key. */
  id: string;
  description: string;
  target: number;
  current: number;
  completed: boolean;
}

export interface Quest {
  id: string;
  name: string;
  description: string;
  type: QuestType;
  category: "tutorial" | "daily" | "weekly" | "challenge" | "milestone";
  gameTier?: number; // 0-4, determines when quest becomes available
  steps: QuestStep[];
  reward: {
    money: number;
    researchPoints?: number;
    corporationPoints?: number;
  };
  completed: boolean;
  claimed: boolean;
  expiresAt?: number; // tick for daily/weekly quests
  icon: string;
  /** Optional target resource/building for specific tracking */
  targetResource?: ResourceType;
  targetBuilding?: BuildingType;
}
