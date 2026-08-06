// ============================================
// tests/unit/serverAuthoritativeDailyReward.test.ts
//
// Phase 6, action #8: server-authoritative daily reward.
//
// Two layers:
//   1. validateClaimDailyReward(day, state)  - read-only invariant check
//   2. handleClaimDailyRewardAction(payload, state, userId) - server
//      handler that reads now_iso() RPC, computes UTC today/yesterday,
//      multiplies by streak multiplier, and mutates state.
//
// The handler is the source of truth for the actual payout amount. The
// validator only checks that the day is in [1,7] and the slot is
// unclaimed. Server-authoritative amount comes from WEEKLY_DAILY_REWARDS.
// ============================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateClaimDailyReward,
  applyClaimDailyRewardMutation,
} from "@/lib/game/production/engine/serverEngine.server";
import { handleClaimDailyRewardAction } from "@/lib/game/actions/server/handlers/rewards";
import type {
  GameState,
  DailyReward,
  LoginStreak,
} from "@/lib/game/shared/types/types";

// ─── Mocks ────────────────────────────────────────────────────────────

const mockServerToday = vi.hoisted(() => ({ value: "2026-08-05" }));
const mockWriteReward = vi.hoisted(() => vi.fn(async () => null));
const mockUpsertStreak = vi.hoisted(() => vi.fn(async () => null));
const HOIST_WEEKLY_DAILY_REWARDS = vi.hoisted(
  (): Array<{
    day: number;
    type: "money" | "researchPoints" | "resources" | "corporationPoints";
    amount: number;
    resource?: string;
  }> => ([
    { day: 1, type: "money", amount: 500 },
    { day: 2, type: "money", amount: 600 },
    { day: 3, type: "researchPoints", amount: 50 },
    { day: 4, type: "resources", amount: 100, resource: "iron" },
    { day: 5, type: "money", amount: 700 },
    { day: 6, type: "researchPoints", amount: 80 },
    { day: 7, type: "corporationPoints", amount: 100 },
  ]),
);

vi.mock("@/lib/db/access", () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: vi.fn(async (fn: string) => {
      if (fn === "now_iso") {
        return { data: `${mockServerToday.value}T12:00:00.000Z`, error: null };
      }
      return { data: null, error: { message: `unknown rpc: ${fn}` } };
    }),
  })),
  createClient: vi.fn(async () => null),
  isServiceRoleConfigured: vi.fn(() => true),
  isSupabaseConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/db/game/dailyRewards", () => ({
  recordDailyRewardClaim: mockWriteReward,
  upsertUserStreakFromClaim: mockUpsertStreak,
}));

vi.mock("@/lib/game/config/configCache", () => ({
  WEEKLY_DAILY_REWARDS: HOIST_WEEKLY_DAILY_REWARDS,
  getStreakMultiplier: vi.fn((streak: number) => {
    if (streak >= 7) return 3;
    if (streak >= 5) return 2;
    if (streak >= 3) return 1.5;
    return 1;
  }),
  BUILDING_DEFS: {},
  RESOURCE_META: {},
  WORKER_DEFS: {},
  TRANSPORT_DEFS: {},
  RESEARCH_TREE: [],
  AUTOMATION_UNLOCKS: [],
  PRESTIGE_BONUSES: [],
  RANK_THRESHOLDS: [],
  INITIAL_MARKET: [],
  CONTRACT_TEMPLATES: [],
  INITIAL_MEGA_PROJECTS: [],
  QUEST_DEFS: [],
  SEASONAL_EVENTS: [],
  TRADABLE_RESOURCE_IDS: [],
}));

