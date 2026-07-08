// ============================================
// FACTORY DOMINION: Game Balance Configuration
// All tunable game-balance numeric values extracted
// from hardcoded magic numbers into a single config.
//
// Future: can be overridden from game_config_balancing_rules
// table in Supabase for live tuning without code deploys.
// ============================================

import type { ResourceType, WorkerType } from "./types";

export interface GameBalanceConfig {
  // ─── Research Points ────────────────────────────────────────────
  rp: {
    passiveBase: number; // Base passive RP per tick
    aiLabBonus: number; // Additional RP per AI Lab per tick
    extractorRate: number; // RP per extractor per tick
    powerRate: number; // RP per power plant per tick
    factoryT1Rate: number; // RP per T1 factory per tick
    factoryT2Rate: number; // RP per T2 factory per tick
    factoryT3Rate: number; // RP per T3 factory per tick
    factoryT4Rate: number; // RP per T4 factory per tick
    factoryT5Rate: number; // RP per T5 factory per tick
    completionRefundRatio: number; // Fraction of RP cost refunded on completion
  };

  // ─── Worker System ──────────────────────────────────────────────
  worker: {
    xpPerTick: number; // Base XP gained per tick
    efficiencyGainPerTick: number; // Efficiency gained per tick
    maxPowerReductionPerBuilding: number; // Cap on power reduction per building (0–1)
  };

  // ─── Building Upgrades ──────────────────────────────────────────
  building: {
    upgradeEfficiencyGain: number; // Efficiency % gained per upgrade level
  };

  // ─── Transport ──────────────────────────────────────────────────
  transport: {
    productionBonusCoeff: number; // Coefficient for transport production bonus
    upgradeCostExponent: number; // Exponential cost multiplier for upgrades
  };

  // ─── Contract System ────────────────────────────────────────────
  contract: {
    tierRewardCoeff: number; // Reward scaling per contract tier
    difficultyRewardCoeff: number; // Reward scaling per difficulty level
    difficultyResourceCoeff: number; // Resource amount scaling per difficulty level
  };

  // ─── Auto-Sell ──────────────────────────────────────────────────
  autoSell: {
    thresholdRatio: number; // Fraction [0,1] — when storage exceeds this, auto-sell kicks in
    excessSellRatio: number; // Fraction of excess sold per tick
    maxSellCapacityRatio: number; // Max sell amount as fraction of capacity per tick
    // Phase 3 C3: soft-cap multiplier — production ramps down between softCapRatio and 1.0.
    // Without this, factories dump full output and overflow is silently dropped.
    softCapRatio: number; // Fraction [0.5, 1] — start slowing production at this fill %
  };

  // ─── Market ─────────────────────────────────────────────────────
  market: {
    baseSellMultiplier: number; // Base sell price multiplier (1 = no fee)
    buyPriceMarkup: number; // Buy price markup over market price
    // Phase 3 F3: market simulation constants extracted from src/app/api/market/tick/route.ts
    pressureFactor: number; // price-shift magnitude per pressure unit
    volatilityDecay: number; // per-tick volatility decay [0..1]
    minPrice: number; // absolute floor on any resource price
    maxPrice: number; // absolute ceiling on any resource price
    eventThreshold: number; // |changePct| >= this emits a price_move event
    spikeCap: number; // max single-tick price move fraction
    breakerCooldown: number; // ticks a circuit-breaker holds the price flat
    supplyDemandScale: number; // scaling on global supply/demand pressure
    // Phase 3 F4: deadlock safeguard
    soldOutEscapeTicks: number; // consecutive soldOut-only ticks before forced recovery
  };

  // ─── Drone System ───────────────────────────────────────────────
  drone: {
    difficultyPerFactoryPair: number; // Mission difficulty increment
    capacityUpgradeCoeff: number; // Capacity bonus per upgrade level
    fuelEfficiencyUpgradeCoeff: number; // Fuel efficiency bonus per level
    speedUpgradeCoeff: number; // Speed bonus per upgrade level
  };

  // ─── Storage Upgrades ───────────────────────────────────────────
  storage: {
    upgradeCostExponent: number; // Exponential cost multiplier for upgrades
    upgradeCapacityRatio: number; // Capacity gained per level (fraction of base)
    // Phase 3 C1: log-dampening multiplier. Effective exponent per level is
    // `upgradeCostExponent * logCostMultiplier^N`, so late levels grow slower
    // (e.g., 0.9^N cuts each level by ~10%, capping runaway cost growth).
    logCostMultiplier: number; // Dampening factor in [0.5, 1]; 1 = pure exponential (legacy)
  };

