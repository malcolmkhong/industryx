// ============================================
// tests/unit/applyElapsedTicks.test.ts
//
// Phase 7: server tick injection helper.
// Validates that elapsed time between server snapshots is correctly
// converted to game ticks (capped by MAX_TICK_RATE_PER_SECOND) and
// fails closed on any DB/config error.
// ============================================

import { describe, it, expect, vi } from "vitest";

// Mock the upstream modules BEFORE importing the helper.
vi.mock('@/lib/db/access', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({
      data: "2026-07-09T01:00:00.000Z",
      error: null,
    }),
  })),
  // BUG-077: canonical boundary names mirror the legacy alias.
  getDbClient: vi.fn(() => ({ rpc: vi.fn().mockResolvedValue({ data: "2026-07-09T01:00:00.000Z", error: null, }), })),
  requireDbClient: () => ({ from: vi.fn() }),
  isDbClientConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/db/config/serverConfigFetcher", () => ({
  fetchGameConfigFromSupabase: vi.fn().mockResolvedValue({
    config: {
      buildings: {},
      resources: {},
      research: [],
      market: [],
      workers: [],
      transport: {},
      automation: [],
      prestigeBonuses: [],
      rankThresholds: [],
      quests: [],
      dailyRewards: [],
      eventTemplates: [],
      seasonalEvents: [],
      megaProjects: [],
      weather: {},
      productionChains: [],
      tradableResourceIds: [],
      gameConfig: {},
      loadedAt: 0,
      source: "supabase",
    } as never,
    partialErrors: [],
    idMigrationMap: {},
  }),
}));

vi.mock("@/lib/game/config/server/configLoader.server", () => ({
  ensureConfigLoaded: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/game/config/balance/balanceConfig", () => ({
  getGameLimits: vi.fn(() => ({
    maxTickRatePerSecond: 50,
  })),
}));

vi.mock("@/lib/game/production/engine/serverEngine.server", () => ({
  runServerTicks: vi.fn((state, ticks) => ({
    newState: {
      ...state,
      gameTick: Number(state.gameTick ?? 0) + ticks,
    },
    productionSnapshot: null,
  })),
}));

import { applyElapsedTicks } from "@/lib/auth/applyElapsedTicks";
import type { GameState } from "@/lib/game/shared/types/types";

function makeState(tick: number, money: number): GameState {
  return {
    money,
    totalMoneyEarned: 0,
    gameTick: tick,
    gameSpeed: 1,
    paused: false,
    resources: {},
    resourceCapacity: {},
    buildings: [],
    transportLines: [],
    powerGrid: {
      totalProduction: 0,
      totalConsumption: 0,
      efficiency: 1,
      overload: false,
      plants: [],
    },
    researchPoints: 0,
    completedResearch: [],
    activeResearch: null,
    researchProgress: 0,
    workers: [],
    market: [],
    sectorTrends: {},
    marketNews: [],
    marketNarratives: [],
    serverMarket: { prices: [], news: [], tick: 0, volatility: 0 },
    contracts: [],
    completedContracts: 0,
    automationUnlocks: [],
    prestigeState: {
      corporationPoints: 0,
      totalPrestiges: 0,
      megaFactoryUnlocked: false,
      bonuses: [],
    },
    activeEvents: [],
    eventLog: [],
    stats: {
      totalResourcesProduced: {},
      totalResourcesSold: {},
      peakEfficiency: 0,
      factoriesBuilt: 0,
      transportLinesBuilt: 0,
      researchCompleted: 0,
      contractsCompleted: 0,
      playTime: 0,
    },
    megaProjects: [],
    productionHistory: [],
    blueprints: [],
    autoSellResources: [],
    storageUpgradeLevels: {},
    lastOnlineTimestamp: Date.now(),
    leaderboardEntries: [],
    loginStreak: {
      currentStreak: 0,
      longestStreak: 0,
      lastLoginDate: "",
      totalLogins: 0,
      weeklyRewards: [],
    },
    weather: {
      current: "clear" as const,
      intensity: 0,
      remaining: 0,
      nextChange: 100,
    },
    quests: [],
    payoutConfig: {
      basePayoutInterval: 100,
      lastPayoutTick: 0,
      totalPayoutsReceived: 0,
      autoCollect: true,
    },
    pendingPayout: 0,
    payoutHistory: [],
    trackedQuest: null,
    drones: {
      fleet: [],
      completedMissions: 0,
      totalEarned: 0,
    },
    activeTab: "dashboard",
    selectedBuilding: null,
    notifications: [],
    productionSnapshot: {
      production: {},
      consumption: {},
      actualConsumption: {},
      buildings: [],
      powerProduction: 0,
      powerConsumption: 0,
      powerEfficiency: 1,
      powerOverload: false,
      payoutPerCycle: 0,
      payoutBreakdown: { extractors: 0, factories: 0, power: 0 },
      sellMultiplier: 1,
      endgameMoney: 0,
      endgameResearch: 0,
      endgameCorp: 0,
      moneyIncomeRate: 0,
      moneyExpenseRate: 0,
      rpIncomeRate: 0,
      rpExpenseRate: 0,
      cpIncomeRate: 0,
      cpExpenseRate: 0,
    },
  } as unknown as GameState;
}