// ─── Fixtures ──────────────────────────────────────────────────────────

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
  lastLoginDate?: string;
}): LoginStreak {
  return {
    currentStreak: overrides?.currentStreak ?? 1,
    longestStreak: 1,
    lastLoginDate: overrides?.lastLoginDate ?? "2026-08-04",
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

// ─── Validator (read-only invariants) ─────────────────────────────────

describe("validateClaimDailyReward (validator)", () => {
  it("accepts day 1-7 with unclaimed reward", () => {
    const state = makeState();
    const result = validateClaimDailyReward(1, state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rewardIdx).toBe(0);
    }
  });

  it("rejects day outside 1-7", () => {
    const state = makeState();
    expect(validateClaimDailyReward(0, state).ok).toBe(false);
    expect(validateClaimDailyReward(8, state).ok).toBe(false);
    expect(validateClaimDailyReward(-1, state).ok).toBe(false);
    expect(validateClaimDailyReward(1.5, state).ok).toBe(false);
  });

  it("rejects day not in weeklyRewards", () => {
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [makeReward({ day: 1, claimed: false })],
      }),
    });
    const result = validateClaimDailyReward(2, state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("No daily reward configured for day 2");
    }
  });

  it("rejects double-claim (already claimed)", () => {
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [makeReward({ day: 1, claimed: true })],
      }),
    });
    const result = validateClaimDailyReward(1, state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("already claimed");
    }
  });

  it("does NOT enforce reward.amount — handler owns the payout", () => {
    // Validator only checks invariants. A tampered amount in the
    // state must not be rejected by the validator — the handler
    // uses the server-authoritative WEEKLY_DAILY_REWARDS amount
    // regardless of what the state says.
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [makeReward({ day: 1, type: "money", amount: 99999 })],
      }),
    });
    expect(validateClaimDailyReward(1, state).ok).toBe(true);
  });
});

// ─── Mutator (with server-authoritative override) ─────────────────────

describe("applyClaimDailyRewardMutation", () => {
  it("applies money reward using override (ignores state.amount)", () => {
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [
          makeReward({ day: 1, type: "money", amount: 99999 }), // tampered
        ],
      }),
    });
    const result = applyClaimDailyRewardMutation(
      {
        day: 1,
        rewardIdx: 0,
        rewardResource: null,
        claimDate: "2026-08-05",
        multiplier: 1,
        rewardAmountOverride: 500, // server template
      },
      state,
    );

    expect(result.money).toBe(1500); // 1000 + 500 (override wins)
    expect(result.totalMoneyEarned).toBe(1500);
  });

  it("applies researchPoints reward (day 3)", () => {
    const state = makeState();
    const result = applyClaimDailyRewardMutation(
      {
        day: 3,
        rewardIdx: 2,
        rewardResource: null,
        claimDate: "2026-08-05",
        multiplier: 1,
        rewardAmountOverride: 50,
      },
      state,
    );
    expect(result.researchPoints).toBe(50);
    // money should not change for RP rewards
    expect(result.money).toBeUndefined();
  });

  it("applies resources reward (day 4, iron)", () => {
    const state = makeState({ resources: { iron: 50 } as Record<string, number> });
    const result = applyClaimDailyRewardMutation(
      {
        day: 4,
        rewardIdx: 3,
        rewardResource: "iron",
        claimDate: "2026-08-05",
        multiplier: 1,
        rewardAmountOverride: 100,
      },
      state,
    );
    const resources = result.resources as Record<string, number>;
    expect(resources.iron).toBe(150);
  });

  it("day 7 grants $2000 bonus + corpPoints (override)", () => {
    const state = makeState();
    const result = applyClaimDailyRewardMutation(
      {
        day: 7,
        rewardIdx: 6,
        rewardResource: null,
        claimDate: "2026-08-05",
        multiplier: 1,
        rewardAmountOverride: 100,
      },
      state,
    );
    const prestige = result.prestigeState as {
      corporationPoints: number;
    };
    expect(prestige.corporationPoints).toBe(100);
    expect(result.money).toBe(3000); // 1000 + 2000 (jackpot bonus)
    expect(result.totalMoneyEarned).toBe(3000);
  });

  it("multiplier scales the override amount", () => {
    const state = makeState();
    const result = applyClaimDailyRewardMutation(
      {
        day: 1,
        rewardIdx: 0,
        rewardResource: null,
        claimDate: "2026-08-05",
        multiplier: 2, // 5+ day streak
        rewardAmountOverride: 500,
      },
      state,
    );
    expect(result.money).toBe(2000); // 1000 + (500 * 2)
  });

  it("marks reward.claimed = true in loginStreak.weeklyRewards", () => {
    const state = makeState();
    const result = applyClaimDailyRewardMutation(
      {
        day: 1,
        rewardIdx: 0,
        rewardResource: null,
        claimDate: "2026-08-05",
        multiplier: 1,
        rewardAmountOverride: 500,
      },
      state,
    );
    const streak = result.loginStreak as LoginStreak;
    const reward1 = streak.weeklyRewards.find((r) => r.day === 1);
    expect(reward1?.claimed).toBe(true);
    const reward2 = streak.weeklyRewards.find((r) => r.day === 2);
    expect(reward2?.claimed).toBe(false);
  });

  it("sets lastLoginDate to claimDate (server UTC)", () => {
    const state = makeState();
    const result = applyClaimDailyRewardMutation(
      {
        day: 1,
        rewardIdx: 0,
        rewardResource: null,
        claimDate: "2026-08-05",
        multiplier: 1,
        rewardAmountOverride: 500,
      },
      state,
    );
    expect((result.loginStreak as LoginStreak).lastLoginDate).toBe("2026-08-05");
  });
});

