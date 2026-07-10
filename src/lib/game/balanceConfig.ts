// ============================================
// FACTORY DOMINION: Game Balance Configuration
//
// Runtime source of truth: Supabase `game_config_balance` table.
// Authoritative values are loaded by `configLoader.server.ts` and applied
// via `applyBalanceOverrides()`. NEVER embed playable numeric values in
// source — per RULES.md [ARC-002], game tuning must come from the DB.
//
// Architecture (post hardcode-removal):
//
//   ┌────────────────────────────┐
//   │ Supabase (game_config_     │
//   │  balance)                  │  ← single source of truth
//   └─────────────┬──────────────┘
//                 │ loadCompleteBalanceFromSupabase()
//                 ▼
//   ┌────────────────────────────┐
//   │ applyBalanceOverrides(     │  ← strict: requires COMPLETE
//   │  completeOverrides)        │     overrides, throws if any
//   │                            │     key/field is missing
//   └─────────────┬──────────────┘
//                 │
//                 ▼
//   ┌────────────────────────────┐
//   │ activeBalance              │  ← in-process cache
//   │ getBalance()               │     throws BalanceNotLoadedError
//   │                            │     if not yet populated
//   └─────────────┬──────────────┘
//                 │ read by routes
//                 ▼
//   ┌────────────────────────────┐
//   │ /api/game/trade            │
//   │ /api/market/tick           │
//   │ guestMigrationValidator    │
//   └────────────────────────────┘
//
// Fail-closed: if Supabase is unreachable OR returns an incomplete set,
// `activeBalance` stays null and `getBalance()` throws. Routes must call
// `await ensureConfigLoaded()` and refuse to proceed if it returns
// `ok: false`. Per RULES.md [SEC-002] / [ARC-009]: no silent fallbacks.
// ============================================