  // ─── Prestige ───────────────────────────────────────────────────
  prestige: {
    cpPerBuilding: number; // Corporation Points earned per building
  };

  // ─── Offline Progress ───────────────────────────────────────────
  offline: {
    baseRate: number; // Base offline production rate (fraction of online)
    autoTradeThresholdRatio: number; // Auto-trade threshold (fraction of capacity)
    autoSellRate: number; // Auto-sell rate per offline tick
  };

  // ─── Weather ────────────────────────────────────────────────────
  weather: {
    minIntensity: number; // Minimum weather effect intensity
    intensityRange: number; // Random range added to min intensity
  };

  // ─── Events ─────────────────────────────────────────────────────
  event: {
    randomTriggerChance: number; // Probability of random event per trigger check
  };

  // ─── Power System ───────────────────────────────────────────────
  power: {
    fuelStarvedOutputRatio: number; // Output ratio when fuel-starved
    solarAmplitudeBase: number; // Solar base output amplitude
    solarAmplitudeSwing: number; // Solar output oscillation swing
    solarOscillationFreq: number; // Solar oscillation frequency
    solarMinOutput: number; // Solar minimum output floor
    windAmplitudeBase: number; // Wind base output amplitude
    windAmplitudeSwing: number; // Wind output oscillation swing
    windOscillationFreq: number; // Wind oscillation frequency
    windMinOutput: number; // Wind minimum output floor
    minEfficiency: number; // Minimum power efficiency floor (buildings always run)
  };

  // ─── Research Effects ───────────────────────────────────────────
  research: {
    energyEfficiencyReduction: number; // Power consumption reduction from energy efficiency research
    powerOptimizationReduction: number; // Power consumption reduction from power optimization research
  };

  // ─── Trading Post ────────────────────────────────────────────────
  // Phase 3 Step 1: trade constants (formerly in tradeConstants.ts) moved here
  // so operators can tune via Supabase game_config_balance.trade.*.
  trade: {
    commissionRate: number; // Fraction of give value kept by house (0.15 = 15%)
    cooldownSeconds: number; // Per-user trade cooldown (server-enforced)
    slippageCoefficient: number; // Linear slippage scaling factor per dollar traded
    maxSlippage: number; // Hard cap on slippage fraction (0.25 = 25%)
  };
}

// ─── Default Balance Values ──────────────────────────────────────
// These match the original hardcoded values exactly.
// To tune: change values here, or override via applyBalanceOverrides().

