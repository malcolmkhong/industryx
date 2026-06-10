// ============================================
// FACTORY DOMINION: Game Balance Configuration
// All tunable game-balance numeric values extracted
// from hardcoded magic numbers into a single config.
//
// Future: can be overridden from game_config_balancing_rules
// table in Supabase for live tuning without code deploys.
// ============================================

export interface GameBalanceConfig {
  // ─── Research Points ────────────────────────────────────────────
  rp: {
    passiveBase: number;          // Base passive RP per tick
    aiLabBonus: number;           // Additional RP per AI Lab per tick
    extractorRate: number;        // RP per extractor per tick
    powerRate: number;            // RP per power plant per tick
    factoryT1Rate: number;        // RP per T1 factory per tick
    factoryT2Rate: number;        // RP per T2 factory per tick
    factoryT3Rate: number;        // RP per T3 factory per tick
    factoryT4Rate: number;        // RP per T4 factory per tick
    completionRefundRatio: number; // Fraction of RP cost refunded on completion
  };

  // ─── Worker System ──────────────────────────────────────────────
  worker: {
    xpPerTick: number;            // Base XP gained per tick
    efficiencyGainPerTick: number; // Efficiency gained per tick
    maxPowerReductionPerBuilding: number; // Cap on power reduction per building (0–1)
  };

  // ─── Building Upgrades ──────────────────────────────────────────
  building: {
    upgradeEfficiencyGain: number; // Efficiency % gained per upgrade level
  };

  // ─── Transport ──────────────────────────────────────────────────
  transport: {
    productionBonusCoeff: number;  // Coefficient for transport production bonus
    upgradeCostExponent: number;   // Exponential cost multiplier for upgrades
  };

  // ─── Contract System ────────────────────────────────────────────
  contract: {
    tierRewardCoeff: number;       // Reward scaling per contract tier
    difficultyRewardCoeff: number;  // Reward scaling per difficulty level
    difficultyResourceCoeff: number; // Resource amount scaling per difficulty level
  };

  // ─── Auto-Sell ──────────────────────────────────────────────────
  autoSell: {
    thresholdRatio: number;        // Start selling when storage reaches this % of capacity
    excessSellRatio: number;       // Fraction of excess sold per tick
    maxSellCapacityRatio: number;  // Max sell amount as fraction of capacity
  };

  // ─── Market ─────────────────────────────────────────────────────
  market: {
    baseSellMultiplier: number;    // Base sell price multiplier (1 = no fee)
    buyPriceMarkup: number;        // Buy price markup over market price
  };

  // ─── Drone System ───────────────────────────────────────────────
  drone: {
    difficultyPerFactoryPair: number; // Mission difficulty increment
    capacityUpgradeCoeff: number;     // Capacity bonus per upgrade level
    fuelEfficiencyUpgradeCoeff: number; // Fuel efficiency bonus per level
    speedUpgradeCoeff: number;        // Speed bonus per upgrade level
  };

  // ─── Storage Upgrades ───────────────────────────────────────────
  storage: {
    upgradeCostExponent: number;    // Exponential cost multiplier for upgrades
    upgradeCapacityRatio: number;   // Capacity gained per level (fraction of base)
  };

  // ─── Prestige ───────────────────────────────────────────────────
  prestige: {
    cpPerBuilding: number;          // Corporation Points earned per building
  };

  // ─── Offline Progress ───────────────────────────────────────────
  offline: {
    baseRate: number;               // Base offline production rate (fraction of online)
    autoTradeThresholdRatio: number; // Auto-trade threshold (fraction of capacity)
    autoSellRate: number;           // Auto-sell rate per offline tick
  };

  // ─── Weather ────────────────────────────────────────────────────
  weather: {
    minIntensity: number;           // Minimum weather effect intensity
    intensityRange: number;         // Random range added to min intensity
  };

  // ─── Events ─────────────────────────────────────────────────────
  event: {
    randomTriggerChance: number;    // Probability of random event per trigger check
  };

  // ─── Power System ───────────────────────────────────────────────
  power: {
    fuelStarvedOutputRatio: number; // Output ratio when fuel-starved
    solarAmplitudeBase: number;     // Solar base output amplitude
    solarAmplitudeSwing: number;    // Solar output oscillation swing
    solarOscillationFreq: number;   // Solar oscillation frequency
    solarMinOutput: number;         // Solar minimum output floor
    windAmplitudeBase: number;      // Wind base output amplitude
    windAmplitudeSwing: number;     // Wind output oscillation swing
    windOscillationFreq: number;    // Wind oscillation frequency
    windMinOutput: number;          // Wind minimum output floor
    minEfficiency: number;          // Minimum power efficiency floor (buildings always run)
  };

  // ─── Research Effects ───────────────────────────────────────────
  research: {
    energyEfficiencyReduction: number;  // Power consumption reduction from energy efficiency research
    powerOptimizationReduction: number; // Power consumption reduction from power optimization research
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
    factoryT3Rate: 0.10,
    factoryT4Rate: 0.20,
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
  },
  market: {
    baseSellMultiplier: 0.9,
    buyPriceMarkup: 1.1,
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
    minEfficiency: 0.10,
  },
  research: {
    energyEfficiencyReduction: 0.15,
    powerOptimizationReduction: 0.10,
  },
};

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
export function applyBalanceOverrides(overrides: DeepPartial<GameBalanceConfig>): void {
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

function deepMerge<T extends Record<string, unknown>>(base: T, override: DeepPartial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const overrideVal = override[key];
    const baseVal = base[key];
    if (
      overrideVal !== undefined &&
      typeof overrideVal === 'object' &&
      overrideVal !== null &&
      !Array.isArray(overrideVal) &&
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as DeepPartial<Record<string, unknown>>
      ) as T[keyof T];
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}
