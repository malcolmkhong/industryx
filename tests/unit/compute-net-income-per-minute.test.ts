/**
 * tests/unit/compute-net-income-per-minute.test.ts
 *
 * C-007 (BUILDING_PRODUCTION_AUDIT §10.4, 2026-07-16):
 *   `DashboardPanel` computed `payoutPerCycle * 6` as income/min — a
 *   literal 6 cycles/min that assumed 1x speed and a 10s payout interval.
 *   The headers used the correct formula
 *   `(effectiveSpeed / basePayoutInterval) * 60`, so at any non-default
 *   game speed or interval the two surfaces disagreed.
 *
 *   The shared `computeNetIncomePerMinute` utility is now used by all
 *   three panels. This test pins the formula so a future refactor
 *   can't silently regress either side.
 */

import { describe, it, expect } from "vitest";
import { computeNetIncomePerMinute } from "@/lib/game/state/store";

describe("C-007 — computeNetIncomePerMinute", () => {
  it("returns 0 when basePayoutInterval is 0 (defense-in-depth)", () => {
    expect(computeNetIncomePerMinute(100, 1, 0)).toBe(0);
  });

  it("returns 0 when basePayoutInterval is negative", () => {
    expect(computeNetIncomePerMinute(100, 1, -5)).toBe(0);
  });

  it("at 1x speed with 10s interval: 6 cycles/min", () => {
    // payoutPerCycle=10, effectiveSpeed=1, interval=10 → 10 * (1/10 * 60) = 60
    expect(computeNetIncomePerMinute(10, 1, 10)).toBe(60);
  });

  it("at 5x speed with 10s interval: 30 cycles/min (5x multiplier)", () => {
    // 10 * (5/10 * 60) = 300
    expect(computeNetIncomePerMinute(10, 5, 10)).toBe(300);
  });

  it("at 2x speed with 5s interval: 24 cycles/min (2x * 60/5)", () => {
    // 10 * (2/5 * 60) = 240
    expect(computeNetIncomePerMinute(10, 2, 5)).toBe(240);
  });

  it("returns 0 when payoutPerCycle is 0", () => {
    expect(computeNetIncomePerMinute(0, 5, 10)).toBe(0);
  });

  it("floors fractional results (matches header behavior)", () => {
    // 7 * (1/3 * 60) = 140.000..., no fraction here. Use a case that
    // produces a fractional result: payoutPerCycle=11, speed=1, interval=3
    // → 11 * (1/3 * 60) = 11 * 20 = 220 (exact, no floor needed).
    // Instead test: payoutPerCycle=7, speed=1, interval=4 → 7*15=105 (exact).
    // For a true fractional: 1 * (1/3 * 60) = 20 (exact). Use:
    // 1 * (1/7 * 60) = 8.571... → floor = 8
    expect(computeNetIncomePerMinute(1, 1, 7)).toBe(8);
  });

  it("matches the old Dashboard literal at 1x/10s (regression guard)", () => {
    // Before C-007: Dashboard used `payoutPerCycle * 6`. At 1x speed
    // and 10s interval this was correct. The shared formula must
    // produce the same number.
    for (const payout of [0, 1, 5, 10, 100, 1000]) {
      const oldValue = payout * 6;
      const newValue = computeNetIncomePerMinute(payout, 1, 10);
      expect(newValue, `payout=${payout} at 1x/10s`).toBe(oldValue);
    }
  });
});
