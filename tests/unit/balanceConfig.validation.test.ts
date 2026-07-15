// ============================================
// tests/unit/balanceConfig.validation.test.ts
//
// Covers the validator layer + strict-apply contract:
// - vrange() rejects out-of-range and non-finite numbers
// - validateBalanceOverrides() catches: bad top-level keys, bad field
//   names, bad values, wrong types
// - validateCompleteBalance() enforces every key/field is present
// - applyBalanceOverrides() requires COMPLETE input (fail-closed on missing)
// - getBalance() throws BalanceNotLoadedError until a complete load happens
//
// Test fixture: tests/fixtures/balanceFixture.json
//   - Mirrors the Supabase `game_config_balance` shape
//   - Mirrors the migration 072 seed (complete base), plus
//     migration 077 (payout + endgame) and 078 (storage.maxBulkUpgradeLevels)
//   - Source of truth for the test contract; if a field is renamed or
//     range changes, this fixture + the matching migration must both be
//     updated in lockstep (or the test fails).
// ============================================

import { describe, it, expect } from "vitest";

import {
  vrange,
  vnumberArray,
  validateBalanceOverrides,
  validateCompleteBalance,
  applyBalanceOverrides,
  getGameLimits,
  BALANCE_VALIDATORS,
  REQUIRED_BALANCE_KEYS,
  getBalance,
  isBalanceLoaded,
  BalanceNotLoadedError,
  _resetBalanceForTests,
  type GameBalanceConfig,
} from "@/lib/game/config/balance/balanceConfig";
import balanceFixture from "../fixtures/balanceFixture.json";

// Fixture is the same shape as GameBalanceConfig (no runtime validation
// at import — the tests below assert that contract).
const fixture = balanceFixture as unknown as GameBalanceConfig;

describe("vrange", () => {
  const positive = vrange(0, 10);

  it("accepts numbers in range", () => {
    expect(positive(0).ok).toBe(true);
    expect(positive(5).ok).toBe(true);
    expect(positive(10).ok).toBe(true);
  });

  it("rejects numbers out of range with descriptive reason", () => {
    const r1 = positive(-1);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toMatch(/out of range/);

    const r2 = positive(11);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toMatch(/out of range/);
  });

  it("rejects non-finite numbers", () => {
    expect(positive(NaN).ok).toBe(false);
    expect(positive(Infinity).ok).toBe(false);
    expect(positive(-Infinity).ok).toBe(false);
  });

  it("rejects non-number types", () => {
    expect(positive("5").ok).toBe(false);
    expect(positive(null).ok).toBe(false);
    expect(positive(undefined).ok).toBe(false);
    expect(positive({}).ok).toBe(false);
    expect(positive([]).ok).toBe(false);
  });
});

describe("vnumberArray", () => {
  const positive = vnumberArray(0, 10);

  it("accepts an array of finite numbers in range", () => {
    expect(positive([1, 2, 5, 10]).ok).toBe(true);
    expect(positive([0]).ok).toBe(true);
    expect(positive([10]).ok).toBe(true);
  });

  it("rejects non-array input", () => {
    expect(positive("abc").ok).toBe(false);
    expect(positive({ 0: 1, 1: 2 }).ok).toBe(false);
    expect(positive(null).ok).toBe(false);
    expect(positive(undefined).ok).toBe(false);
    expect(positive(42).ok).toBe(false);
  });

  it("rejects empty array when minLen > 0 (default)", () => {
    expect(positive([]).ok).toBe(false);
  });

  it("rejects array with out-of-range element", () => {
    const r = positive([1, 2, 11]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/out of range/);
  });

  it("rejects array with non-finite element", () => {
    expect(positive([1, NaN, 3]).ok).toBe(false);
    expect(positive([1, Infinity, 3]).ok).toBe(false);
  });

  it("rejects array with non-number element", () => {
    expect(positive([1, "2" as unknown as number, 3]).ok).toBe(false);
  });

  it("respects custom length bounds", () => {
    const tight = vnumberArray(0, 100, 2, 3);
    expect(tight([1, 2]).ok).toBe(true);
    expect(tight([1, 2, 3]).ok).toBe(true);
    expect(tight([1]).ok).toBe(false);
    expect(tight([1, 2, 3, 4]).ok).toBe(false);
  });
});

