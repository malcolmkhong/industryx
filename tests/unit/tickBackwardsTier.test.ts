// ============================================
// tests/unit/tickBackwardsTier.test.ts
//
// Regression test for the tick-backwards tier (Phase 4 refactor):
// Small drift < 100 ticks → 'low' (legitimate stale-save retry)
// Large drift >= 100 ticks → 'critical' (genuine rollback attack)
//
// Before the fix, every tick-backwards was 'critical' regardless of magnitude,
// causing infinite stale-cache save loops to auto-lock legitimate players.
// ============================================

import { describe, it, expect, vi } from "vitest";

// Mock configLoader BEFORE importing the validator (vitest hoists vi.mock
// to the top, but importing @/lib/auth/gameStateValidator below triggers
// an eager `ensureConfigLoaded` chain in `validateGameState`).
vi.mock("@/lib/game/config/server/configLoader.server", () => ({
  ensureConfigLoaded: vi.fn().mockResolvedValue({
    ok: true,
    config: { buildings: {}, workers: {} },
  }),
}));

process.env.CHECKSUM_SECRET =
  process.env.CHECKSUM_SECRET ?? "test-checksum-secret-for-unit-tests";

import { validateGameState } from "@/lib/auth/gameStateValidator";

describe("validateGameState tick-backwards severity", () => {
  it("flags small drift (< 100 ticks) as 'low' — stale cache retry", async () => {
    const validation = await validateGameState(
      { gameTick: 9500, money: 1000, totalMoneyEarned: 1000, gameSpeed: 1 },
      { gameTick: 9550, money: 1000, totalMoneyEarned: 1000, gameSpeed: 1 },
    );
    // drift=50, expected 'low'
    expect(validation.riskLevel).toBe("low");
    expect(
      validation.violations.some((v) => /tick went backwards/i.test(v)),
    ).toBe(true);
  });

  it("flags tiny drift (single tick) as 'low' — common 409 retry", async () => {
    const validation = await validateGameState(
      { gameTick: 1000, money: 1000, totalMoneyEarned: 1000, gameSpeed: 1 },
      { gameTick: 1001, money: 1000, totalMoneyEarned: 1000, gameSpeed: 1 },
    );
    expect(validation.riskLevel).toBe("low");
  });

  it("flags large drift (>= 100 ticks) as 'critical' — genuine rollback", async () => {
    const validation = await validateGameState(
      { gameTick: 9000, money: 1000, totalMoneyEarned: 1000, gameSpeed: 1 },
      { gameTick: 10000, money: 1000, totalMoneyEarned: 1000, gameSpeed: 1 },
    );
    expect(validation.riskLevel).toBe("critical");
  });

  it("accepts forward-progressing tick as no violation", async () => {
    const validation = await validateGameState(
      { gameTick: 10000, money: 1000, totalMoneyEarned: 1000, gameSpeed: 1 },
      { gameTick: 9000, money: 1000, totalMoneyEarned: 1000, gameSpeed: 1 },
    );
    const tickViolation = validation.violations.find((v) =>
      /tick went backwards/i.test(v),
    );
    expect(tickViolation).toBeUndefined();
  });

  it("does not introduce tick-backwards-related violation when drifts are equal", async () => {
    const validation = await validateGameState(
      { gameTick: 5000, money: 1000, totalMoneyEarned: 1000, gameSpeed: 1 },
      { gameTick: 5000, money: 1000, totalMoneyEarned: 1000, gameSpeed: 1 },
    );
    const tickViolation = validation.violations.find((v) =>
      /tick went backwards/i.test(v),
    );
    expect(tickViolation).toBeUndefined();
  });
});
