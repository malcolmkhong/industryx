// ============================================
// FACTORY DOMINION: BALANCE RUNTIME
// Split from balanceConfig.ts — runtime cache and accessors only.
// ============================================

import type { GameBalanceConfig } from './balanceTypes';
import { validateCompleteBalance, validateBalanceOverrides } from './balanceValidator';

let activeBalance: GameBalanceConfig | null = null;
let balanceLoadedAt = 0;

export class BalanceNotLoadedError extends Error {
  constructor() {
    super(
      "[balanceConfig] getBalance() called before complete DB load. " +
        "Call await ensureConfigLoaded() (configLoader.server.ts) before " +
        "any gameplay-affecting route reads balance. " +
        "Per RULES.md [SEC-002]: server down = game down; no defaults.",
    );
    this.name = "BalanceNotLoadedError";
  }
}

export function getBalance(): GameBalanceConfig {
  if (activeBalance === null) {
    throw new BalanceNotLoadedError();
  }
  return activeBalance;
}

export function isBalanceLoaded(): boolean {
  return activeBalance !== null;
}

export function getBalanceLoadedAt(): number {
  return balanceLoadedAt;
}

export function applyBalanceOverrides(complete: GameBalanceConfig): void {
  const completeness = validateCompleteBalance(complete);
  if (!completeness.valid) {
    throw new Error(
      "[balanceConfig] applyBalanceOverrides: incomplete balance: " +
        completeness.errors.join("; "),
    );
  }
  const validation = validateBalanceOverrides(complete as unknown as Record<string, unknown>);
  if (!validation.valid) {
    throw new Error(
      "[balanceConfig] applyBalanceOverrides: invalid values: " +
        validation.errors.join("; "),
    );
  }
  activeBalance = complete;
  balanceLoadedAt = Date.now();
}

export function getGameLimits(): GameBalanceConfig["limits"] {
  return getBalance().limits;
}

export function _resetBalanceForTests(): void {
  activeBalance = null;
  balanceLoadedAt = 0;
}

export const VALID_RESOURCE_KEYS: ReadonlySet<string> = new Set<string>([
  "iron",
  "copper",
  "coal",
  "oil",
  "sand",
  "lithium",
  "water",
  "rareEarth",
  "clay",
  "limestone",
  "gravel",
  "bauxite",
  "wolframite",
  "silver",
  "gold",
  "ironPlate",
  "copperWire",
  "plastic",
  "glass",
  "carbon",
  "bricks",
  "concrete",
  "fertilizer",
  "steel",
  "fossilFuel",
  "circuit",
  "engine",
  "battery",
  "gear",
  "silicon",
  "aluminium",
  "insecticide",
  "copperIngot",
  "titanium",
  "coolant",
  "fiberOptics",
  "solarCell",
  "powerCell",
  "reinforcedConcrete",
  "refinedSilver",
  "refinedGold",
  "aiChip",
  "robotics",
  "quantumPart",
  "advancedAlloy",
  "nanoMaterial",
  "electronics",
  "medicalTech",
  "jewellery",
  "tungsten",
  "weapons",
  "scanDrone",
  "artifactDetector",
  "neuralNetwork",
  "carbonComposite",
  "structuralFrame",
  "fusionCell",
  "solarPanel",
  "creditChip",
  "singularityCore",
  "darkMatterCell",
  "warpDrive",
  "antimatter",
  "chronoPart",
  "plasmaCore",
  "megaStructure",
  "voidCrystal",
  "arcologyModule",
  "habitatModule",
  "stellarEnergy",
  "luxuryGoods",
  "tradeContract",
  "teleporterNode",
  "researchMatrix",
  "worldCore",
  "shieldMatrix",
  "stellarForge",
  "voidEnergy",
  "marketDominance",
  "corpCapital",
  "dimensionalGate",
  "armadaFleet",
  "money",
  "researchPoints",
  "corporationPoints",
]);

export const VALID_WORKER_KEYS: ReadonlySet<string> = new Set<string>([
  "engineer",
  "mechanic",
  "transportManager",
  "aiSupervisor",
]);
