// ============================================
// tests/unit/serverAuthoritativePayout.test.ts
//
// Phase 6, action #6: server-authoritative collectPayout. Verifies that
// the server reads its own computed `pendingPayout` (immune to client
// tampering), credits money + totalMoneyEarned, and zeros out the
// pending payout.
//
// Income path: totalMoneyEarned increases by the payout amount. This
// is critical for the validate-ticks cron's ratio check
// (`money <= totalMoneyEarned * 1.5`).
// ============================================

import { describe, it, expect } from "vitest";
import { validateCollectPayoutAction } from "@/lib/game/production/engine/serverEngine.server";
import type { GameState } from "@/lib/game/shared/types/types";

function makeState(overrides?: {
  money?: number;
  totalMoneyEarned?: number;
  pendingPayout?: number;
}): Partial<GameState> {
  return {
    money: overrides?.money ?? 1000,
    totalMoneyEarned: overrides?.totalMoneyEarned ?? 1000,
    gameTick: 100,
    pendingPayout: overrides?.pendingPayout ?? 500,
  };
}

describe("validateCollectPayoutAction (server-authoritative)", () => {
  it("returns valid + correctedState for positive pending payout", () => {
    const state = makeState({ money: 1000, pendingPayout: 500 });
    const result = validateCollectPayoutAction(state);

    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    expect(result.correctedState?.money).toBe(1500);
    expect(result.correctedState?.totalMoneyEarned).toBe(1500);
    expect(result.correctedState?.pendingPayout).toBe(0);
  });

  it("credits money and totalMoneyEarned by the SAME amount (income path)", () => {
    const state = makeState({ money: 2000, totalMoneyEarned: 5000, pendingPayout: 750 });
    const result = validateCollectPayoutAction(state);

    expect(result.valid).toBe(true);
    // money: 2000 + 750 = 2750
    expect(result.correctedState?.money).toBe(2750);
    // totalMoneyEarned: 5000 + 750 = 5750
    expect(result.correctedState?.totalMoneyEarned).toBe(5750);
  });

  it("rejects collection when pending payout is zero", () => {
    const state = makeState({ pendingPayout: 0 });
    const result = validateCollectPayoutAction(state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("No pending payout");
  });

  it("rejects collection when pending payout is negative (defense)", () => {
    const state = makeState({ pendingPayout: -100 });
    const result = validateCollectPayoutAction(state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("No pending payout");
  });

  it("rejects when pending payout is NaN/Infinity", () => {
    const state = makeState();
    state.pendingPayout = NaN;
    const resultNaN = validateCollectPayoutAction(state);
    expect(resultNaN.valid).toBe(false);

    state.pendingPayout = Infinity;
    const resultInf = validateCollectPayoutAction(state);
    expect(resultInf.valid).toBe(false);
  });

  it("handles missing pendingPayout (treats as 0)", () => {
    const state: Partial<GameState> = {
      money: 1000,
      totalMoneyEarned: 1000,
      gameTick: 100,
      // pendingPayout intentionally omitted
    };
    const result = validateCollectPayoutAction(state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("No pending payout");
  });

  it("uses server-side pendingPayout value (not client-supplied payload)", () => {
    // Client cannot lie about pendingPayout amount; server reads it
    // from its own state. Test verifies the server uses state.pendingPayout.
    const state = makeState({ money: 0, pendingPayout: 1234 });
    const result = validateCollectPayoutAction(state);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(1234);
  });

  it("zeros out pendingPayout after collection", () => {
    const state = makeState({ pendingPayout: 9999 });
    const result = validateCollectPayoutAction(state);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.pendingPayout).toBe(0);
  });

  it("large payout: preserves totalMoneyEarned consistency", () => {
    // Regression for SEC-002 fail-closed semantics: server must not
    // overflow or wrap totalMoneyEarned when the payout is huge.
    const state = makeState({ money: 1e15, totalMoneyEarned: 1e15, pendingPayout: 1e12 });
    const result = validateCollectPayoutAction(state);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(1e15 + 1e12);
    expect(result.correctedState?.totalMoneyEarned).toBe(1e15 + 1e12);
  });
});