describe("validateBalanceOverrides - happy path", () => {
  it("accepts the test fixture (mirror of migration 068 seed)", () => {
    // The fixture mirrors what the DB should contain after migration 068
    // is applied. If the fixture is invalid, the DB seed is invalid too.
    const result = validateBalanceOverrides(
      fixture as unknown as Record<string, unknown>,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a single-row override within range", () => {
    const result = validateBalanceOverrides({
      rp: { passiveBase: 1.5 },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a partial override (only one field of many)", () => {
    const result = validateBalanceOverrides({
      power: { minEfficiency: 0.25 },
    });
    expect(result.valid).toBe(true);
  });
});

describe("validateBalanceOverrides - rejection cases", () => {
  it("rejects unknown top-level key", () => {
    const result = validateBalanceOverrides({
      notARealKey: { something: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("notARealKey"))).toBe(true);
  });

  it("rejects unknown field within known top-level key", () => {
    const result = validateBalanceOverrides({
      rp: { madeUpField: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("madeUpField"))).toBe(true);
  });

  it("rejects value out of range", () => {
    const result = validateBalanceOverrides({
      rp: { passiveBase: 999 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("passiveBase"))).toBe(true);
  });

  it("rejects negative value where min is 0", () => {
    const result = validateBalanceOverrides({
      autoSell: { thresholdRatio: -0.1 },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects NaN value", () => {
    const result = validateBalanceOverrides({
      rp: { passiveBase: NaN },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects string value where number expected", () => {
    const result = validateBalanceOverrides({
      rp: { passiveBase: "0.5" as unknown as number },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects non-object subtree", () => {
    const result = validateBalanceOverrides({
      rp: "not an object" as unknown as Record<string, unknown>,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects array as subtree", () => {
    const result = validateBalanceOverrides({
      rp: [1, 2, 3] as unknown as Record<string, unknown>,
    });
    expect(result.valid).toBe(false);
  });

  it("collects multiple errors in one pass (does not stop at first)", () => {
    const result = validateBalanceOverrides({
      unknown1: { x: 1 },
      rp: {
        passiveBase: 999,
        madeUpField: 5,
      },
      power: {
        minEfficiency: -1,
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe("BALANCE_VALIDATORS - coverage", () => {
  it("every fixture field has a registered validator", () => {
    for (const [topKey, subtree] of Object.entries(fixture)) {
      const fieldValidators = BALANCE_VALIDATORS[topKey];
      expect(fieldValidators, `missing validator map for "${topKey}"`).toBeDefined();
      for (const field of Object.keys(subtree)) {
        expect(
          fieldValidators[field],
          `missing validator for "${topKey}.${field}"`,
        ).toBeDefined();
      }
    }
  });

  it("every required top-level key has a fixture entry", () => {
    // Catch drift: if a new top-level key is added to REQUIRED_BALANCE_KEYS
    // (e.g., a new section in GameBalanceConfig) but the fixture hasn't been
    // updated, this test fails before any runtime code can break.
    for (const key of REQUIRED_BALANCE_KEYS) {
      expect(fixture, `missing fixture entry for "${key}"`).toHaveProperty(key);
    }
  });
});

describe("validateCompleteBalance - completeness contract", () => {
  it("accepts the test fixture", () => {
    const result = validateCompleteBalance(fixture);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects empty object", () => {
    const result = validateCompleteBalance({});
    expect(result.valid).toBe(false);
    // Many missing-key errors expected.
    expect(result.errors.length).toBeGreaterThanOrEqual(REQUIRED_BALANCE_KEYS.size);
  });

  it("rejects balance with a missing top-level key", () => {
    const partial: Record<string, unknown> = { ...fixture };
    delete partial.trade;
    const result = validateCompleteBalance(partial);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"trade"'))).toBe(true);
  });

  it("rejects balance with a missing field within a known key", () => {
    const partial = {
      ...fixture,
      rp: { ...fixture.rp, passiveBase: undefined },
    } as unknown;
    const result = validateCompleteBalance(partial);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("rp.passiveBase"))).toBe(true);
  });

  it("rejects non-object input", () => {
    expect(validateCompleteBalance(null).valid).toBe(false);
    expect(validateCompleteBalance("string").valid).toBe(false);
    expect(validateCompleteBalance([]).valid).toBe(false);
  });
});

describe("applyBalanceOverrides - strict contract", () => {
  it("rejects empty overrides (no silent fallback)", () => {
    _resetBalanceForTests();
    // Cast through unknown — production code shouldn't be able to call
    // this with an empty object, but the type system enforces it now too.
    expect(() =>
      applyBalanceOverrides({} as unknown as GameBalanceConfig),
    ).toThrow(/incomplete balance/);
    expect(isBalanceLoaded()).toBe(false);
  });

  it("rejects partial overrides missing required fields", () => {
    _resetBalanceForTests();
    const partial: GameBalanceConfig = {
      ...fixture,
      rp: { ...fixture.rp, factoryT5Rate: undefined as unknown as number },
    };
    expect(() => applyBalanceOverrides(partial)).toThrow(/incomplete balance/);
    expect(isBalanceLoaded()).toBe(false);
  });

  it("rejects out-of-range values in an otherwise-complete payload", () => {
    _resetBalanceForTests();
    const invalid: GameBalanceConfig = {
      ...fixture,
      rp: { ...fixture.rp, passiveBase: 999 },
    };
    expect(() => applyBalanceOverrides(invalid)).toThrow(/invalid values/);
    expect(isBalanceLoaded()).toBe(false);
  });

  it("accepts a complete, valid balance", () => {
    _resetBalanceForTests();
    expect(() => applyBalanceOverrides(fixture)).not.toThrow();
    expect(isBalanceLoaded()).toBe(true);
    expect(getBalance().offline.startingMoney).toBe(1000);
  });
});

// ============================================
// Fail-closed behavior tests (RULES.md [SEC-002])
// Verifies that getBalance() throws BalanceNotLoadedError until a
// COMPLETE DB load has happened (via applyBalanceOverrides with full
// payload). Without these tests, a regression could silently re-introduce
// code-level defaults.
// ============================================

describe("getBalance() fail-closed behavior", () => {
  it("isBalanceLoaded() returns false before any load", () => {
    _resetBalanceForTests();
    expect(isBalanceLoaded()).toBe(false);
  });

  it("getBalance() throws BalanceNotLoadedError before any load", () => {
    _resetBalanceForTests();
    expect(() => getBalance()).toThrow(BalanceNotLoadedError);
    // Per RULES.md [SEC-002]: must fail closed, not return stale defaults.
    expect(() => getBalance()).toThrow(/no defaults/i);
  });

  it("getBalance() works after applyBalanceOverrides(fixture)", () => {
    _resetBalanceForTests();
    applyBalanceOverrides(fixture);
    expect(isBalanceLoaded()).toBe(true);
    expect(() => getBalance()).not.toThrow();
    const cfg = getBalance();
    // Spot-check a few fields from the fixture so test data drift is loud.
    expect(cfg.trade.commissionRate).toBe(0.15);
    expect(cfg.market.minPrice).toBe(1);
    expect(cfg.offline.startingMoney).toBe(1000);
  });
});

describe("getGameLimits() - DB-backed anti-cheat ceilings", () => {
  it("throws BalanceNotLoadedError before any load", () => {
    _resetBalanceForTests();
    expect(() => getGameLimits()).toThrow(BalanceNotLoadedError);
  });

  it("returns the DB-loaded limits after applyBalanceOverrides(fixture)", () => {
    _resetBalanceForTests();
    applyBalanceOverrides(fixture);
    const limits = getGameLimits();
    // Spot-check the former GAME_LIMITS values, now sourced from DB.
    expect(limits.maxMoney).toBe(1e12);
    expect(limits.maxBuildings).toBe(500);
    expect(limits.maxBuildingLevel).toBe(100);
    expect(limits.maxTickRatePerSecond).toBe(50);
    expect(limits.maxResourceAmount).toBe(1e9);
    expect(limits.maxResearchPoints).toBe(1e9);
    expect(limits.maxPrestigePoints).toBe(1000);
    expect(limits.maxCheatFlags).toBe(3);
    expect(limits.allowedGameSpeeds).toEqual([1, 2, 5, 10]);
  });

  it("rejects an out-of-range limit value at apply time", () => {
    _resetBalanceForTests();
    const bad: GameBalanceConfig = {
      ...fixture,
      limits: { ...fixture.limits, maxMoney: 1e20 },
    };
    expect(() => applyBalanceOverrides(bad)).toThrow(/invalid values/);
    expect(isBalanceLoaded()).toBe(false);
  });

  it("rejects missing allowedGameSpeeds at apply time", () => {
    _resetBalanceForTests();
    const bad: GameBalanceConfig = {
      ...fixture,
      limits: {
        ...fixture.limits,
        allowedGameSpeeds: [1, 2, 5] as unknown as readonly number[],
      },
    };
    // Present but with wrong length would be a value error, not a missing
    // field. To test missing-field behavior, swap the array for undefined
    // via a Partial cast:
    const missing = bad as unknown as GameBalanceConfig;
    (missing.limits as Record<string, unknown>).allowedGameSpeeds = undefined;
    expect(() => applyBalanceOverrides(missing)).toThrow(/incomplete balance/);
  });

  it("rejects allowedGameSpeeds that is not an array", () => {
    _resetBalanceForTests();
    const bad: GameBalanceConfig = {
      ...fixture,
      limits: {
        ...fixture.limits,
        allowedGameSpeeds: "1,2,5,10" as unknown as readonly number[],
      },
    };
    expect(() => applyBalanceOverrides(bad)).toThrow(/invalid values/);
  });
});
