// ============================================
// tests/unit/serverAuthoritativeQuest.test.ts
//
// Phase 6, action #7: server-authoritative claimQuestReward. Verifies
// the server reads the reward from state.quests (not from client),
// applies money + researchPoints + corporationPoints, and marks the
// quest as claimed.
//
// Income path: totalMoneyEarned increases by the money reward. This
// maintains the validate-ticks cron ratio check.
// ============================================

import { describe, it, expect } from "vitest";
import { validateClaimQuestAction } from "@/lib/game/production/engine/serverEngine.server";
import { WEATHER_DEFS } from "@/lib/game/config/configCache";
import type { GameState, Quest, PrestigeState, WeatherType } from "@/lib/game/shared/types/types";

/**
 * weather_bonus feature: when state.weather.current is set, the server
 * scales the money + researchPoints reward by WEATHER_DEFS[weather]
 * .productionMultiplier. corporationPoints stays flat.
 *
 * Each test pins WEATHER_DEFS in-place to the values from
 * game_config_weather, then verifies the claim response applies the
 * matching scale.
 */
function pinWeather(multiplierByType: Record<WeatherType, number>) {
  for (const k of Object.keys(WEATHER_DEFS) as WeatherType[]) {
    delete WEATHER_DEFS[k];
  }
  for (const [k, v] of Object.entries(multiplierByType) as [WeatherType, number][]) {
    WEATHER_DEFS[k] = {
      name: k,
      icon: `game-icons:${k}`,
      productionMultiplier: v,
      solarMultiplier: 1,
      windMultiplier: 1,
      description: `Test weather ${k}`,
    };
  }
}

function makeQuest(overrides?: Partial<Quest>): Quest {
  return {
    id: "q1",
    name: "Build First Iron Mine",
    description: "Construct your first iron mine.",
    type: "build",
    category: "tutorial",
    steps: [],
    reward: { money: 500, researchPoints: 10, corporationPoints: 5 },
    completed: true,
    claimed: false,
    icon: "test:quest",
    ...overrides,
  } as Quest;
}

function makeState(overrides?: {
  money?: number;
  totalMoneyEarned?: number;
  researchPoints?: number;
  quests?: Quest[];
  prestigeState?: PrestigeState;
}): Partial<GameState> {
  return {
    money: overrides?.money ?? 1000,
    totalMoneyEarned: overrides?.totalMoneyEarned ?? 1000,
    gameTick: 100,
    researchPoints: overrides?.researchPoints ?? 0,
    quests: overrides?.quests ?? [makeQuest()],
    prestigeState: overrides?.prestigeState ?? {
      corporationPoints: 0,
      totalPrestiges: 0,
      megaFactoryUnlocked: false,
      bonuses: [],
    },
  };
}