import type { WorkerType } from "./types";

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

  // ─── Worker System ────────────────────────────────────────────
  worker: {
    xpPerTick: number; // Base XP gained per tick
    efficiencyGainPerTick: number; // Efficiency gained per tick
    maxPowerReductionPerBuilding: number; // Cap on power reduction per building (0–1)
    levelUpXpBase: number; // Base XP required per worker level-up (multiplied by current level)
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
    tradeImpactNotifyCooldownMs: number; // Cooldown before notifying a player about a trade impact (added 2026-07-09)
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
    cpPerBuilding: number; // Prestige points awarded per building
  };

  // ─── Offline Catch-up / Guest Migration ─────────────────────────
  // Bounds for the offline catch-up system and guest→account migration
  // validator. Generous enough to allow legitimate power-users, tight enough
  // to catch obvious cheaters.
  offline: {
    baseRate: number; // fraction of online income granted while offline
    autoTradeThresholdRatio: number; // when storage exceeds this, auto-trade kicks in
    autoSellRate: number; // rate at which auto-sell drains excess
    startingMoney: number; // mirrors game_config_game.starting_money default
    maxIncomePerTick: number; // hard ceiling on income per tick (server-side validator)
    maxRPPerTick: number; // hard ceiling on RP earned per tick
    maxBuildingsPerTick: number; // hard ceiling on buildings constructed per tick
    generosityMultiplier: number; // margin allowed in wealth/resource/spend checks
    marketMargin: number; // multiplier on totalMoneyEarned for money-cap check
    defaultResourceCapacity: number; // fallback cap when a resource has no explicit capacity
  };

  // ─── Weather ────────────────────────────────────────────────────
  weather: {
    minIntensity: number; // minimum weather intensity
    intensityRange: number; // weather intensity amplitude
  };

  // ─── Random Events ──────────────────────────────────────────────
  event: {
    randomTriggerChance: number; // probability of triggering a random event per tick
  };

  // ─── Power Generation ───────────────────────────────────────────
  power: {
    fuelStarvedOutputRatio: number; // ratio of nominal output when fuel is exhausted
    solarAmplitudeBase: number; // base solar output amplitude
    solarAmplitudeSwing: number; // diurnal swing amplitude
    solarOscillationFreq: number; // day/night oscillation frequency
    solarMinOutput: number; // minimum solar output (e.g., night floor)
    windAmplitudeBase: number; // base wind output amplitude
    windAmplitudeSwing: number; // wind variability amplitude
    windOscillationFreq: number; // wind oscillation frequency
    windMinOutput: number; // minimum wind output floor
    minEfficiency: number; // minimum power efficiency floor
  };

  // ─── Research Effects ───────────────────────────────────────────
  research: {
    energyEfficiencyReduction: number; // per-level power reduction
    powerOptimizationReduction: number; // per-level power-output boost
  };

  // ─── Trading Post ────────────────────────────────────────────────
  // Phase 3 Step 1: trade constants (formerly in tradeConstants.ts) moved here
  // so operators can tune via Supabase game_config_balance.trade.*.
  trade: {
    commissionRate: number; // Fraction of give value kept by house (0.15 = 15%)
    cooldownSeconds: number; // Player cooldown between trades (seconds)
    slippageCoefficient: number; // Per-unit price impact coefficient
    maxSlippage: number; // Hard cap on price slippage fraction (0.25 = 25%)
  };

  // ─── Profile / Account ──────────────────────────────────────────
  profile: {
    displayNameMaxLength: number; // max chars in display name
  };

  // ─── Compute / Catch-up ─────────────────────────────────────────
  // Offline tick catch-up cap. Bounds the work per /api/game/compute call.
  compute: {
    maxTicksPerRequest: number; // hard cap on simulated ticks per request
  };

  // ─── Market History ─────────────────────────────────────────────
  marketHistory: {
    defaultHours: number; // default history window
    maxHours: number; // hard cap on history window
  };

  // ─── Aggregate Supply ───────────────────────────────────────────
  aggregateSupply: {
    pageSize: number; // page size for aggregate-supply listing
  };

  // ─── News LLM ───────────────────────────────────────────────────
  newsLlm: {
    requestTimeoutMs: number; // HTTP timeout for news-LLM calls
  };

  // ─── Blueprints ─────────────────────────────────────────────────
  // Hard caps on blueprint export/import size.
  blueprints: {
    maxBuildings: number; // max buildings per blueprint
    maxTransport: number; // max transport units per blueprint
    maxCountPerType: number; // max count per building/transport type in a blueprint
  };

  // ─── Cache TTLs (operational) ──────────────────────────────────
  // These are operational tuning — how long various in-process caches
  // live before re-fetching from DB. Operators can override via
  // game_config_balance.cache.* (added 2026-07-09).
  cache: {
    fingerprintTtlMs: number; // Browser fingerprint cache TTL
    fingerprintComputeTimeoutMs: number; // Fingerprint compute abort timeout
    jwksTtlMs: number; // Supabase JWKS public-key cache TTL
    jwksRefreshCooldownMs: number; // JWKS refresh rate-limit
    adminTtlMs: number; // admin_users role cache TTL
    initialStateTtlMs: number; // buildGuestGameState / canonical state cache TTL
    configLoaderTtlMs: number; // ensureConfigLoaded() shared promise TTL
  };

  // ─── State Validation Limits (anti-cheat / anti-bounds) ────────
  // Hard ceilings used by gameStateValidator and guestMigrationValidator
  // to reject impossible state. Operators can tune via
  // game_config_balance.limits.* (added 2026-07-11).
  // Mirror in SQL via migration 059_server_game_state_bounds.sql
  // (CHECK constraints).
  limits: {
    maxMoney: number; // ceiling on money
    maxBuildings: number; // ceiling on total buildings owned
    maxBuildingLevel: number; // ceiling on per-building level
    maxTickRatePerSecond: number; // ceiling on tick-delta/real-second
    maxResourceAmount: number; // ceiling on any single resource
    maxResearchPoints: number; // ceiling on research points
    maxPrestigePoints: number; // ceiling on prestige points
    allowedGameSpeeds: readonly number[]; // set of valid game-speed values
    maxCheatFlags: number; // ceiling on cheat flags before auto-lock
  };
}

// ─── Validators (Phase 2) ────────────────────────────────────────────────
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

/** Array-of-finite-numbers validator: must be an array of finite numbers
 *  in [min, max], with optional [minLen, maxLen] length constraint.
 *  Used for JSONB arrays like `allowedGameSpeeds`.
 */
