/**
 * tests/api/game/state/offline-progress-market-supply.test.ts
 *
 * C-002 (BUILDING_PRODUCTION_AUDIT §10.4, 2026-07-16):
 *   The offline route ran `runServerTicks` and wrote `full_state` plus
 *   denormalized columns, but it did NOT write the
 *   `server_game_state.market_supply` JSONB projection that the global
 *   market aggregate cron reads. The live/action elapsed writers
 *   already do this (via `applyElapsedServerTime`); the offline route
 *   had its own CAS write and was missed by the V-032 fix.
 *
 * Required regression (per audit §10.6 P0):
 *   - When offline settlement applies ≥ 1 tick, the CAS patch includes
 *     a `market_supply` key with `{production, actualConsumption, updatedAt}`.
 *   - When offline settlement applies 0 ticks, no persistence occurs.
 *
 * Strategy:
 *   - Mock the Supabase client to return a valid server state and config.
 *   - Mock `saveServerGameStateOptimistic` to capture the CAS patch.
 *   - Assert the captured patch includes the market_supply projection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── capture the CAS patch ──────────────────────────────────────────────
const { saveServerGameStateOptimistic } = vi.hoisted(() => ({
  saveServerGameStateOptimistic: vi.fn(),
}));

// ── mock the supabase surface ──────────────────────────────────────────
vi.mock("@/lib/db/access", () => {
  const chainable: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => {
      // The last .single() call the route makes is for game_config_game.
      // Earlier .single() calls don't exist in this route; the route
      // uses .single() only on the game_config_game query.
      return Promise.resolve({
        data: { tick_interval_ms: 1000, max_offline_ticks: 100, min_offline_ms: 0 },
        error: null,
      });
    }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  // Make the query builder awaitable directly (Supabase v2 shape).
  Object.defineProperty(chainable, "then", {
    get() {
      return (resolve: (v: unknown) => void) =>
        resolve({ data: [], error: null });
    },
  });

  const client: any = {
    from: vi.fn().mockReturnValue(chainable),
    rpc: vi.fn().mockImplementation((name: string) => {
      if (name === "now_iso") {
        // Server time 1 hour after last_tick_at, so elapsed ticks > 0.
        return Promise.resolve({
          data: "2026-07-15T01:00:00.000Z",
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  };
  return {

    // BUG-077: canonical boundary names mirror the legacy alias.
    getDbClient: () => client,
    requireDbClient: () => ({ from: vi.fn() }),
    isDbClientConfigured: vi.fn(() => true),
    createClient: async () => client,

    isSupabaseConfigured: () => true,
  };
});

// ── mock the runServerTicks engine ─────────────────────────────────────
vi.mock("@/lib/game/production/engine/serverEngine.server", () => ({
  runServerTicks: vi.fn().mockReturnValue({
    newState: {
      money: 10,
      totalMoneyEarned: 10,
      gameTick: 5,
      gameSpeed: 1,
      resources: {},
      resourceCapacity: {},
      buildings: [],
      workers: [],
      powerGrid: { totalProduction: 0, totalConsumption: 0, efficiency: 1, overload: false, plants: [] },
      prestigeState: { totalPrestiges: 0, corporationPoints: 0, bonuses: [] },
      weather: { intensity: 0, duration: 0, currentType: "neutral" },
      megaProjects: [],
    },
    productionSnapshot: {
      production: { iron: 1 },
      consumption: {},
      actualConsumption: {},
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
      storageOverflow: {},
    },
  }),
}));

// ── mock the database accessors ───────────────────────────────────────
vi.mock("@/lib/db/game/serverGameState", () => ({
  saveServerGameStateOptimistic,
  isServerGameStateAvailable: vi.fn().mockReturnValue(true),
  loadServerGameStateForTick: vi.fn().mockResolvedValue({
    // runServerTicks is mocked above, so the base full_state only needs
    // to satisfy the route's isServerGameData type guard.
    full_state: {
      money: 0,
      totalMoneyEarned: 0,
      gameTick: 0,
      gameSpeed: 1,
    },
    game_tick: 0,
    game_speed: 1,
    state_version: 0,
    last_tick_at: "2026-07-15T00:00:00.000Z",
    money: 0,
    total_money_earned: 0,
    research_points: 0,
    buildings: [],
    completed_research: [],
    resources: {},
    workers: [],
    is_locked: false,
    lock_reason: null,
  }),
  // Unused by this route but required by the module surface.
  loadServerGameStateForAction: vi.fn(),
  loadServerGameStateForDeltaCheck: vi.fn(),
  loadServerGameStateLite: vi.fn(),
  buildCompleteFullStateForServerRow: vi.fn(),
  loadServerGameStateForLeaderboard: vi.fn(),
  loadServerGameStateForTrade: vi.fn(),
  loadServerGameStateForPreview: vi.fn(),
  loadActivePlayersSince: vi.fn(),
  loadFullStateForUser: vi.fn(),
  pageServerGameStateFullState: vi.fn(),
  initializeGuestGameState: vi.fn(),
  syncPlayerProgressGameState: vi.fn(),
}));

vi.mock("@/lib/auth/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    serverTick: { maxRequests: 12, windowMs: 60_000, failClosed: true },
    action: { limit: 100, windowMs: 60000 },
    general: { limit: 200, windowMs: 60000 },
  },
}));

vi.mock("@/lib/auth/verifyAuth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({
    success: true,
    userId: "user-1",
    email: "test@example.com",
  }),
}));

// ── imports ────────────────────────────────────────────────────────────
import { POST } from "@/app/api/game/state/offline-progress/route";
import { buildRequest } from "../../helpers/request";

describe("C-002 — offline-progress route writes market_supply projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveServerGameStateOptimistic.mockResolvedValue({
      user_id: "user-1",
      state_version: 1,
    } as never);
  });

  it("C-002: CAS patch includes market_supply when ticks are applied", async () => {
    const req = buildRequest({
      method: "POST",
      url: "/api/game/state/offline-progress",
      body: {},
    });
    const res = await POST(req);

    // The route should have attempted a CAS write with a market_supply
    // projection. If the route returned 503 or 500, the save call was
    // never reached; we treat that as a regression of C-002.
    expect([200, 201]).toContain(res.status);

    expect(saveServerGameStateOptimistic).toHaveBeenCalledTimes(1);
    const [, , patch] =
      saveServerGameStateOptimistic.mock.calls[0] as Array<unknown>;

    expect(patch).toHaveProperty("market_supply");
    const marketSupply = (patch as { market_supply: unknown })
      .market_supply;
    expect(marketSupply).toBeTruthy();
    expect(marketSupply).toEqual(
      expect.objectContaining({
        production: expect.any(Object),
        actualConsumption: expect.any(Object),
        updatedAt: expect.any(String),
      }),
    );
  });
});
