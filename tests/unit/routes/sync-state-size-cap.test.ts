/**
 * tests/unit/routes/sync-state-size-cap.test.ts
 *
 * Regression test for audit C7: GET /api/game/state/sync must:
 *   - return a slim summary shape when `?fields=summary` is set
 *   - cap the full payload at 1 MiB; oversize payloads fall back to
 *     the summary shape with an `oversize: true` flag
 *
 * Background: a runaway DB row with unbounded growth (e.g. event log
 * bleeding into full_state) would otherwise be exfiltratable at
 * 20/min × 200 KB indefinitely. The cap is a defensive safety net.
 *
 * The route also enforces rate-limit + verifyAuth; those are tested
 * elsewhere (tests/api/game/state/sync-lastOnlineTimestamp.test.ts).
 * Here we only assert the size cap + summary endpoint behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted so the route's import resolution sees them) ─────────
const {
  verifyAuthAndOwnership,
  isAccountLocked,
  isAdminUserId,
  checkRateLimit,
  loadServerGameStateLite,
  buildCompleteFullStateForServerRow,
  isServerGameStateAvailable,
  logActionAsync,
} = vi.hoisted(() => ({
  verifyAuthAndOwnership: vi.fn(),
  isAccountLocked: vi.fn(),
  isAdminUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  loadServerGameStateLite: vi.fn(),
  buildCompleteFullStateForServerRow: vi.fn(),
  isServerGameStateAvailable: vi.fn(),
  logActionAsync: vi.fn(),
}));

vi.mock("@/lib/db/access", () => ({
  getDbClient: () => ({ rpc: vi.fn(), from: vi.fn() }),
  requireDbClient: () => ({ rpc: vi.fn(), from: vi.fn() }),
  isDbClientConfigured: () => true,
  createClient: async () => ({ auth: { getUser: vi.fn() } }),
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/auth/verifyAuth", () => ({
  verifyAuthAndOwnership,
  isAccountLocked,
}));

vi.mock("@/lib/auth/rateLimiter", () => ({
  checkRateLimit,
  RATE_LIMITS: { sync: { limit: 20, windowMs: 60_000 } },
}));

vi.mock("@/lib/auth/admin", () => ({
  isAdminUserId,
}));

vi.mock("@/lib/auth/serverTime", () => ({
  getServerNowISOOrNull: vi.fn().mockResolvedValue("2026-07-18T00:00:00.000Z"),
}));

vi.mock("@/lib/db/game/serverGameState", () => ({
  loadServerGameStateLite,
  loadServerGameStateForDeltaCheck: vi.fn(),
  initializeGuestGameState: vi.fn(),
  buildCompleteFullStateForServerRow,
  saveServerGameStateOptimistic: vi.fn(),
  syncPlayerProgressGameState: vi.fn(),
  isServerGameStateAvailable,
}));

vi.mock("@/lib/db/game/serverGameStatePayload", () => ({
  asFullState: (v: unknown) => v,
  stripUIFields: (v: Record<string, unknown>) => v,
}));

vi.mock("@/lib/auth/gameStateValidator", () => ({
  validateGameState: vi.fn(),
  extractValidatedSaveFields: vi.fn(),
  logActionAsync,
  isAccountLocked,
  flagCheatAttempt: vi.fn(),
}));

import { GET } from "@/app/api/game/state/sync/route";

// ── Helpers ────────────────────────────────────────────────────────────

function makeRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

function makeBaseRow() {
  return {
    user_id: "user-1",
    money: 5000,
    total_money_earned: 0,
    research_points: 0,
    buildings: [],
    buildings_count: 0,
    completed_research: [],
    resources: {},
    workers: [],
    game_tick: 0,
    game_speed: 1,
    state_hash: "h",
    state_version: 1,
    last_tick_at: null,
    last_saved_at: null,
    cheat_flag_count: 0,
  };
}

function setAuthOk() {
  verifyAuthAndOwnership.mockResolvedValue({
    success: true,
    userId: "user-1",
  });
  isAccountLocked.mockResolvedValue({ locked: false });
  isAdminUserId.mockReturnValue(false);
  checkRateLimit.mockResolvedValue(null);
  isServerGameStateAvailable.mockReturnValue(true);
  loadServerGameStateLite.mockResolvedValue(makeBaseRow());
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("GET /api/game/state/sync — fields=summary + 1 MiB cap (audit C7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthOk();
  });

  it("returns a summary shape with no fullState when ?fields=summary", async () => {
    // The summary path doesn't even call buildCompleteFullStateForServerRow.
    buildCompleteFullStateForServerRow.mockResolvedValue({});

    const req = makeRequest(
      "http://localhost/api/game/state/sync?userId=user-1&fields=summary",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Record<string, unknown>;
      isNew: boolean;
    };
    expect(body.isNew).toBe(false);
    // The summary shape carries the denormalized columns only.
    expect(body.data).not.toHaveProperty("fullState");
    expect(body.data).toHaveProperty("money", 5000);
    expect(body.data).toHaveProperty("gameTick", 0);
    expect(body.data).toHaveProperty("stateHash", "h");
    expect(body.data).toHaveProperty("stateVersion", 1);
    // No oversize flag on the summary endpoint — that endpoint is
    // slim by design.
    expect(body.data).not.toHaveProperty("oversize");
  });

  it("returns the full payload when fullState fits under the 1 MiB cap", async () => {
    buildCompleteFullStateForServerRow.mockResolvedValue({
      money: 5000,
      gameTick: 100,
      buildings: Array.from({ length: 10 }, (_, i) => ({
        id: `b-${i}`,
        type: "ironMine",
        level: 1,
      })),
      // ~5 KB total — well under the cap.
    });

    const req = makeRequest(
      "http://localhost/api/game/state/sync?userId=user-1",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { fullState?: Record<string, unknown>; oversize?: boolean };
    };
    expect(body.data.fullState).toBeDefined();
    expect(body.data.fullState?.money).toBe(5000);
    expect(body.data.oversize).toBeUndefined();
  });

  it("falls back to summary shape when fullState exceeds 1 MiB", async () => {
    // Build a 1.2 MiB payload — over the 1 MiB cap.
    const huge = "x".repeat(1_200_000);
    buildCompleteFullStateForServerRow.mockResolvedValue({
      money: 5000,
      gameTick: 0,
      eventLog: huge,
    });

    const req = makeRequest(
      "http://localhost/api/game/state/sync?userId=user-1",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { fullState?: Record<string, unknown>; oversize?: boolean };
    };
    // No fullState in the oversize path.
    expect(body.data.fullState).toBeUndefined();
    // The oversize flag is set so the client knows the summary is
    // a fallback, not the canonical state.
    expect(body.data.oversize).toBe(true);
    // The summary fields are still present.
    expect(body.data).toHaveProperty("money", 5000);
  });
});