export function vnumberArray(
  min: number,
  max: number,
  minLen: number = 1,
  maxLen: number = 100,
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
        return {
          ok: false,
          reason: `index ${i} (${e}) out of range [${min}, ${max}]`,
        };
      }
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
    maxPowerReductionPerBuilding: vrange(0, 1),
    levelUpXpBase: vrange(1, 1_000_000),
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
    tradeImpactNotifyCooldownMs: vrange(0, 600_000), // ≤ 10 min
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
    // Guest migration validator bounds. Generous to avoid false positives
    // on legitimate power-users; tight enough to catch obvious cheaters.
    startingMoney: vrange(0, 1e12),
    maxIncomePerTick: vrange(1, 1e12),
    maxRPPerTick: vrange(1, 1e6),
    maxBuildingsPerTick: vrange(1, 100),
    generosityMultiplier: vrange(1, 10), // >=1 (no benefit to <1)
    marketMargin: vrange(1, 100), // multiplier on totalMoneyEarned
    defaultResourceCapacity: vrange(1, 1e15),
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
  // Profile / account name length. Generous upper bound; display name
  // validation (charset, profanity) lives in the route handler.
  profile: {
    displayNameMaxLength: vrange(1, 200), // 1-200 chars
  },
  // Offline tick catch-up cap. Bounds the work per /api/game/compute call.
  compute: {
    maxTicksPerRequest: vrange(1, 1_000_000), // up to ~11.5 days at 1x
  },
  // Market history query bounds.
  marketHistory: {
    defaultHours: vrange(1, 168), // 1h - 1 week
    maxHours: vrange(1, 8760), // 1 year max
  },
  // Aggregate supply pagination.
  aggregateSupply: {
    pageSize: vrange(1, 10_000),
  },
  // News LLM HTTP timeout.
  newsLlm: {
    requestTimeoutMs: vrange(1000, 120_000), // 1s - 2min
  },
  // Blueprint size limits.
  blueprints: {
    maxBuildings: vrange(1, 10_000),
    maxTransport: vrange(1, 10_000),
    maxCountPerType: vrange(1, 10_000),
  },
  // Cache TTLs (operational). Generous upper bounds to allow future
  // tuning without code changes.
  cache: {
    fingerprintTtlMs: vrange(0, 7 * 24 * 60 * 60 * 1000), // ≤ 1 week
    fingerprintComputeTimeoutMs: vrange(100, 60_000), // 100ms - 1min
    jwksTtlMs: vrange(0, 24 * 60 * 60 * 1000), // ≤ 1 day
    jwksRefreshCooldownMs: vrange(0, 600_000), // ≤ 10 min
    adminTtlMs: vrange(0, 24 * 60 * 60 * 1000),
    initialStateTtlMs: vrange(0, 24 * 60 * 60 * 1000),
    configLoaderTtlMs: vrange(0, 24 * 60 * 60 * 1000),
  },
  // State validation limits (anti-cheat ceilings). Bounds chosen wide
  // enough to allow any reasonable play, tight enough to catch obvious
  // cheaters. The DB migration 059_server_game_state_bounds.sql mirrors
  // these as CHECK constraints.
  limits: {
    maxMoney: vrange(1, 1e15), // 1 quadrillion
    maxBuildings: vrange(1, 10_000),
    maxBuildingLevel: vrange(1, 1_000),
    maxTickRatePerSecond: vrange(1, 1_000),
    maxResourceAmount: vrange(1, 1e15),
    maxResearchPoints: vrange(1, 1e12),
    maxPrestigePoints: vrange(0, 1_000_000),
    allowedGameSpeeds: vnumberArray(0.1, 100, 1, 50), // positive finite numbers
    maxCheatFlags: vrange(0, 100),
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

/** Required top-level keys. The full set must be present in any
 *  complete balance (DB load or test fixture).
 */
export const REQUIRED_BALANCE_KEYS: ReadonlySet<string> = new Set(
  Object.keys(BALANCE_VALIDATORS),
);

/** Required field names per top-level key. */
function requiredFieldsFor(topKey: string): ReadonlySet<string> {
  return new Set(Object.keys(BALANCE_VALIDATORS[topKey] ?? {}));
}

/** Validate that a complete-balance candidate contains every required
 *  top-level key and every required field within each key. Returns
 *  `{ valid, errors }` — same shape as `validateBalanceOverrides()` so
 *  callers can union the two result sets.
 */
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
    const required = requiredFieldsFor(topKey);
    for (const field of required) {
      if (fields[field] === undefined) {
        errors.push(`missing required field "${topKey}.${field}"`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// ─── Active Balance (DB-only, fail-closed) ────────────────────
// Per RULES.md [SEC-002] / [ARC-009]: server-authoritative means server
// down = game down. There is NO default balance in production.
//
// `null` sentinel: indicates no DB load has happened yet. Reading balance in
// this state throws, which surfaces the bug at the call site (typically a
// missing `await ensureConfigLoaded()` in the route handler).
let activeBalance: GameBalanceConfig | null = null;
let balanceLoadedAt: number = 0;

/**
 * Thrown when `getBalance()` is called before the DB has loaded the config.
 * Per RULES.md [SEC-002]: fail-closed. If the server can't reach Supabase
 * or the DB row set is incomplete, gameplay-affecting routes must refuse
 * the request rather than fall back to code-level constants.
 */
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

/**
 * Get the current active balance configuration. Throws BalanceNotLoadedError
 * if the DB-loaded config hasn't been applied yet.
 *
 * Every gameplay-affecting route MUST call `await ensureConfigLoaded()`
 * (configLoader.server.ts) before invoking getBalance().
 */
export function getBalance(): GameBalanceConfig {
  if (activeBalance === null) {
    throw new BalanceNotLoadedError();
  }
  return activeBalance;
}

/**
 * Returns true if the balance has been loaded from DB. Useful for guard
 * conditions and tests that want to assert load order.
 */
export function isBalanceLoaded(): boolean {
  return activeBalance !== null;
}

/**
 * Returns the wall-clock time (ms since epoch) at which the active balance
 * was last loaded from DB. Returns 0 if the balance has never been loaded.
 * Useful for cache-staleness diagnostics and tests that want to assert
 * load order.
 */
export function getBalanceLoadedAt(): number {
  return balanceLoadedAt;
}

/**
 * Apply a COMPLETE balance configuration. The argument must contain every
 * required top-level key and every required field within each key. Any
 * missing key/field throws — this is the strict contract that prevents
 * silent fallback to hardcoded defaults.
 *
 * Validates the full payload against `BALANCE_VALIDATORS` and
 * `REQUIRED_BALANCE_KEYS` before applying. Throws on the first failure
 * category (completeness → range → finiteness).
 *
 * This is the ONLY way to set activeBalance outside of tests. Called by
 * `configLoader.server.ts` after a successful Supabase fetch of the full
 * `game_config_balance` row set.
 */
export function applyBalanceOverrides(complete: GameBalanceConfig): void {
  const completeness = validateCompleteBalance(complete);
  if (!completeness.valid) {
    throw new Error(
      "[balanceConfig] applyBalanceOverrides: incomplete balance: " +
        completeness.errors.join("; "),
    );
  }
  const validation = validateBalanceOverrides(
    complete as unknown as Record<string, unknown>,
  );
  if (!validation.valid) {
    throw new Error(
      "[balanceConfig] applyBalanceOverrides: invalid values: " +
        validation.errors.join("; "),
    );
  }
  activeBalance = complete;
  balanceLoadedAt = Date.now();
}

/**
 * Test-only: forcibly reset to "unloaded" state. Production code must NOT
 * call this — it exists to verify fail-closed behavior in unit tests.
 */
export function _resetBalanceForTests(): void {
  activeBalance = null;
  balanceLoadedAt = 0;
}

// ─── Game Limits (anti-cheat / anti-bounds ceilings) ───────────────────
// Backed by `game_config_balance.limits` (DB). Accessed via getGameLimits()
// so the strict load contract from balanceConfig applies. Throws
// BalanceNotLoadedError until the DB has fully loaded.
//
// The previous `export const GAME_LIMITS = { ... }` is REMOVED — values
// were hardcoded in source, violating RULES.md [ARC-002]. Mirror in SQL
// via migration 059_server_game_state_bounds.sql (CHECK constraints).

/** Read the game-limits block from the active balance.
 *  Throws BalanceNotLoadedError if the DB has not yet loaded the
 *  complete balance (i.e., before `await ensureConfigLoaded()` has
 *  succeeded at least once).
 */
export function getGameLimits(): GameBalanceConfig["limits"] {
  return getBalance().limits;
}

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