// ─── Handler (server-authoritative, async) ─────────────────────────────

describe("handleClaimDailyRewardAction (handler)", () => {
  beforeEach(() => {
    mockServerToday.value = "2026-08-05";
    mockWriteReward.mockClear();
    mockUpsertStreak.mockClear();
  });

  it("uses server time (now_iso RPC) — not client Date.now()", async () => {
    mockServerToday.value = "2026-08-15";
    const state = makeState({
      loginStreak: makeStreak({ lastLoginDate: "2026-08-14" }),
    });
    const result = await handleClaimDailyRewardAction(
      { day: 1 },
      state,
      "test-user",
    );
    expect(result.valid).toBe(true);
    expect((result.correctedState?.loginStreak as LoginStreak).lastLoginDate).toBe(
      "2026-08-15",
    );
  });

  it("applies server template amount, NOT state amount", async () => {
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [
          makeReward({ day: 1, type: "money", amount: 99999 }), // tampered
        ],
      }),
    });
    const result = await handleClaimDailyRewardAction(
      { day: 1 },
      state,
      "test-user",
    );
    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(1500); // 1000 + 500 (template)
  });

  it("rejects missing 'day' field", async () => {
    const state = makeState();
    const result = await handleClaimDailyRewardAction({}, state, "test-user");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Missing 'day'");
    }
  });

  it("rejects already-claimed slot (validator)", async () => {
    const state = makeState({
      loginStreak: makeStreak({
        weeklyRewards: [makeReward({ day: 1, claimed: true })],
      }),
    });
    const result = await handleClaimDailyRewardAction(
      { day: 1 },
      state,
      "test-user",
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("already claimed");
    }
  });

  it("fire-and-forget: writes daily_rewards + user_streaks analytics", async () => {
    const state = makeState({
      loginStreak: makeStreak({ lastLoginDate: "2026-08-04" }),
    });
    const result = await handleClaimDailyRewardAction(
      { day: 1 },
      state,
      "test-user",
    );
    expect(result.valid).toBe(true);
    // Wait for the fire-and-forget promise to settle.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockWriteReward).toHaveBeenCalled();
    expect(mockUpsertStreak).toHaveBeenCalled();
  });

  it("day 7 jackpot: server template $2000 bonus + corpPoints", async () => {
    const state = makeState();
    const result = await handleClaimDailyRewardAction(
      { day: 7 },
      state,
      "test-user",
    );
    expect(result.valid).toBe(true);
    const prestige = result.correctedState?.prestigeState as {
      corporationPoints: number;
    };
    expect(prestige.corporationPoints).toBe(100);
    expect(result.correctedState?.money).toBe(3000); // 1000 + 2000 jackpot
  });
});