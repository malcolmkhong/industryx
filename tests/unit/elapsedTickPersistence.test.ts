import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/applyElapsedTicks", () => ({
  applyElapsedTicks: vi.fn(),
}));

vi.mock("@/lib/auth/gameStateValidator", () => ({
  extractValidatedSaveFields: vi.fn(() => ({
    money: 1000,
    totalMoneyEarned: 0,
    gameTick: 0,
    buildingsCount: 0,
  })),
}));

vi.mock("@/lib/db/game/serverGameState", () => ({
  saveServerGameStateOptimistic: vi.fn(),
}));

vi.mock("@/lib/db/game/serverGameStatePayload", () => ({
  asFullState: vi.fn((state) => state),
}));

import { applyElapsedTicks } from "@/lib/auth/applyElapsedTicks";
import { saveServerGameStateOptimistic } from "@/lib/db/game/serverGameState";
import type { ServerGameStateForAction } from "@/lib/db/game/serverGameState";
import { applyElapsedServerTime } from "@/lib/game/actions/server/shared/elapsedTickPersistence";

const baseState = {
  full_state: { gameTick: 0, money: 2000, resources: {} },
  money: 2000,
  total_money_earned: 0,
  game_tick: 0,
  game_speed: 1,
  state_version: 1,
  state_hash: "hash",
  last_tick_at: null,
  last_saved_at: null,
  buildings: [],
  buildings_count: 0,
  resources: {},
  research_points: 0,
  completed_research: [],
  workers: [],
  is_locked: false,
  lock_reason: null,
  cheat_flag_count: 0,
} as unknown as ServerGameStateForAction;

describe("applyElapsedServerTime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes last_tick_at for brand-new server state without applying ticks", async () => {
    (applyElapsedTicks as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      state: baseState.full_state,
      elapsedTicks: 0,
      serverNow: "2026-07-14T12:00:00.000Z",
    });
    (saveServerGameStateOptimistic as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...baseState,
      last_tick_at: "2026-07-14T12:00:00.000Z",
      last_saved_at: "2026-07-14T12:00:00.000Z",
    });

    const result = await applyElapsedServerTime(baseState, "user-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.elapsedTicks).toBe(0);
    expect(result.activeServerState.last_tick_at).toBe(
      "2026-07-14T12:00:00.000Z",
    );
    // CRIT-3 fix (2026-07-14): cursor init now also writes back the
    // denormalized columns derived from the overlaid full_state so a
    // stale row self-heals on first cursor init (instead of leaving
    // null denorm cols to be overlaid as 0 on next hydration).
    expect(saveServerGameStateOptimistic).toHaveBeenCalledWith(
      "user-1",
      1,
      expect.objectContaining({
        last_tick_at: "2026-07-14T12:00:00.000Z",
        last_saved_at: "2026-07-14T12:00:00.000Z",
        money: 2000,
        total_money_earned: 0,
        buildings: [],
        buildings_count: 0,
        completed_research: [],
        game_tick: 0,
        research_points: 0,
        resources: {},
        workers: [],
      }),
    );
  });

  // PR-BP-2 (V-032, NEW-TEST-031): the post-tick persistence patch must
  // include the slim server-only `market_supply` projection derived
  // from the elapsed post-tick snapshot. The aggregate cron reads this
  // column — never `full_state.productionSnapshot`, which `stripUIFields`
  // removes before persistence.
  it("NEW-TEST-031: writes market_supply projection on post-tick persist", async () => {
    const postTickState = {
      ...(baseState.full_state as Record<string, unknown>),
      gameTick: 5,
      money: 2500,
      resources: { iron: 10 },
    } as typeof baseState.full_state;
    const postTickSnapshot = {
      production: { iron: 3 },
      actualConsumption: { iron: 1 },
      consumption: { iron: 1 },
      // Other ProductionSnapshot fields are irrelevant for the projection
      // but ensure the helper reads only the slim subset.
      buildings: {},
      powerProduction: 0,
      powerConsumption: 0,
      powerEfficiency: 1,
      powerOverload: false,
      payoutPerCycle: 0,
      payoutBreakdown: { extractors: 0, factories: 0, power: 0 },
      sellMultiplier: 0,
      endgameMoney: 0,
      endgameResearch: 0,
      endgameCorp: 0,
      moneyIncomeRate: 0,
      moneyExpenseRate: 0,
      rpIncomeRate: 0,
      rpExpenseRate: 0,
      cpIncomeRate: 0,
      cpExpenseRate: 0,
    };
    (applyElapsedTicks as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      state: postTickState,
      elapsedTicks: 5,
      serverNow: "2026-07-14T12:00:00.000Z",
      productionSnapshot: postTickSnapshot,
    });
    (saveServerGameStateOptimistic as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...baseState,
      full_state: postTickState,
      state_version: 2,
      last_tick_at: "2026-07-14T12:00:00.000Z",
      last_saved_at: "2026-07-14T12:00:00.000Z",
    });

    const result = await applyElapsedServerTime(baseState, "user-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.elapsedTicks).toBe(5);

    // The patch MUST carry a slim market_supply projection derived from
    // the elapsed post-tick snapshot. Aggregate cron depends on this.
    expect(saveServerGameStateOptimistic).toHaveBeenCalledWith(
      "user-1",
      1,
      expect.objectContaining({
        market_supply: expect.objectContaining({
          production: { iron: 3 },
          actualConsumption: { iron: 1 },
          updatedAt: expect.any(String),
        }),
        state_version: 2,
        last_tick_at: "2026-07-14T12:00:00.000Z",
        last_saved_at: "2026-07-14T12:00:00.000Z",
      }),
    );
  });
});