describe("validateClaimQuestAction (server-authoritative)", () => {
  it("returns valid + correctedState for claimable quest", () => {
    const state = makeState({ money: 1000, researchPoints: 0 });
    const result = validateClaimQuestAction("q1", state);

    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    // money: 1000 + 500 = 1500
    expect(result.correctedState?.money).toBe(1500);
    // totalMoneyEarned: 1000 + 500 = 1500
    expect(result.correctedState?.totalMoneyEarned).toBe(1500);
    // researchPoints: 0 + 10 = 10
    expect(result.correctedState?.researchPoints).toBe(10);
    // corporationPoints: 0 + 5 = 5
    const prestige = result.correctedState?.prestigeState as PrestigeState;
    expect(prestige?.corporationPoints).toBe(5);
  });

  it("marks quest.claimed = true and preserves other fields", () => {
    const state = makeState();
    const result = validateClaimQuestAction("q1", state);

    const quests = result.correctedState?.quests as Quest[];
    expect(quests[0].claimed).toBe(true);
    // Other fields preserved
    expect(quests[0].id).toBe("q1");
    expect(quests[0].name).toBe("Build First Iron Mine");
    expect(quests[0].completed).toBe(true);
    expect(quests[0].reward.money).toBe(500);
  });

  it("rejects claim for non-existent quest", () => {
    const state = makeState();
    const result = validateClaimQuestAction("q999", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Quest "q999" not found');
  });

  it("rejects claim for incomplete quest", () => {
    const state = makeState({
      quests: [makeQuest({ completed: false })],
    });
    const result = validateClaimQuestAction("q1", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("not yet completed");
  });

  it("rejects double-claim (already claimed)", () => {
    const state = makeState({
      quests: [makeQuest({ claimed: true })],
    });
    const result = validateClaimQuestAction("q1", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("already claimed");
  });

  it("rejects missing questId", () => {
    const state = makeState();
    const result = validateClaimQuestAction("", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing questId");
  });

  it("handles quest with only money reward (no RP/corpPoints)", () => {
    const state = makeState({
      quests: [makeQuest({ reward: { money: 1000 } })],
    });
    const result = validateClaimQuestAction("q1", state);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(2000); // 1000 + 1000
    expect(result.correctedState?.researchPoints).toBe(0);
    const prestige = result.correctedState?.prestigeState as PrestigeState;
    expect(prestige?.corporationPoints).toBe(0);
  });

  it("rejects quest with invalid reward (negative money)", () => {
    const state = makeState({
      quests: [makeQuest({ reward: { money: -100 } })],
    });
    const result = validateClaimQuestAction("q1", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid reward");
  });

  it("preserves prestigeState fields (totalPrestiges, bonuses, etc.)", () => {
    const state = makeState({
      prestigeState: {
        corporationPoints: 100,
        totalPrestiges: 5,
        megaFactoryUnlocked: true,
        bonuses: [
          {
            id: "b1",
            name: "Test Bonus",
            description: "For testing.",
            cost: 50,
            purchased: true,
            effect: { type: "production", value: 0.1 },
          },
        ],
      },
    });
    const result = validateClaimQuestAction("q1", state);

    expect(result.valid).toBe(true);
    const prestige = result.correctedState?.prestigeState as PrestigeState;
    expect(prestige.corporationPoints).toBe(105); // 100 + 5
    expect(prestige.totalPrestiges).toBe(5);
    expect(prestige.megaFactoryUnlocked).toBe(true);
    expect(prestige.bonuses).toHaveLength(1);
  });

  it("server reads reward from state.quests, not client payload", () => {
    // Set up state with quest that has a specific reward amount
    const state = makeState({
      quests: [makeQuest({ reward: { money: 12345, researchPoints: 99 } })],
    });
    // Client could try to send a different reward in payload, but the
    // server ignores it and reads from state.quests.
    const result = validateClaimQuestAction("q1", state);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(1000 + 12345);
    expect(result.correctedState?.researchPoints).toBe(99);
  });

  describe("weather bonus on claim (server-authoritative)", () => {
    it("clear weather leaves reward unchanged (×1.00)", () => {
      pinWeather({
        clear: 1, sunny: 1.05, rainy: 0.9, stormy: 0.75, foggy: 0.85, snowy: 0.8,
      });
      const state = makeState({
        quests: [makeQuest({ reward: { money: 1000, researchPoints: 100 } })],
      }) as Partial<GameState> & { weather?: { current: WeatherType } };
      state.weather = { current: "clear", intensity: 0, remaining: 0, nextChange: 0 };

      const result = validateClaimQuestAction("q1", state);

      expect(result.valid).toBe(true);
      expect(result.correctedState?.money).toBe(2000); // 1000 + 1000×1.00
      expect(result.correctedState?.researchPoints).toBe(100); // 0 + 100×1.00
    });

    it("sunny weather boosts reward by +5%", () => {
      pinWeather({
        clear: 1, sunny: 1.05, rainy: 0.9, stormy: 0.75, foggy: 0.85, snowy: 0.8,
      });
      const state = makeState({
        money: 0,
        totalMoneyEarned: 0,
        quests: [makeQuest({ reward: { money: 1000, researchPoints: 100, corporationPoints: 5 } })],
      }) as Partial<GameState> & { weather?: { current: WeatherType } };
      state.weather = { current: "sunny", intensity: 0.5, remaining: 50, nextChange: 100 };

      const result = validateClaimQuestAction("q1", state);

      expect(result.valid).toBe(true);
      // 1000 × 1.05 = 1050
      expect(result.correctedState?.money).toBe(1050);
      expect(result.correctedState?.totalMoneyEarned).toBe(1050);
      // 100 × 1.05 = 105
      expect(result.correctedState?.researchPoints).toBe(105);
      // corpPoints NOT scaled (5 × 1.0 = 5)
      const prestige = result.correctedState?.prestigeState as PrestigeState;
      expect(prestige?.corporationPoints).toBe(5);
    });

    it("stormy weather reduces reward by 25%", () => {
      pinWeather({
        clear: 1, sunny: 1.05, rainy: 0.9, stormy: 0.75, foggy: 0.85, snowy: 0.8,
      });
      const state = makeState({
        money: 0,
        totalMoneyEarned: 0,
        quests: [makeQuest({ reward: { money: 1000, researchPoints: 100 } })],
      }) as Partial<GameState> & { weather?: { current: WeatherType } };
      state.weather = { current: "stormy", intensity: 0.8, remaining: 20, nextChange: 60 };

      const result = validateClaimQuestAction("q1", state);

      expect(result.valid).toBe(true);
      // 1000 × 0.75 = 750
      expect(result.correctedState?.money).toBe(750);
      expect(result.correctedState?.totalMoneyEarned).toBe(750);
      // 100 × 0.75 = 75
      expect(result.correctedState?.researchPoints).toBe(75);
    });

    it("falls back to ×1 when WEATHER_DEFS missing the key", () => {
      // Empty catalog (cold boot) — must not crash, must not zero out.
      pinWeather({} as Record<WeatherType, number>);
      const state = makeState({
        money: 0,
        quests: [makeQuest({ reward: { money: 1000, researchPoints: 100 } })],
      }) as Partial<GameState> & { weather?: { current: WeatherType } };
      state.weather = { current: "sunny", intensity: 0.5, remaining: 50, nextChange: 100 };

      const result = validateClaimQuestAction("q1", state);

      expect(result.valid).toBe(true);
      expect(result.correctedState?.money).toBe(1000); // unchanged
    });
  });
});
