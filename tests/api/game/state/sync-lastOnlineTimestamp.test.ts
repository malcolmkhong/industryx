/**
 * tests/api/game/state/sync-lastOnlineTimestamp.test.ts
 *
 * FIX 9 (2026-07): the sync route MUST server-stamp
 * `lastOnlineTimestamp` from the DB-authoritative clock so the
 * anti-cheat tick-rate check in `gameStateValidator` has a
 * fresh "last seen" anchor on every save.
 *
 * Before this fix, the check was silently skipped: the client
 * sent a value (or no value), the server wrote it (or didn't),
 * and on the next save `prevTime === currTime` made the
 * `currTime > prevTime` guard return false, so the rate check
 * never ran. Server-stamping fixes the gap AND prevents a
 * client from faking a slow interval to mask a tick-rate cheat.
 *
 * Strategy:
 *   - Mock the Supabase client to return a valid server state.
 *   - Mock `saveServerGameStateOptimistic` to capture the CAS patch.
 *   - POST a `lastOnlineTimestamp` value far in the past.
 *   - Assert the captured `full_state.lastOnlineTimestamp` is
 *     close to `Date.now()` (not the past value the client sent).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── capture the CAS patch ──────────────────────────────────────────────
const { saveServerGameStateOptimistic, getServerNowISOOrNull } = vi.hoisted(
  () => ({
    saveServerGameStateOptimistic: vi.fn(),
    getServerNowISOOrNull: vi.fn(),
  }),
);

// ── mock the supabase surface ──────────────────────────────────────────
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockAdminGetUserById = vi.fn();

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
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };
  return {
    createServiceRoleClient: vi.fn(() => ({
      from: mockFrom,
      rpc: mockRpc,
      auth: {
        getUser: mockGetUser,
        admin: { getUserById: mockAdminGetUserById },
      },
    })),
    // BUG-077: canonical boundary names mirror the legacy alias.
    getDbClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc, auth: { getUser: mockGetUser, admin: { getUserById: mockAdminGetUserById }, }, })),
    requireDbClient: () => ({ from: vi.fn() }),
    isDbClientConfigured: vi.fn(() => true),
    createClient: vi.fn(async () => null),
    isServiceRoleConfigured: vi.fn(() => true),
    isSupabaseConfigured: vi.fn(() => true),
    chainable,
  };
});

vi.mock("@/lib/auth/verifyAuth", () => ({
  verifyAuthAndOwnership: vi.fn(async () => ({
    success: true,
    userId: "user-1",
  })),
}));

vi.mock("@/lib/auth/rateLimiter", () => ({
  checkRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { sync: "sync", presence: "presence" },
}));

vi.mock("@/lib/auth/admin", () => ({
  isAdminUserId: vi.fn(() => false),
}));

vi.mock("@/lib/auth/serverTime", () => ({
  getServerNowISOOrNull: getServerNowISOOrNull,
}));

vi.mock("@/lib/auth/gameStateValidator", () => ({
  validateGameState: vi.fn(async () => ({
    isValid: true,
    riskLevel: "none",
    violations: [],
    checksum: "test-checksum",
  })),
  extractValidatedSaveFields: vi.fn((state) => ({
    money: Number(state.money) || 0,
    totalMoneyEarned: Number(state.totalMoneyEarned) || 0,
    researchPoints: Number(state.researchPoints) || 0,
    buildingsCount: Array.isArray(state.buildings) ? state.buildings.length : 0,
    gameTick: Number(state.gameTick) || 0,
    gameSpeed: 1,
  })),
  logActionAsync: vi.fn(),
  isAccountLocked: vi.fn(async () => ({ locked: false })),
  flagCheatAttempt: vi.fn(),
}));

vi.mock("@/lib/db/game/serverGameState", () => ({
  loadServerGameStateLite: vi.fn(async () => ({
    user_id: "user-1",
    money: 0,
    total_money_earned: 0,
    research_points: 0,
    buildings: [],
    buildings_count: 0,
    completed_research: [],
    resources: {},
    workers: [],
    game_tick: 0,
    game_speed: 1,
    state_hash: "test-hash",
    state_version: 0,
    last_tick_at: "2026-01-01T00:00:00.000Z",
    last_saved_at: "2026-01-01T00:00:00.000Z",
    cheat_flag_count: 0,
    full_state: {},
  })),
  loadServerGameStateForDeltaCheck: vi.fn(async () => ({
    full_state: { gameTick: 0, lastOnlineTimestamp: 0 },
    state_version: 0,
  })),
  buildCompleteFullStateForServerRow: vi.fn(async (row) => ({
    ...row.full_state,
    money: row.money,
    gameTick: row.game_tick,
    gameSpeed: row.game_speed,
  })),
  isServerGameStateAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/db/game/serverGameStatePayload", () => ({
  asFullState: (v: unknown) => v,
  stripUIFields: (v: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      // Drop only true UI fields. lastOnlineTimestamp is server-authoritative.
      if (
        k === "hydrated" ||
        k === "activeTab" ||
        k === "selectedBuilding" ||
        k === "notifications" ||
        k === "productionSnapshot"
      ) {
        continue;
      }
      out[k] = val;
    }
    return out;
  },
}));

vi.mock("@/lib/game/state/persistence/serverGameStatePersistence.server", () => ({
  initializeCompleteServerGameState: vi.fn(async () => null),
  persistServerGameStateOptimistic: saveServerGameStateOptimistic,
  syncLegacyPlayerProgressProjection: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/game/shared/utils/saveMigration/saveMigrations", () => ({}));

import { POST } from "@/app/api/game/state/sync/route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/game/state/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("FIX 9 — sync route server-stamps lastOnlineTimestamp", () => {
  const FIXED_SERVER_TIME_ISO = "2026-07-29T12:00:00.000Z";
  const FIXED_SERVER_TIME_MS = Date.parse(FIXED_SERVER_TIME_ISO);

  beforeEach(() => {
    saveServerGameStateOptimistic.mockReset();
    getServerNowISOOrNull.mockReset();
    // DB clock returns a deterministic time so the assertion is stable.
    getServerNowISOOrNull.mockResolvedValue(FIXED_SERVER_TIME_ISO);
    // CAS update succeeds.
    saveServerGameStateOptimistic.mockResolvedValue({
      user_id: "user-1",
      state_version: 1,
    });
  });

  it("overrides client-supplied lastOnlineTimestamp with the server clock", async () => {
    // Client tries to send a timestamp 1 year in the past to
    // game the anti-cheat check.
    const cheatingTimestamp = Date.now() - 365 * 24 * 60 * 60 * 1000;

    const req = makeRequest({
      userId: "user-1",
      gameState: {
        money: 1000,
        totalMoneyEarned: 5000,
        researchPoints: 10,
        buildings: [],
        workers: [],
        completedResearch: [],
        resources: {},
        gameTick: 100,
        gameSpeed: 1,
        lastOnlineTimestamp: cheatingTimestamp,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // The CAS patch must have been called once.
    expect(saveServerGameStateOptimistic).toHaveBeenCalledTimes(1);
    const casArgs = saveServerGameStateOptimistic.mock.calls[0];
    const patch = casArgs[2] as { full_state: Record<string, unknown> };

    // The persisted full_state.lastOnlineTimestamp must NOT be the
    // cheating client value. It must be the server clock (close to
    // FIXED_SERVER_TIME_MS, within a 5-second slop for any drift).
    expect(patch.full_state.lastOnlineTimestamp).not.toBe(cheatingTimestamp);
    const stamped = Number(patch.full_state.lastOnlineTimestamp);
    expect(stamped).toBe(FIXED_SERVER_TIME_MS);
    expect(Math.abs(stamped - FIXED_SERVER_TIME_MS)).toBeLessThan(5_000);
  });

  it("overrides a missing lastOnlineTimestamp (client never set it)", async () => {
    // No lastOnlineTimestamp at all in the client payload.
    const req = makeRequest({
      userId: "user-1",
      gameState: {
        money: 1000,
        totalMoneyEarned: 0,
        researchPoints: 0,
        buildings: [],
        workers: [],
        completedResearch: [],
        resources: {},
        gameTick: 50,
        gameSpeed: 1,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const casArgs = saveServerGameStateOptimistic.mock.calls[0];
    const patch = casArgs[2] as { full_state: Record<string, unknown> };
    const stamped = Number(patch.full_state.lastOnlineTimestamp);
    expect(stamped).toBe(FIXED_SERVER_TIME_MS);
  });

  it("overrides even a future-dated lastOnlineTimestamp (clock manipulation)", async () => {
    // Client tries to send a timestamp 100 years in the future.
    const futureTimestamp = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;

    const req = makeRequest({
      userId: "user-1",
      gameState: {
        money: 1000,
        totalMoneyEarned: 0,
        researchPoints: 0,
        buildings: [],
        workers: [],
        completedResearch: [],
        resources: {},
        gameTick: 100,
        gameSpeed: 1,
        lastOnlineTimestamp: futureTimestamp,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const casArgs = saveServerGameStateOptimistic.mock.calls[0];
    const patch = casArgs[2] as { full_state: Record<string, unknown> };
    const stamped = Number(patch.full_state.lastOnlineTimestamp);
    expect(stamped).toBe(FIXED_SERVER_TIME_MS);
    expect(stamped).toBeLessThan(futureTimestamp);
  });
});
