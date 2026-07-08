// ============================================
// tests/unit/serverAuthoritativeDailyReward.test.ts
//
// Phase 6, action #8: server-authoritative claimDailyReward. Verifies
// the server reads the reward from state.loginStreak.weeklyRewards
// (immune to client tampering), applies the reward (which may be
// money / researchPoints / resources / corporationPoints), and marks
// the reward as claimed. Day 7 also grants a $2000 money bonus.
// ============================================

import { describe, it, expect } from "vitest";
import { validateClaimDailyRewardAction } from "@/lib/game/serverEngine";
import type {
  GameState,
  DailyReward,
  LoginStreak,
} from "@/lib/game/types";

function makeReward(overrides?: Partial<DailyReward>): DailyReward {
  return {
    day: 1,
    type: "money",
    amount: 500,
    claimed: false,
    ...overrides,
  } as DailyReward;
}

function makeStreak(overrides?: {
  currentStreak?: number;
  weeklyRewards?: DailyReward[];
}): LoginStreak {
  return {
    currentStreak: overrides?.currentStreak ?? 1,
    longestStreak: 1,
    lastLoginDate: "2026-07-08",
    totalLogins: 1,
    weeklyRewards: overrides?.weeklyRewards ?? [
      makeReward({ day: 1, type: "money", amount: 500 }),
      makeReward({ day: 2, type: "money", amount: 600 }),
      makeReward({ day: 3, type: "researchPoints", amount: 50 }),
      makeReward({ day: 4, type: "resources", resource: "iron", amount: 100 }),
      makeReward({ day: 5, type: "money", amount: 700 }),
      makeReward({ day: 6, type: "researchPoints", amount: 80 }),
      makeReward({ day: 7, type: "corporationPoints", amount: 100 }),
    ],
  };
}

function makeState(overrides?: {
  money?: number;
  totalMoneyEarned?: number;
  resources?: Record<string, number>;
  researchPoints?: number;
  loginStreak?: LoginStreak;
}): Partial<GameState> {
  return {
    money: overrides?.money ?? 1000,
    totalMoneyEarned: overrides?.totalMoneyEarned ?? 1000,
    gameTick: 100,
    researchPoints: overrides?.researchPoints ?? 0,
    resources: (overrides?.resources ?? { iron: 0 }) as Record<string, number>,
    loginStreak: overrides?.loginStreak ?? makeStreak(),
    prestigeState: {
      corporationPoints: 0,
      totalPrestiges: 0,
      megaFactoryUnlocked: false,
      bonuses: [],
    },
  };
}

describe("validateClaimDailyRewardAction (server-authoritative)", () => {
  it("applies money reward (day 1)", () => {
    const state = makeState();
    const result = validateClaimDailyRewardAction(1, state);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(1500); // 1000 + 500
    expect(result.correctedState?.totalMoneyEarned).toBe(1500);
  });

  it("applies researchPoints reward (day 3)", () => {
    const state = makeState();
    const result = validateClaimDailyRewardAction(3, state);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.researchPoints).toBe(50);
    // money should not change for RP rewards
    expect(result.correctedState?.money).toBeUndefined();
  });

  it("applies resources reward (day 4, iron)", () => {
    const state = makeState({ resources: { iron: 50 } as Record<string, number> });
    const result = validateClaimDailyRewardAction(4, state);

    expect(result.valid).toBe(true);
    const resources = result.correctedState?.resources as Record<string, number>;
    expect(resources.iron).toBe(150); // 50 + 100
  });

  it("applies corporationPoints reward (day 7) and grants $2000 bonus", () => {
    const state = makeState();
    const result = validateClaimDailyRewardAction(7, state);

    expect(result.valid).toBe(true);
    const prestige = result.correctedState?.prestigeState as {
      corporationPoints: number;
    };
    expect(prestige.corporationPoints).toBe(100);
    // Day 7 also grants $2000 money
    expect(result.correctedState?.money).toBe(3000); // 1000 + 2000
    expect(result.correctedState?.totalMoneyEarned).toBe(3000);
  });

  it("marks reward.claimed = true in loginStreak.weeklyRewards", () => {
    const state = makeState();
    const result = validateClaimDailyRewardAction(1, state);

    const streak = result.correctedState?.loginStreak as LoginStreak;
    const reward1 = streak.weeklyRewards.find((r) => r.day === 1);
    expect(reward1?.claimed).toBe(true);
    // Other days unchanged
    const reward2 = streak.weeklyRewards.find((r) => r.day === 2);
    expect(reward2?.claimed).toBe(false);
  });

  it("rejects claim for day outside 1-7", () => {
    const state = makeState();
    expect(validateClaimDailyRewardAction(0, state).valid).toBe(false);
    expect(validateClaimDailyRewardAction(8, state).valid).toBe(false);
    expect(validateClaimDailyRewardAction(-1, state).valid).toBe(false);
    expect(validateClaimDailyRewardAction(1.5, state).valid).toBe(false);
  });

  it("rejects claim for day not in weeklyRewards", () => {
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [makeReward({ day: 1, claimed: true })],
      }),
    });
    const result = validateClaimDailyRewardAction(2, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("No daily reward configured for day 2");
  });

  it("rejects double-claim (already claimed)", () => {
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [makeReward({ day: 1, claimed: true })],
      }),
    });
    const result = validateClaimDailyRewardAction(1, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("already claimed");
  });

  it("rejects resources reward missing resource field", () => {
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [makeReward({ day: 4, type: "resources", amount: 100 })],
      }),
    });
    const result = validateClaimDailyRewardAction(4, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("missing resource field");
  });

  it("rejects unknown reward type", () => {
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [
          // Force a typo'd type via cast
          { day: 1, type: "magicBeans" as never, amount: 100, claimed: false },
        ],
      }),
    });
    const result = validateClaimDailyRewardAction(1, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unknown reward type");
  });

  it("rejects invalid reward amount (negative)", () => {
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [makeReward({ day: 1, amount: -100 })],
      }),
    });
    const result = validateClaimDailyRewardAction(1, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid reward amount");
  });

  it("server reads reward from state.loginStreak (not client payload)", () => {
    // State has a specific amount; client payload could lie.
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [makeReward({ day: 1, type: "money", amount: 99999 })],
      }),
    });
    const result = validateClaimDailyRewardAction(1, state);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(1000 + 99999);
  });
});
