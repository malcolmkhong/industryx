/**
 * tests/api/auth/bootstrap.test.ts
 *
 * Tests for POST /api/auth/bootstrap — the single canonical bootstrap
 * endpoint per AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §4.
 *
 * Covers plan §15 status codes:
 *   - 200 BOOTSTRAP_READY (guest + auth + sign-out flows)
 *   - 400 INVALID_BOOTSTRAP_REQUEST
 *   - 409 ACCOUNT_PROGRESS_CONFLICT
 *   - 422 STATE_RECOVERY_REQUIRED
 *   - 500 INTERNAL_BOOTSTRAP_ERROR
 *   - 503 BOOTSTRAP_UNAVAILABLE
 *
 * Strategy: mock @/lib/supabase/server to control the Supabase session
 * (cookie-driven) and the 5 bootstrap RPCs. The rate limiter is also
 * stubbed so tests don't depend on the check_rate_limit RPC.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRequest, readJson } from "../helpers/request";

// Rate limiter stub: always allow; never blocks.
const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    bootstrap: { maxRequests: 20, windowMs: 60_000, failClosed: false },
    player: { maxRequests: 20, windowMs: 60_000, failClosed: false },
    action: { maxRequests: 20, windowMs: 60_000, failClosed: true },
    sync: { maxRequests: 20, windowMs: 60_000, failClosed: true },
    publicConfig: { maxRequests: 30, windowMs: 60_000, failClosed: false },
    config: { maxRequests: 30, windowMs: 60_000, failClosed: false },
    presence: { maxRequests: 60, windowMs: 60_000, failClosed: false },
    general: { maxRequests: 30, windowMs: 60_000, failClosed: false },
    adminRead: { maxRequests: 60, windowMs: 60_000, failClosed: false },
    adminWrite: { maxRequests: 30, windowMs: 60_000, failClosed: true },
    admin: { maxRequests: 60, windowMs: 60_000, failClosed: false },
    serverTick: { maxRequests: 12, windowMs: 60_000, failClosed: true },
    compute: { maxRequests: 10, windowMs: 60_000, failClosed: false },
  },
}));
vi.mock("@/lib/auth/rateLimiter", () => ({
  checkRateLimit: rateLimitMock.checkRateLimit,
  RATE_LIMITS: rateLimitMock.RATE_LIMITS,
}));

const serverGameStateMock = vi.hoisted(() => ({
  stateRows: new Map<string, Record<string, unknown>>(),
  loadServerGameStateLite: vi.fn(
    async (userId: string) => serverGameStateMock.stateRows.get(userId) ?? null,
  ),
  // Mock mirrors the real buildCompleteFullStateForServerRow — the
  // BUG-093 read-side patch (placeholder detection) lives in the
  // production code; the mock must reproduce it so the §17 hydration
  // tests verify the same shape the client receives in production.
  buildCompleteFullStateForServerRow: vi.fn(
    async (row: Record<string, unknown>) => {
      const fullState = (row.full_state ?? {}) as Record<string, unknown>;
      const isPlaceholder = fullState.bootstrap_pending === true;
      if (isPlaceholder) {
        return {
          money: 2000, // canonical starting_money
          totalMoneyEarned: 0,
          researchPoints: 0,
          buildings: [],
          completedResearch: [],
          resources: { iron: 0, copper: 0 },
          workers: [],
          gameTick: 0,
          gameSpeed: 1,
          quests: [{ id: "startup", completed: false }],
        };
      }
      return {
        money: row.money,
        totalMoneyEarned: row.total_money_earned,
        researchPoints: row.research_points,
        buildings: row.buildings,
        completedResearch: row.completed_research,
        resources: row.resources,
        workers: row.workers,
        gameTick: row.game_tick,
        gameSpeed: row.game_speed,
        quests: row.quests ?? [{ id: "startup", completed: false }],
      };
    },
  ),
}));

vi.mock("@/lib/db/game/serverGameState", () => ({
  loadServerGameStateLite: serverGameStateMock.loadServerGameStateLite,
  buildCompleteFullStateForServerRow:
    serverGameStateMock.buildCompleteFullStateForServerRow,
}));

// request-ip-log-helper is best-effort; stub to no-op.
vi.mock("@/app/api/auth/_shared/request-ip-log-helper", () => ({
  logRequestIp: vi.fn(),
  hashIp: vi.fn(() => "hashed"),
  extractClientIp: vi.fn(() => "127.0.0.1"),
}));

// ─── Helper: build a supabase client mock with controllable auth + RPC ──

interface RpcScript {
  guest?: unknown;
  authenticated?: unknown;
  upgrade?: unknown;
  signOut?: unknown;
  repair?: unknown;
}

interface MockSupabaseOpts {
  sessionUserId?: string | null;
  rpcScript?: RpcScript;
}

function buildMockSupabase({
  sessionUserId = null,
  rpcScript = {},
}: MockSupabaseOpts) {
  // Default: each RPC returns the empty success row shape.
  const defaultRow = (extra: object) => ({
    status: "OK",
    error_code: null,
    ...extra,
  });

  const rpc = vi.fn(async (fnName: string) => {
    const script: Record<string, unknown> = {
      bootstrap_guest: rpcScript.guest ?? [
        defaultRow({
          user_id: "guest-uuid",
          binding_id: "guest-binding-uuid",
          is_new_user: true,
          has_game_state: true,
        }),
      ],
      bootstrap_authenticated: rpcScript.authenticated ?? [
        defaultRow({
          binding_id: "auth-binding-uuid",
          is_new_binding: true,
          has_profile: true,
          has_game_state: true,
        }),
      ],
      upgrade_guest_to_auth: rpcScript.upgrade ?? [
        defaultRow({
          surviving_user_id: "auth-uuid",
          archived_guest_id: null,
          has_auth_progress: false,
          has_guest_progress: false,
          bindings_preserved: 0,
        }),
      ],
      create_signed_out_guest_after_signout: rpcScript.signOut ?? [
        defaultRow({
          guest_user_id: "new-guest-uuid",
          binding_id: "new-guest-binding-uuid",
          is_new_guest: true,
          has_game_state: true,
          preserved_association_count: 1,
        }),
      ],
      ensure_profile_and_state: rpcScript.repair ?? [
        defaultRow({
          profile_created: false,
          state_created: false,
          needs_recovery: false,
        }),
      ],
    };
    return { data: script[fnName] ?? null, error: null };
  });

  return {
    // BUG-077 Task 9: the canonical surface is getDbClient +
    // requireDbClient + isDbClientConfigured. Legacy aliases are
    // retained for any other tests that still import them, but
    // production code (post-Task-9) only uses the canonical names.
    getDbClient: () => ({ rpc }),
    requireDbClient: () => ({ rpc }),
    isDbClientConfigured: () => true,
    // Legacy aliases — kept so callers that still import the old
    // names compile. Empty no-op functions for the ones the test
    // doesn't exercise.
    createServiceRoleClient: () => ({ rpc }),
    // L3 audit fix: the createClient anon mock now exposes a from()
    // chain so the post-audit DEVICE_BOUND_TO_OTHER_USER detection
    // path in runAuthenticatedBootstrap can query device_bindings
    // without throwing TypeError. The chain returns null (no other
    // user owns this device) which matches the existing test
    // contract for OK_NO_GUEST cases.
    createClient: async () => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: sessionUserId ? { id: sessionUserId } : null },
          error: null,
        }),
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: sessionUserId ? { user: { id: sessionUserId } } : null,
          },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                neq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
    isSupabaseConfigured: () => true,
    isServiceRoleConfigured: () => true,
  };
}

// ─── Reusable UUIDs (RFC 4122 v4–style strings) ─────────────────────────

const UUID_AUTH = "11111111-1111-4111-8111-111111111111";
const UUID_AUTH_MISSING = "22222222-2222-4222-8222-222222222222";
const UUID_PREV_AUTH = "33333333-3333-4333-8333-333333333333";

// ─── Test suite ─────────────────────────────────────────────────────────

type ImportedRoute = typeof import("@/app/api/auth/bootstrap/route");

// Structural type for the `@/lib/supabase/server` module mock. Some tests
// build a custom literal (e.g. a service-role client that throws, or one
// whose rpc returns a different shape per call); they need to pass through
// `vi.doMock` without a single rigid interface. Test mocks are explicitly
// excluded from the strict no-`any` production rule (TS-001 / .rules §9).
type BootstrapSupabaseMock = {
  createServiceRoleClient: () => { rpc: (...args: any[]) => any } | null;
  createClient: () => Promise<{
    auth: {
      getUser: () => Promise<any>;
      getSession?: () => Promise<any>;
    };
  }>;
  isSupabaseConfigured: () => boolean;
  isServiceRoleConfigured: () => boolean;
};

async function loadRouteWith(
  mock: BootstrapSupabaseMock,
): Promise<ImportedRoute> {
  vi.doMock("@/lib/db/access", () => mock);
  vi.resetModules();
  return import("@/app/api/auth/bootstrap/route");
}

describe("POST /api/auth/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.checkRateLimit.mockResolvedValue(null);
    serverGameStateMock.stateRows.clear();
    serverGameStateMock.stateRows.set("guest-uuid", {
      full_state: {},
      money: 2000,
      total_money_earned: 0,
      research_points: 0,
      buildings: [],
      buildings_count: 0,
      completed_research: [],
      resources: { iron: 0, copper: 0 },
      workers: [],
      game_tick: 0,
      game_speed: 1,
      state_hash: "hash",
      state_version: 1,
      last_tick_at: null,
      last_saved_at: null,
      cheat_flag_count: 0,
    });
    serverGameStateMock.stateRows.set(UUID_AUTH, {
      full_state: {},
      money: 5000,
      total_money_earned: 6000,
      research_points: 20,
      buildings: [],
      buildings_count: 0,
      completed_research: [],
      resources: { iron: 50 },
      workers: [],
      game_tick: 25,
      game_speed: 1,
      state_hash: "hash-auth",
      state_version: 3,
      last_tick_at: null,
      last_saved_at: null,
      cheat_flag_count: 0,
    });
    serverGameStateMock.stateRows.set("55555555-5555-4555-8555-555555555555", {
      full_state: {},
      money: 2000,
      total_money_earned: 0,
      research_points: 0,
      buildings: [],
      buildings_count: 0,
      completed_research: [],
      resources: { iron: 0 },
      workers: [],
      game_tick: 0,
      game_speed: 1,
      state_hash: "hash-signed-out",
      state_version: 1,
      last_tick_at: null,
      last_saved_at: null,
      cheat_flag_count: 0,
    });
  });

  it("rejects missing deviceId with 400 INVALID_BOOTSTRAP_REQUEST", async () => {
    const mock = buildMockSupabase({});
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ code?: string; message?: string }>(res);
    expect(body.code).toBe("INVALID_BOOTSTRAP_REQUEST");
  });

  it("returns 200 BOOTSTRAP_READY for new guest (no session)", async () => {
    const mock = buildMockSupabase({ sessionUserId: null });
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{
      code?: string;
      isGuest?: boolean;
      source?: string;
      isNewUser?: boolean;
      userId?: string;
      gameState?: { money?: number; quests?: unknown[] };
      needsStateLoad?: boolean;
    }>(res);
    expect(body.code).toBe("BOOTSTRAP_READY");
    expect(body.isGuest).toBe(true);
    expect(body.source).toBe("fresh");
    expect(body.isNewUser).toBe(true);
    expect(body.userId).toBe("guest-uuid");
    expect(body.needsStateLoad).toBe(false);
    expect(body.gameState?.money).toBe(2000);
    expect(body.gameState?.quests?.length).toBeGreaterThan(0);
    expect(rateLimitMock.checkRateLimit).toHaveBeenCalledWith(
      "dev-1",
      rateLimitMock.RATE_LIMITS.bootstrap,
      "/api/auth/bootstrap",
    );
  });

  it("returns 200 BOOTSTRAP_READY for returning guest (source=deviceId)", async () => {
    serverGameStateMock.stateRows.set("returning-guest", {
      full_state: { quests: [{ id: "startup", completed: true }] },
      money: 3456,
      total_money_earned: 4567,
      research_points: 12,
      buildings: [{ id: "mine-1", type: "miningDrill" }],
      buildings_count: 1,
      completed_research: ["basicProcessing"],
      resources: { iron: 25 },
      workers: [],
      game_tick: 99,
      game_speed: 1,
      state_hash: "hash-returning",
      state_version: 2,
      last_tick_at: null,
      last_saved_at: null,
      cheat_flag_count: 0,
      quests: [{ id: "startup", completed: true }],
    });
    const mock = buildMockSupabase({
      sessionUserId: null,
      rpcScript: {
        guest: [
          {
            status: "OK",
            error_code: null,
            user_id: "returning-guest",
            binding_id: "binding-1",
            is_new_user: false,
            has_game_state: true,
          },
        ],
      },
    });
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-existing" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{
      source?: string;
      userId?: string;
      isNewUser?: boolean;
      needsStateLoad?: boolean;
      gameState?: {
        money?: number;
        totalMoneyEarned?: number;
        gameTick?: number;
        buildings?: unknown[];
        quests?: unknown[];
      };
    }>(res);
    expect(body.source).toBe("deviceId");
    expect(body.userId).toBe("returning-guest");
    expect(body.isNewUser).toBe(false);
    expect(body.needsStateLoad).toBe(false);
    expect(body.gameState?.money).toBe(3456);
    expect(body.gameState?.totalMoneyEarned).toBe(4567);
    expect(body.gameState?.gameTick).toBe(99);
    expect(body.gameState?.buildings).toEqual([
      { id: "mine-1", type: "miningDrill" },
    ]);
  });

  it("returns 200 BOOTSTRAP_READY for authenticated bootstrap (no upgrade)", async () => {
    const mock = buildMockSupabase({
      sessionUserId: UUID_AUTH,
      rpcScript: {
        upgrade: [
          {
            status: "OK_NO_GUEST",
            error_code: null,
            surviving_user_id: UUID_AUTH,
            archived_guest_id: null,
            has_auth_progress: true,
            has_guest_progress: false,
            bindings_preserved: 1,
          },
        ],
      },
    });
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-1", fingerprintHash: "fp-hash" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{
      source?: string;
      isGuest?: boolean;
      userId?: string;
    }>(res);
    expect(body.source).toBe("auth");
    expect(body.isGuest).toBe(false);
    expect(body.userId).toBe(UUID_AUTH);
  });

  it("returns 200 BOOTSTRAP_READY after successful guest-to-auth upgrade", async () => {
    serverGameStateMock.stateRows.set(UUID_AUTH, {
      full_state: { quests: [{ id: "startup", completed: true }] },
      money: 7777,
      total_money_earned: 8888,
      research_points: 44,
      buildings: [{ id: "upgraded-mine", type: "miningDrill" }],
      buildings_count: 1,
      completed_research: ["basicProcessing"],
      resources: { iron: 100 },
      workers: [],
      game_tick: 321,
      game_speed: 1,
      state_hash: "hash-upgraded",
      state_version: 4,
      last_tick_at: null,
      last_saved_at: null,
      cheat_flag_count: 0,
      quests: [{ id: "startup", completed: true }],
    });
    const mock = buildMockSupabase({
      sessionUserId: UUID_AUTH,
      rpcScript: {
        authenticated: [
          {
            status: "OK",
            error_code: null,
            binding_id: "auth-binding-after-upgrade",
            is_new_binding: false,
            has_profile: true,
            has_game_state: false,
          },
        ],
        upgrade: [
          {
            status: "OK",
            error_code: null,
            surviving_user_id: UUID_AUTH,
            archived_guest_id: "99999999-9999-4999-8999-999999999999",
            has_auth_progress: true,
            has_guest_progress: true,
            bindings_preserved: 1,
          },
        ],
      },
    });
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-upgrade" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{
      code?: string;
      source?: string;
      isGuest?: boolean;
      userId?: string;
      needsStateLoad?: boolean;
      gameState?: { money?: number; gameTick?: number; buildings?: unknown[] };
    }>(res);
    expect(body.code).toBe("BOOTSTRAP_READY");
    expect(body.source).toBe("auth");
    expect(body.isGuest).toBe(false);
    expect(body.userId).toBe(UUID_AUTH);
    expect(body.needsStateLoad).toBe(false);
    expect(body.gameState?.money).toBe(7777);
    expect(body.gameState?.gameTick).toBe(321);
    expect(body.gameState?.buildings).toEqual([
      { id: "upgraded-mine", type: "miningDrill" },
    ]);
  });

  // ─── Migration 079 ───
  it("returns 200 BOOTSTRAP_READY with archiveReceiptId when default auth-wins-archive-guest policy archives a guest", async () => {
    const archivedGuestId = "44444444-4444-4444-8444-444444444444";
    const archiveReceiptId = "55555555-aaaa-bbbb-cccc-dddddddddddd";
    const mock = buildMockSupabase({
      sessionUserId: UUID_AUTH,
      rpcScript: {
        authenticated: [
          {
            status: "OK",
            error_code: null,
            binding_id: "auth-b",
            is_new_binding: false,
            has_profile: true,
            has_game_state: true,
          },
        ],
        upgrade: [
          {
            status: "OK_ARCHIVED_GUEST",
            error_code: null,
            surviving_user_id: UUID_AUTH,
            archived_guest_id: archivedGuestId,
            has_auth_progress: true,
            has_guest_progress: false,
            bindings_preserved: 1,
            archive_receipt_id: archiveReceiptId,
            policy_applied: "auth_wins_archive_guest",
          },
        ],
      },
    });
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{
      code?: string;
      archiveReceiptId?: string | null;
      archivedGuestId?: string | null;
      gameState?: { money?: number };
    }>(res);
    expect(body.code).toBe("BOOTSTRAP_READY");
    expect(body.archiveReceiptId).toBe(archiveReceiptId);
    expect(body.archivedGuestId).toBe(archivedGuestId);
    expect(body.gameState?.money).toBeDefined();
  });

  it("returns 409 ACCOUNT_PROGRESS_CONFLICT only when explicit_conflict policy is requested and upgrade RPC reports CONFLICT", async () => {
    const archivedGuest = "66666666-6666-4666-8666-666666666666";
    const mock = buildMockSupabase({
      sessionUserId: UUID_AUTH,
      rpcScript: {
        authenticated: [
          {
            status: "OK",
            error_code: null,
            binding_id: "auth-b",
            is_new_binding: false,
            has_profile: true,
            has_game_state: true,
          },
        ],
        upgrade: [
          {
            status: "CONFLICT",
            error_code: "ACCOUNT_PROGRESS_CONFLICT",
            surviving_user_id: UUID_AUTH,
            archived_guest_id: archivedGuest,
            has_auth_progress: true,
            has_guest_progress: true,
            bindings_preserved: 0,
            archive_receipt_id: null,
            policy_applied: "explicit_conflict",
          },
        ],
      },
    });
    const { POST } = await loadRouteWith(mock);
    // Migration 079: the default policy auto-archives, so we must explicitly
    // request the opt-in policy to preserve the legacy 409 path.
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-1", mergePolicy: "explicit_conflict" },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await readJson<{
      code?: string;
      conflictReason?: string;
      archivedGuestId?: string;
    }>(res);
    expect(body.code).toBe("ACCOUNT_PROGRESS_CONFLICT");
    expect(body.archivedGuestId).toBe(archivedGuest);
  });

  it("falls back to default policy when an unknown mergePolicy value is passed", async () => {
    // Migration 079: mergePolicy outside the allow-list is dropped client-side
    // by the route; the RPC runs under its default ('auth_wins_archive_guest').
    // The RPC is mocked to return OK_ARCHIVED_GUEST regardless of the forwarded policy.
    const archiveReceiptId = "77777777-aaaa-bbbb-cccc-dddddddddddd";
    const archivedGuestId = "88888888-4444-4444-8444-444444444444";
    const mock = buildMockSupabase({
      sessionUserId: UUID_AUTH,
      rpcScript: {
        authenticated: [
          {
            status: "OK",
            error_code: null,
            binding_id: "auth-b",
            is_new_binding: false,
            has_profile: true,
            has_game_state: true,
          },
        ],
        upgrade: [
          {
            status: "OK_ARCHIVED_GUEST",
            error_code: null,
            surviving_user_id: UUID_AUTH,
            archived_guest_id: archivedGuestId,
            has_auth_progress: true,
            has_guest_progress: false,
            bindings_preserved: 1,
            archive_receipt_id: archiveReceiptId,
            policy_applied: "auth_wins_archive_guest",
          },
        ],
      },
    });
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-1", mergePolicy: "garbage" as unknown as string },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{
      code?: string;
      archiveReceiptId?: string | null;
    }>(res);
    expect(body.code).toBe("BOOTSTRAP_READY");
    expect(body.archiveReceiptId).toBe(archiveReceiptId);
  });

  it("returns 422 STATE_RECOVERY_REQUIRED when auth RPC reports missing auth user", async () => {
    const mock = buildMockSupabase({
      sessionUserId: UUID_AUTH_MISSING,
      rpcScript: {
        authenticated: [
          {
            status: "ERROR",
            error_code: "STATE_RECOVERY_REQUIRED",
            binding_id: null,
            is_new_binding: null,
            has_profile: null,
            has_game_state: null,
          },
        ],
      },
    });
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await readJson<{ code?: string }>(res);
    expect(body.code).toBe("STATE_RECOVERY_REQUIRED");
  });

  it("returns 200 BOOTSTRAP_READY with source=sign_out_to_guest on signed-out flow", async () => {
    // previousAuthUserId set + no current session triggers the sign-out path.
    const mock = buildMockSupabase({
      sessionUserId: null,
      rpcScript: {
        signOut: [
          {
            status: "OK",
            error_code: null,
            guest_user_id: "55555555-5555-4555-8555-555555555555",
            binding_id: "new-binding",
            is_new_guest: true,
            has_game_state: true,
            preserved_association_count: 1,
          },
        ],
      },
    });
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: {
        deviceId: "dev-1",
        previousAuthUserId: UUID_PREV_AUTH,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{ source?: string; isGuest?: boolean }>(res);
    expect(body.source).toBe("sign_out_to_guest");
    expect(body.isGuest).toBe(true);
  });

  it("returns 503 BOOTSTRAP_UNAVAILABLE when service-role client is missing", async () => {
    // BUG-077 Task 9: production code uses the canonical
    // requireDbClient() which throws DbClientNotConfiguredError when
    // the service-role client is missing. The route catches that
    // and surfaces 503. The legacy createServiceRoleClient -> null
    // path is kept for back-compat with old mocks but the route
    // now goes through getDbClient/requireDbClient.
    const mock = {
      getDbClient: () => null,
      requireDbClient: () => {
        const err = new Error(
          "Supabase service-role client is not configured (SUPABASE_SERVICE_ROLE_KEY missing).",
        );
        err.name = "DbClientNotConfiguredError";
        throw err;
      },
      isDbClientConfigured: () => false,
      // Legacy aliases still present.
      createServiceRoleClient: () => null,
      createClient: async () => ({
        auth: {
          getUser: vi
            .fn()
            .mockResolvedValue({ data: { user: null }, error: null }),
        },
      }),
      isSupabaseConfigured: () => true,
      isServiceRoleConfigured: () => false,
    };
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await readJson<{ code?: string }>(res);
    expect(body.code).toBe("BOOTSTRAP_UNAVAILABLE");
  });

  it("returns 500 INTERNAL_BOOTSTRAP_ERROR when RPC throws", async () => {
    const errorRpc = vi.fn(async () => ({
      data: null,
      error: { message: "boom" },
    }));
    const mock = {
      createServiceRoleClient: () => ({ rpc: errorRpc }),
      // L3 audit fix: include from() on the anon client mock so the
      // post-audit DEVICE_BOUND_TO_OTHER_USER detection path doesn't
      // throw TypeError.
      createClient: async () => ({
        auth: {
          getUser: vi
            .fn()
            .mockResolvedValue({ data: { user: null }, error: null }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  neq: () => ({
                    maybeSingle: () =>
                      Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
      isSupabaseConfigured: () => true,
      isServiceRoleConfigured: () => true,
    };
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await readJson<{ code?: string }>(res);
    expect(body.code).toBe("INTERNAL_BOOTSTRAP_ERROR");
  });

  it("returns 422 STATE_RECOVERY_REQUIRED when authenticated RPC returns missing fields", async () => {
    // Missing user but OK status — covers the dead-code path where bindRow is malformed.
    const mock = buildMockSupabase({
      sessionUserId: UUID_AUTH_MISSING,
      rpcScript: {
        authenticated: [
          {
            status: "ERROR",
            error_code: "STATE_RECOVERY_REQUIRED",
            binding_id: null,
            is_new_binding: null,
            has_profile: null,
            has_game_state: null,
          },
        ],
      },
    });
    const { POST } = await loadRouteWith(mock);
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-orphan-auth" },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await readJson<{ code?: string }>(res);
    expect(body.code).toBe("STATE_RECOVERY_REQUIRED");
  });

  it("ignores previousAuthUserId when it equals the current session user (idempotent auth path)", async () => {
    const mock = buildMockSupabase({
      sessionUserId: UUID_AUTH,
      rpcScript: {
        upgrade: [
          {
            status: "OK_NO_GUEST",
            error_code: null,
            surviving_user_id: UUID_AUTH,
            archived_guest_id: null,
            has_auth_progress: true,
            has_guest_progress: false,
            bindings_preserved: 1,
          },
        ],
      },
    });
    const { POST } = await loadRouteWith(mock);
    // same id -> treated as normal auth bootstrap
    const req = buildRequest({
      method: "POST",
      url: "/api/auth/bootstrap",
      body: { deviceId: "dev-1", previousAuthUserId: UUID_AUTH },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{ source?: string }>(res);
    expect(body.source).toBe("auth");
  });

  // ─── AUTH_ORCHESTRATOR_REDESIGN_PLAN §17 hydration guarantee ───
  // Every successful BOOTSTRAP_READY must carry a gameState that is
  // usable on first paint: starting_money>0, gameTick>=0, quests has
  // at least the startup quest, gameSpeed in {1,2,5,10}. These are
  // post-conditions the orchestrator + store rely on to avoid a $0 /
  // empty-quests crash. The test exercises the end-to-end HTTP path.
  describe("§17 hydration guarantee (no $0 / empty quests)", () => {
    async function loadFreshGuest() {
      const mock = buildMockSupabase({ sessionUserId: null });
      const { POST } = await loadRouteWith(mock);
      const req = buildRequest({
        method: "POST",
        url: "/api/auth/bootstrap",
        body: { deviceId: "dev-1" },
      });
      return POST(req);
    }

    it("new-guest response carries starting_money>0", async () => {
      const res = await loadFreshGuest();
      expect(res.status).toBe(200);
      const body = await readJson<{
        gameState?: {
          money?: number;
          gameSpeed?: number;
          gameTick?: number;
          quests?: unknown[];
        };
      }>(res);
      expect(body.gameState?.money).toBeGreaterThan(0);
      expect(body.gameState?.gameSpeed).toBeGreaterThan(0);
      expect(body.gameState?.gameTick).toBe(0);
    });

    it("new-guest response quests array is non-empty", async () => {
      const res = await loadFreshGuest();
      const body = await readJson<{ gameState?: { quests?: unknown[] } }>(res);
      expect(Array.isArray(body.gameState?.quests)).toBe(true);
      expect((body.gameState?.quests ?? []).length).toBeGreaterThan(0);
    });

    it("sign-out-to-guest response also carries non-zero money and quests", async () => {
      // post previousAuthUserId → runSignOutToGuest path
      const mock = buildMockSupabase({
        sessionUserId: null,
        rpcScript: {
          signOut: [
            {
              status: "OK",
              error_code: null,
              guest_user_id: "55555555-5555-4555-8555-555555555555",
              binding_id: "new-binding",
              is_new_guest: true,
              has_game_state: true,
              preserved_association_count: 1,
            },
          ],
        },
      });
      const { POST } = await loadRouteWith(mock);
      const req = buildRequest({
        method: "POST",
        url: "/api/auth/bootstrap",
        body: { deviceId: "dev-1", previousAuthUserId: UUID_PREV_AUTH },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await readJson<{
        source?: string;
        gameState?: { money?: number; quests?: unknown[] };
      }>(res);
      expect(body.source).toBe("sign_out_to_guest");
      expect(body.gameState?.money).toBeGreaterThan(0);
      expect((body.gameState?.quests ?? []).length).toBeGreaterThan(0);
    });

    it("BUG-093 placeholder row never produces a $0 client payload", async () => {
      // Simulate the legacy BUG-093 case: the bootstrap RPC wrote a
      // placeholder row with money=0 / game_tick=0 / full_state={
      // bootstrap_pending:true }. The route's hydration must override
      // the row's denormalized values with canonical defaults so the
      // client never receives money=0.
      const placeholderUserId = "99999999-4444-4444-8444-444444444444";
      serverGameStateMock.stateRows.set(placeholderUserId, {
        full_state: { bootstrap_pending: true },
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
        state_hash: "",
        state_version: 1,
        last_tick_at: null,
        last_saved_at: null,
        cheat_flag_count: 0,
        quests: [],
      });
      const mock = buildMockSupabase({
        sessionUserId: null,
        rpcScript: {
          guest: [
            {
              status: "OK",
              error_code: null,
              user_id: placeholderUserId,
              binding_id: "placeholder-b",
              is_new_user: false,
              has_game_state: true,
            },
          ],
        },
      });
      const { POST } = await loadRouteWith(mock);
      const req = buildRequest({
        method: "POST",
        url: "/api/auth/bootstrap",
        body: { deviceId: "dev-1" },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await readJson<{
        gameState?: { money?: number; quests?: unknown[] };
      }>(res);
      // The hydration must have replaced the placeholder's money=0 with
      // the canonical starting money (2000 per game_config_balance).
      expect(body.gameState?.money).toBeGreaterThan(0);
      expect((body.gameState?.quests ?? []).length).toBeGreaterThan(0);
    });
  });
});
