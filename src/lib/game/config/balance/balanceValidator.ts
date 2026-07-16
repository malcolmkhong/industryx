// ============================================
// FACTORY DOMINION: BALANCE VALIDATOR
// Split from balanceConfig.ts — validation logic only.
// ============================================

import type { ClientPowerBalance, Validator } from './balanceTypes';

const CLIENT_POWER_BALANCE_FIELDS = [
  "fuelStarvedOutputRatio",
  "solarAmplitudeBase",
  "solarAmplitudeSwing",
  "solarOscillationFreq",
  "solarMinOutput",
  "windAmplitudeBase",
  "windAmplitudeSwing",
  "windOscillationFreq",
  "windMinOutput",
] as const satisfies readonly (keyof ClientPowerBalance)[];

/**
 * Confirms that the client received the complete display-only power subset.
 * Missing or invalid values are withheld rather than replaced with defaults.
 */
export function isClientPowerBalance(
  value: unknown,
): value is ClientPowerBalance {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return CLIENT_POWER_BALANCE_FIELDS.every(
    (field) => BALANCE_VALIDATORS.power[field](Reflect.get(value, field)).ok,
  );
}

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

/**
 * Leaf validator for per-type endgame income: a plain object with three
 * finite, non-negative numeric rates. Used by `endgame` keys in
 * `BALANCE_VALIDATORS` (V-012 / PR-BP-3).
 */
export function rateLeaf(max = 1_000_000): Validator {
  return (v: unknown) => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      return { ok: false, reason: "must be an object with three numeric rates" };
    }
    const obj = v as Record<string, unknown>;
    for (const field of ["moneyPerTick", "researchPerTick", "corpPerTick"]) {
      const result = vrange(0, max)(obj[field]);
      if (!result.ok) {
        return { ok: false, reason: `${field}: ${result.reason}` };
      }
    }
    return { ok: true };
  };
}

export function vnumberArray(
  min: number,
  max: number,
  minLen = 1,
  maxLen = 100,
): Validator {
  return (v: unknown) => {
    if (!Array.isArray(v)) {
      return { ok: false, reason: `expected array, got ${typeof v}` };
    }
    if (v.length < minLen || v.length > maxLen) {
      return {
        ok: false,
        reason: `array length ${v.length} not in [${minLen}, ${maxLen}]`,
      };
    }
    for (let i = 0; i < v.length; i++) {
      const e = v[i];
      if (typeof e !== "number" || !Number.isFinite(e)) {
        return {
          ok: false,
          reason: `index ${i} is not a finite number (got ${typeof e}: ${String(e)})`,
        };
      }
      if (e < min || e > max) {
        return { ok: false, reason: `index ${i} (${e}) out of range [${min}, ${max}]` };
      }
    }
    return { ok: true };
  };
}