export const DEFAULT_BALANCE: GameBalanceConfig = {
  rp: {
    passiveBase: 0.5,
    aiLabBonus: 0.5,
    extractorRate: 0.01,
    powerRate: 0.01,
    factoryT1Rate: 0.02,
    factoryT2Rate: 0.05,
    factoryT3Rate: 0.1,
    factoryT4Rate: 0.2,
    factoryT5Rate: 0.4,
    completionRefundRatio: 0.1,
  },
  worker: {
    xpPerTick: 0.01,
    efficiencyGainPerTick: 0.001,
    maxPowerReductionPerBuilding: 0.5,
  },
  building: {
    upgradeEfficiencyGain: 0.05,
  },
  transport: {
    productionBonusCoeff: 0.25,
    upgradeCostExponent: 1.3,
  },
  contract: {
    tierRewardCoeff: 0.5,
    difficultyRewardCoeff: 0.15,
    difficultyResourceCoeff: 0.15,
  },
  autoSell: {
    thresholdRatio: 0.8,
    excessSellRatio: 0.5,
    maxSellCapacityRatio: 0.1,
    // Phase 3 C3: production ramps down linearly between 80% fill and 100% fill.
    softCapRatio: 0.8,
  },
  market: {
    baseSellMultiplier: 0.9,
    buyPriceMarkup: 1.1,
    // Phase 3 F3: market simulation constants extracted from src/app/api/market/tick/route.ts
    pressureFactor: 0.0005, // price-shift magnitude per pressure unit
    volatilityDecay: 0.95, // per-tick volatility decay (0..1)
    minPrice: 1, // absolute floor on any resource price
    maxPrice: 1_000_000, // absolute ceiling on any resource price
    eventThreshold: 0.04, // |changePct| >= this emits a price_move event
    spikeCap: 0.4, // max single-tick price move fraction
    breakerCooldown: 5, // ticks a circuit-breaker holds the price flat
    supplyDemandScale: 0.1, // scaling on global supply/demand pressure
    soldOutEscapeTicks: 6, // consecutive soldOut-only ticks before forced recovery
  },
  drone: {
    difficultyPerFactoryPair: 0.5,
    capacityUpgradeCoeff: 0.25,
    fuelEfficiencyUpgradeCoeff: 0.15,
    speedUpgradeCoeff: 0.2,
  },
  storage: {
    upgradeCostExponent: 1.5,
    upgradeCapacityRatio: 0.5,
    // Phase 3 C1: 0.9^N damps pure 1.5^N exponential so late levels stay affordable.
    logCostMultiplier: 0.9,
  },
  prestige: {
    cpPerBuilding: 0.5,
  },
  offline: {
    baseRate: 0.5,
    autoTradeThresholdRatio: 0.5,
    autoSellRate: 0.1,
  },
  weather: {
    minIntensity: 0.3,
    intensityRange: 0.7,
  },
  event: {
    randomTriggerChance: 0.6,
  },
  power: {
    fuelStarvedOutputRatio: 0.1,
    solarAmplitudeBase: 0.5,
    solarAmplitudeSwing: 0.5,
    solarOscillationFreq: 0.01,
    solarMinOutput: 0.2,
    windAmplitudeBase: 0.5,
    windAmplitudeSwing: 0.5,
    windOscillationFreq: 0.007,
    windMinOutput: 0.3,
    minEfficiency: 0.1,
  },
  research: {
    energyEfficiencyReduction: 0.15,
    powerOptimizationReduction: 0.1,
  },
  // Phase 3 Step 1: matches the prior tradeConstants.ts hardcoded values exactly.
  trade: {
    commissionRate: 0.15, // 15% commission (was TRADE_COMMISSION_RATE)
    cooldownSeconds: 300, // 5-minute cooldown (was TRADE_COOLDOWN_SECONDS)
    slippageCoefficient: 0.001, // (was SLIPPAGE_COEFFICIENT)
    maxSlippage: 0.25, // 25% hard cap (was MAX_SLIPPAGE)
  },
};

// ─── Validators (Phase 2) ────────────────────────────────────────────
// Each field has a min/max range. Validators reject values outside [min, max]
// or non-finite numbers (NaN / Infinity). Used by the server-side configLoader
// to refuse bad DB values before they corrupt the live in-process balance.

export type Validator = (
  v: unknown,
) => { ok: true } | { ok: false; reason: string };

/** Numeric validator: must be a finite number in [min, max]. */
export function vrange(min: number, max: number): Validator {
  return (v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return {
        ok: false,
        reason: `not a finite number (got ${typeof v}: ${String(v)})`,
      };
    }
    if (v < min || v > max) {
      return { ok: false, reason: `out of range [${min}, ${max}] (got ${v})` };
    }
    return { ok: true };
  };
}

/** Map of top-level balance key → field name → validator. Used by
 *  validateBalanceOverrides() to check each supplied value.
 *
 *  Ranges chosen to be wide enough for any reasonable tuning but tight
 *  enough to catch typos (e.g., 100x off). Bounds documented per field.
 */
