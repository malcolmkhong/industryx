// ============================================
// tests/unit/balanceConfig.validation.test.ts - Phase 2
//
// Covers the validator layer added to balanceConfig.ts:
// - vrange() rejects out-of-range and non-finite numbers
// - validateBalanceOverrides() catches: bad top-level keys, bad field
//   names, bad values, wrong types
// - DEFAULT_BALANCE itself passes validation (asserted at module load)
// ============================================

import { describe, it, expect } from "vitest";

import {
  vrange,
  validateBalanceOverrides,
  BALANCE_VALIDATORS,
  DEFAULT_BALANCE,
} from "@/lib/game/balanceConfig";

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

describe("validateBalanceOverrides - happy path", () => {
  it("accepts the in-process DEFAULT_BALANCE (mirror invariant)", () => {
    // If DEFAULT_BALANCE changes invalidly at module load time, the
    // assertDefaultsValid() call in balanceConfig.ts throws. So just
    // importing this module proves DEFAULT_BALANCE is currently valid.
    // We additionally re-validate here to catch regressions.
    const result = validateBalanceOverrides(
      DEFAULT_BALANCE as unknown as Record<string, unknown>,
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
  it("every DEFAULT_BALANCE field has a registered validator", () => {
    for (const [topKey, subtree] of Object.entries(DEFAULT_BALANCE)) {
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
});