export const BALANCE_VALIDATORS: Record<string, Record<string, Validator>> = {
  rp: {
    passiveBase: vrange(0, 100),
    aiLabBonus: vrange(0, 100),
    extractorRate: vrange(0, 10),
    powerRate: vrange(0, 10),
    factoryT1Rate: vrange(0, 10),
    factoryT2Rate: vrange(0, 10),
    factoryT3Rate: vrange(0, 10),
    factoryT4Rate: vrange(0, 10),
    factoryT5Rate: vrange(0, 10),
    completionRefundRatio: vrange(0, 1),
  },
  worker: {
    xpPerTick: vrange(0, 1),
    efficiencyGainPerTick: vrange(0, 0.1),
    maxPowerReductionPerBuilding: vrange(0, 1),
    levelUpXpBase: vrange(1, 1_000_000),
  },
  building: {
    upgradeEfficiencyGain: vrange(0, 1),
  },
  transport: {
    productionBonusCoeff: vrange(0, 1),
    upgradeCostExponent: vrange(1, 3),
  },
  contract: {
    tierRewardCoeff: vrange(0, 5),
    difficultyRewardCoeff: vrange(0, 1),
    difficultyResourceCoeff: vrange(0, 1),
  },
  autoSell: {
    thresholdRatio: vrange(0, 1),
    excessSellRatio: vrange(0, 1),
    maxSellCapacityRatio: vrange(0, 1),
    softCapRatio: vrange(0.5, 1),
  },
  market: {
    baseSellMultiplier: vrange(0, 5),
    buyPriceMarkup: vrange(1, 5),
    pressureFactor: vrange(0, 0.01),
    volatilityDecay: vrange(0, 1),
    minPrice: vrange(1, 1_000_000),
    maxPrice: vrange(1, 1e9),
    eventThreshold: vrange(0, 1),
    spikeCap: vrange(0.01, 1),
    breakerCooldown: vrange(0, 60),
    supplyDemandScale: vrange(0, 10),
    soldOutEscapeTicks: vrange(1, 100),
    tradeImpactNotifyCooldownMs: vrange(0, 600_000),
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
    logCostMultiplier: vrange(0.5, 1),
    // V-030: was hardcoded `MAX_STORAGE_UPGRADE = 100` in
    // `validators/storage.ts`. Range 1..1000 lets server tune
    // bulk upgrade ceilings via a balance row, fail-closed.
    maxBulkUpgradeLevels: vrange(1, 1000),
  },
  prestige: {
    cpPerBuilding: vrange(0, 10),
  },
  // V-011 (PR-BP-3): payout scalar rates.
  payout: {
    extractorRate: vrange(0, 1_000_000),
    factoryRate: vrange(0, 1_000_000),
    powerRate: vrange(0, 1_000_000),
  },
  // V-012 (PR-BP-3): per-type endgame income. Each leaf carries three
  // scalar rates. Adding a new endgame type requires a row update in
  // the validator map and `balanceTypes.ts` — no change to endgame.ts.
  endgame: {
    dysonCollector: rateLeaf(),
    quantumTeleporter: rateLeaf(),
    dimensionalGateway: rateLeaf(),
    timeDistorter: rateLeaf(),
    galacticForge: rateLeaf(),
    omniscienceArray: rateLeaf(),
    worldEngine: rateLeaf(),
    planetaryShield: rateLeaf(),
    starReactor: rateLeaf(),
    voidEngine: rateLeaf(),
    quantumExchange: rateLeaf(),
    megaCorpHQ: rateLeaf(),
    dimensionalNexus: rateLeaf(),
    galacticArmada: rateLeaf(),
  },
  offline: {
    baseRate: vrange(0, 1),
    autoTradeThresholdRatio: vrange(0, 1),
    autoSellRate: vrange(0, 1),
    startingMoney: vrange(0, 1e12),
    maxIncomePerTick: vrange(1, 1e12),
    maxRPPerTick: vrange(1, 1e6),
    maxBuildingsPerTick: vrange(1, 100),
    generosityMultiplier: vrange(1, 10),
    marketMargin: vrange(1, 100),
    defaultResourceCapacity: vrange(1, 1e15),
  },
  weather: {
    minIntensity: vrange(0, 1),
    intensityRange: vrange(0, 1),
  },
  event: {
    randomTriggerChance: vrange(0, 1),
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
    minEfficiency: vrange(0.01, 1),
  },
  research: {
    energyEfficiencyReduction: vrange(0, 1),
    powerOptimizationReduction: vrange(0, 1),
  },
  trade: {
    commissionRate: vrange(0, 0.5),
    cooldownSeconds: vrange(0, 3600),
    slippageCoefficient: vrange(0, 0.1),
    maxSlippage: vrange(0, 1),
  },
  profile: {
    displayNameMaxLength: vrange(1, 200),
  },
  compute: {
    maxTicksPerRequest: vrange(1, 1_000_000),
  },
  marketHistory: {
    defaultHours: vrange(1, 168),
    maxHours: vrange(1, 8760),
  },
  aggregateSupply: {
    pageSize: vrange(1, 10_000),
  },
  newsLlm: {
    requestTimeoutMs: vrange(1000, 120_000),
  },
  blueprints: {
    maxBuildings: vrange(1, 10_000),
    maxTransport: vrange(1, 10_000),
    maxCountPerType: vrange(1, 10_000),
  },
  cache: {
    fingerprintTtlMs: vrange(0, 7 * 24 * 60 * 60 * 1000),
    fingerprintComputeTimeoutMs: vrange(100, 60_000),
    jwksTtlMs: vrange(0, 24 * 60 * 60 * 1000),
    jwksRefreshCooldownMs: vrange(0, 600_000),
    adminTtlMs: vrange(0, 24 * 60 * 60 * 1000),
    initialStateTtlMs: vrange(0, 24 * 60 * 60 * 1000),
    configLoaderTtlMs: vrange(0, 24 * 60 * 60 * 1000),
  },
  limits: {
    maxMoney: vrange(1, 1e15),
    maxBuildings: vrange(1, 10_000),
    maxBuildingLevel: vrange(1, 1_000),
    maxTickRatePerSecond: vrange(1, 1_000),
    maxResourceAmount: vrange(1, 1e15),
    maxResearchPoints: vrange(1, 1e12),
    maxPrestigePoints: vrange(0, 1_000_000),
    allowedGameSpeeds: vnumberArray(0.1, 100, 1, 50),
    maxCheatFlags: vrange(0, 100),
  },
};

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
    if (typeof subtree !== "object" || subtree === null || Array.isArray(subtree)) {
      errors.push(`"${topKey}" must be an object (got ${typeof subtree})`);
      continue;
    }
    for (const [field, value] of Object.entries(subtree as Record<string, unknown>)) {
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

export const REQUIRED_BALANCE_KEYS: ReadonlySet<string> = new Set(
  Object.keys(BALANCE_VALIDATORS),
);

export function validateCompleteBalance(complete: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (typeof complete !== "object" || complete === null || Array.isArray(complete)) {
    return { valid: false, errors: ["balance must be an object"] };
  }
  const obj = complete as Record<string, unknown>;
  for (const topKey of REQUIRED_BALANCE_KEYS) {
    const subtree = obj[topKey];
    if (subtree === undefined) {
      errors.push(`missing required top-level key "${topKey}"`);
      continue;
    }
    if (typeof subtree !== "object" || subtree === null || Array.isArray(subtree)) {
      errors.push(`"${topKey}" must be an object (got ${typeof subtree})`);
      continue;
    }
    const fields = subtree as Record<string, unknown>;
    const required = new Set(Object.keys(BALANCE_VALIDATORS[topKey] ?? {}));
    for (const field of required) {
      if (fields[field] === undefined) {
        errors.push(`missing required field "${topKey}.${field}"`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