describe("applyElapsedTicks (Phase 7 server tick injection)", () => {
  it("returns zero elapsed ticks when last_tick_at is null", async () => {
    const result = await applyElapsedTicks(makeState(0, 1000), null, 1);
    expect(result.elapsedTicks).toBe(0);
    expect(result.state).toBeDefined();
    expect(typeof result.serverNow).toBe("string");
  });

  it("computes elapsed ticks = seconds * game_speed at 1x", async () => {
    // server_now = 2026-07-09T01:00:00.000Z
    // last_tick_at = 2026-07-09T00:59:30.000Z (30s before)
    // game_speed = 1 → 30 ticks expected
    const result = await applyElapsedTicks(
      makeState(0, 1000),
      "2026-07-09T00:59:30.000Z",
      1,
    );
    expect(result.elapsedTicks).toBe(30);
  });

  it("scales elapsed ticks by game_speed at 5x (within cap)", async () => {
    // 6s elapsed at 5x → 30 ticks (under MAX_TICK_RATE_PER_SECOND=50)
    const result = await applyElapsedTicks(
      makeState(0, 1000),
      "2026-07-09T00:59:54.000Z", // 6 seconds before
      5,
    );
    expect(result.elapsedTicks).toBe(30);
  });

  it("caps elapsed ticks at MAX_TICK_RATE_PER_SECOND (50)", async () => {
    // 10 hours at 1x = 36000 ticks; cap at 50
    const result = await applyElapsedTicks(
      makeState(0, 1000),
      "2026-07-08T15:00:00.000Z", // 10 hours before
      1,
    );
    expect(result.elapsedTicks).toBe(50);
  });

  it("returns zero ticks when server_now <= last_tick_at (no drift)", async () => {
    // server_now is exactly last_tick_at
    const result = await applyElapsedTicks(
      makeState(0, 1000),
      "2026-07-09T01:00:00.000Z",
      1,
    );
    expect(result.elapsedTicks).toBe(0);
  });

  it("throws on invalid timestamp format (fail-closed)", async () => {
    await expect(
      applyElapsedTicks(makeState(0, 1000), "not-a-date", 1),
    ).rejects.toThrow(/Invalid timestamp/);
  });

  it("throws on config unavailable (fail-closed)", async () => {
    const { fetchGameConfigFromSupabase } =
      await import("@/lib/db/config/serverConfigFetcher");
    (
      fetchGameConfigFromSupabase as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      config: null,
      partialErrors: ["Connection refused"],
      idMigrationMap: {},
    });

    await expect(
      applyElapsedTicks(makeState(0, 1000), "2026-07-09T00:59:30.000Z", 1),
    ).rejects.toThrow(/Config unavailable/);
  });

  // V-031 (PR-BP-3, 2026-07-15): invalid `game_speed` values now fail
  // closed with a RangeError instead of silently clamping to 1. The
  // legacy behavior masked bad-data rows in `server_game_state.game_speed`
  // and produced incorrect tick counts downstream.
  it("V-031: throws RangeError when game_speed is NaN (fail-closed)", async () => {
    await expect(
      applyElapsedTicks(
        makeState(0, 1000),
        "2026-07-09T00:59:30.000Z",
        Number.NaN as unknown as number,
      ),
    ).rejects.toThrow(/Invalid game speed/);
  });

  it("V-031: throws RangeError when game_speed is 0 or negative", async () => {
    await expect(
      applyElapsedTicks(
        makeState(0, 1000),
        "2026-07-09T00:59:30.000Z",
        0,
      ),
    ).rejects.toThrow(/Invalid game speed/);

    await expect(
      applyElapsedTicks(
        makeState(0, 1000),
        "2026-07-09T00:59:30.000Z",
        -1,
      ),
    ).rejects.toThrow(/Invalid game speed/);
  });
});
