// ============================================
// research.ts — research domain types.
// ============================================

export type ResearchCategory =
  | "automation"
  | "logistics"
  | "energy"
  | "ai"
  | "robotics"
  | "quantum";

export interface ResearchNode {
  id: string;
  name: string;
  description: string;
  category: ResearchCategory;
  tier: number;
  cost: number; // research points
  timeRequired: number; // ticks
  prerequisites: string[]; // research ids
  effects: ResearchEffect[];
  icon: string;
}

export interface ResearchEffect {
  /** Stable identifier assigned at config-load time as `${researchId}-effect-${index}`.
   *  Consumed by the UI as a React list key. */
  id: string;
  type:
    | "productionSpeed"
    | "transportSpeed"
    | "powerEfficiency"
    | "unlockBuilding"
    | "unlockTransport"
    | "unlockAutomation"
    | "marketBonus"
    | "workerEfficiency"
    | "storageBonus";
  target?: string; // building type, transport type, etc.
  value: number; // multiplier or flat bonus
}