export const BALANCE_VALIDATORS: Record<string, Record<string, Validator>> = {
  rp: {
    passiveBase: vrange(0, 100), // per-tick RP; max covers extreme late-game
    aiLabBonus: vrange(0, 100),
    extractorRate: vrange(0, 10), // per-tick per extractor
    powerRate: vrange(0, 10),
    factoryT1Rate: vrange(0, 10),
    factoryT2Rate: vrange(0, 10),
    factoryT3Rate: vrange(0, 10),
    factoryT4Rate: vrange(0, 10),
    factoryT5Rate: vrange(0, 10),
    completionRefundRatio: vrange(0, 1), // fraction [0, 1]
  },
  worker: {
    xpPerTick: vrange(0, 1),
    efficiencyGainPerTick: vrange(0, 0.1),
    maxPowerReductionPerBuilding: vrange(0, 1), // fraction [0, 1]
  },
  building: {
    upgradeEfficiencyGain: vrange(0, 1), // fraction [0, 1]
  },
  transport: {
    productionBonusCoeff: vrange(0, 1),
    upgradeCostExponent: vrange(1, 3), // >1 means escalating cost
  },
  contract: {
    tierRewardCoeff: vrange(0, 5),
    difficultyRewardCoeff: vrange(0, 1),
    difficultyResourceCoeff: vrange(0, 1),
  },
  autoSell: {
    thresholdRatio: vrange(0, 1), // fraction [0, 1]
    excessSellRatio: vrange(0, 1),
    maxSellCapacityRatio: vrange(0, 1),
    softCapRatio: vrange(0.5, 1), // Phase 3 C3 — soft-cap threshold for production ramp-down
  },
  market: {
    baseSellMultiplier: vrange(0, 5), // >1 = no fee; can be boosted
    buyPriceMarkup: vrange(1, 5), // >=1 (otherwise arbitrage)
    pressureFactor: vrange(0, 0.01), // tiny upper bound (sub-1% per tick is plenty)
    volatilityDecay: vrange(0, 1), // decay ∈ [0, 1]
    minPrice: vrange(1, 1_000_000), // at least 1; cap at 1e6 for sanity
    maxPrice: vrange(1, 1e9), // upper ceiling for maxPrice
    eventThreshold: vrange(0, 1), // fraction
    spikeCap: vrange(0.01, 1), // fraction (>= 1% floor)
    breakerCooldown: vrange(0, 60), // ticks
    supplyDemandScale: vrange(0, 10), // weight on global pressure
    soldOutEscapeTicks: vrange(1, 100), // ticks before forced recovery
  },
  drone: {
    difficultyPerFactoryPair: vrange(0, 10),
    capacityUpgradeCoeff: vrange(0, 1),
    fuelEfficiencyUpgradeCoeff: vrange(0, 1),
    speedUpgradeCoeff: vrange(0, 1),
  },
  storage: {
    upgradeCostExponent: vrange(1, 5),
    upgradeCapacityRatio: vrange(0.01, 5),
    logCostMultiplier: vrange(0.5, 1), // 1 = pure exponential (legacy); 0.5 = heavy dampening
  },
  prestige: {
    cpPerBuilding: vrange(0, 10),
  },
  offline: {
    baseRate: vrange(0, 1), // fraction [0, 1]
    autoTradeThresholdRatio: vrange(0, 1),
    autoSellRate: vrange(0, 1),
  },
  weather: {
    minIntensity: vrange(0, 1),
    intensityRange: vrange(0, 1),
  },
  event: {
    randomTriggerChance: vrange(0, 1), // probability [0, 1]
  },
  power: {
    fuelStarvedOutputRatio: vrange(0, 1),
    solarAmplitudeBase: vrange(0, 5),
    solarAmplitudeSwing: vrange(0, 5),
    solarOscillationFreq: vrange(0, 1),
    solarMinOutput: vrange(0, 1),
    windAmplitudeBase: vrange(0, 5),
    windAmplitudeSwing: vrange(0, 5),
    windOscillationFreq: vrange(0, 1),
    windMinOutput: vrange(0, 1),
    minEfficiency: vrange(0.01, 1), // small floor; never zero (buildings always run)
  },
  research: {
    energyEfficiencyReduction: vrange(0, 1),
    powerOptimizationReduction: vrange(0, 1),
  },
  // Phase 3 Step 1: trade constraints. Tunable in [0, 1] for fractions,
  // [0, 1h] for cooldown, [0, 0.1] for slippage coefficient (small magnitude).
  trade: {
    commissionRate: vrange(0, 0.5), // ≤ 50% commission
    cooldownSeconds: vrange(0, 3600), // ≤ 1 hour cooldown
    slippageCoefficient: vrange(0, 0.1), // tiny upper bound
    maxSlippage: vrange(0, 1), // fraction
  },
};

/** Validate a single (top-level key, value) override payload.
 *  Returns the list of rejection reasons (empty = all valid).
 *  Unknown top-level keys are rejected. Unknown field names within a known
 *  top-level key are rejected.
 */
