// ============================================
// prestige.ts — prestige + automation unlocks.
// ============================================
//
// Prestige state and bonuses. Automation unlocks live here because
// ServerGameData.automationUnlocks is co-located with prestigeState in
// the save payload — keeping them adjacent reduces cross-domain hops
// when reading or writing the prestige flow.
// ============================================

// --- Automation ---
export type AutomationType =
  | "autoRouting"
  | "autoBalancing"
  | "selfRepair"
  | "autoTrading"
  | "autoExpansion"
  | "smartStorage"
  | "aiOptimization";

export interface AutomationUnlock {
  type: AutomationType;
  name: string;
  description: string;
  cost: number; // corporation points
  active: boolean;
  requiresResearch?: string;
  icon: string;
}

// --- Prestige / Global Expansion ---
export interface PrestigeState {
  corporationPoints: number;
  totalPrestiges: number;
  megaFactoryUnlocked: boolean;
  bonuses: PrestigeBonus[];
}

export interface PrestigeBonus {
  id: string;
  name: string;
  description: string;
  cost: number;
  purchased: boolean;
  effect: {
    type: string;
    value: number;
  };
}