export function validateBalanceOverrides(overrides: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  for (const [topKey, subtree] of Object.entries(overrides)) {
    const fieldValidators = BALANCE_VALIDATORS[topKey];
    if (!fieldValidators) {
      errors.push(`unknown top-level key "${topKey}"`);
      continue;
    }
    if (
      typeof subtree !== "object" ||
      subtree === null ||
      Array.isArray(subtree)
    ) {
      errors.push(`"${topKey}" must be an object (got ${typeof subtree})`);
      continue;
    }
    for (const [field, value] of Object.entries(
      subtree as Record<string, unknown>,
    )) {
      const validator = fieldValidators[field];
      if (!validator) {
        errors.push(`unknown field "${topKey}.${field}"`);
        continue;
      }
      const result = validator(value);
      if (!result.ok) {
        errors.push(`"${topKey}.${field}": ${result.reason}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Validate the in-process DEFAULT_BALANCE itself. Called at module load
 *  to catch typos in source code before they ship. Throws on bad values.
 */
function assertDefaultsValid(): void {
  const result = validateBalanceOverrides(
    DEFAULT_BALANCE as unknown as Record<string, unknown>,
  );
  if (!result.valid) {
    const msg =
      "[balanceConfig] DEFAULT_BALANCE validation failed: " +
      result.errors.join("; ");
    console.error(msg);
    throw new Error(msg);
  }
}

assertDefaultsValid();

// ─── Active Balance (can be overridden at runtime) ────────────────

let activeBalance: GameBalanceConfig = { ...DEFAULT_BALANCE };

/**
 * Get the current active balance configuration.
 * All game code should use this instead of hardcoded numbers.
 */
export function getBalance(): GameBalanceConfig {
  return activeBalance;
}

/**
 * Apply partial overrides to the balance config.
 * Used for live tuning from Supabase game_config_balancing_rules.
 * Only specified fields are overridden; unspecified fields keep defaults.
 */
export function applyBalanceOverrides(
  overrides: DeepPartial<GameBalanceConfig>,
): void {
  activeBalance = deepMerge(DEFAULT_BALANCE, overrides);
}

/**
 * Reset balance to defaults (useful for testing).
 */
export function resetBalance(): void {
  activeBalance = { ...DEFAULT_BALANCE };
}

// ─── Deep Merge Utility ──────────────────────────────────────────

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function deepMerge<T extends object>(base: T, override: DeepPartial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override as Record<string, unknown>)) {
    const overrideVal = (override as Record<string, unknown>)[key];
    const baseVal = (result as Record<string, unknown>)[key];
    if (
      overrideVal !== undefined &&
      typeof overrideVal === "object" &&
      overrideVal !== null &&
      !Array.isArray(overrideVal) &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as DeepPartial<Record<string, unknown>>,
      );
    } else if (overrideVal !== undefined) {
      (result as Record<string, unknown>)[key] = overrideVal;
    }
  }
  return result as unknown as T;
}

// ─── State Validation Limits (formerly gameStateValidator.GAME_LIMITS) ──
// Single source of truth for server-side bounds. Mirror in SQL via
// migration 059_server_game_state_bounds.sql (CHECK constraints).
export const GAME_LIMITS = {
  /** Maximum money a player can have (sane upper bound) */
  MAX_MONEY: 1e12, // 1 trillion — realistic 24h max for 500 lvl-100 buildings producing best resource
  /** Maximum total buildings */
  MAX_BUILDINGS: 500,
  /** Maximum building level */
  MAX_BUILDING_LEVEL: 100,
  /** Maximum game tick per real-world second at 10x speed */
  MAX_TICK_RATE_PER_SECOND: 50,
  /** Maximum resources of any single type */
  MAX_RESOURCE_AMOUNT: 1e9, // 1 billion — realistic 24h max for any single resource type
  /** Maximum research points */
  MAX_RESEARCH_POINTS: 1e9,
  /** Maximum prestige points */
  MAX_PRESTIGE_POINTS: 1000,
  /** Allowed game speeds */
  ALLOWED_GAME_SPEEDS: [1, 2, 5, 10] as const,
  /** Maximum cheat flags before auto-lock */
  MAX_CHEAT_FLAGS: 3,
} as const;

export const VALID_RESOURCE_KEYS: ReadonlySet<string> = new Set<string>([
  // Raw + tiered (ResourceType union — keys from types.ts)
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
  // Cost-pseudo-resources (allowed in resource maps for pricing UX)
  "money",
  "researchPoints",
  "corporationPoints",
]);

export const VALID_WORKER_KEYS: ReadonlySet<string> = new Set<WorkerType>([
  "engineer",
  "mechanic",
  "transportManager",
  "aiSupervisor",
]);
