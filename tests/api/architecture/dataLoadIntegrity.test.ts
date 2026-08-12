/**
 * tests/api/architecture/dataLoadIntegrity.test.ts
 *
 * End-to-end architecture integration tests for the data-loading path:
 *
 *   1. Returning player loads exact saved gameplay data
 *   2. Brand-new player bootstrap creates profile + state once
 *   3. Guest-to-Auth upgrade preserves gameplay ownership
 *   4. Existing-account conflict does NOT silently overwrite either state
 *
 * Pattern mirrors tests/api/auth/bootstrap.test.ts (proven wire-up):
 *   - vi.mock @/lib/auth/rateLimiter
 *   - vi.hoisted mock object for @/lib/db/game/serverGameState
 *   - vi.mock @/app/api/auth/_shared/request-ip-log-helper
 *   - vi.doMock @/lib/db/access  per test  (with vi.resetModules)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRequest, readJson } from "../helpers/request";

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
  buildCompleteFullStateForServerRow: vi.fn(
    async (row: Record<string, unknown>) => ({
      money: Number(row.money),
      totalMoneyEarned: Number(row.total_money_earned),
      researchPoints: Number(row.research_points),
      buildings: row.buildings ?? [],
      completedResearch: row.completed_research ?? [],
      resources: row.resources ?? {},
      workers: row.workers ?? [],
      gameTick: Number(row.game_tick),
      gameSpeed: Number(row.game_speed),
      stateVersion: Number(row.state_version),
      quests: row.quests ?? [],
    }),
  ),
}));

vi.mock("@/lib/db/game/serverGameState", () => ({
  loadServerGameStateLite: serverGameStateMock.loadServerGameStateLite,
  buildCompleteFullStateForServerRow:
    serverGameStateMock.buildCompleteFullStateForServerRow,
}));

vi.mock("@/app/api/auth/_shared/request-ip-log-helper", () => ({
  logRequestIp: vi.fn(),
  hashIp: vi.fn(() => "hashed"),
  extractClientIp: vi.fn(() => "127.0.0.1"),
}));

// ─── Supabase mock factory (matches bootstrap.test.ts exactly) ──────────

interface RpcScript {
  guest?: unknown[];
  authenticated?: unknown[];
  upgrade?: unknown[];
  signOut?: unknown[];
}

interface MockSupabaseOpts {
  sessionUserId?: string | null;
  rpcScript?: RpcScript;
}

function buildMockSupabase({
  sessionUserId = null,
  rpcScript = {},
}: MockSupabaseOpts) {
  const defaultRow = (extra: object) => ({
    status: "OK",
    error_code: null,
    ...extra,
  });
  const rpc = vi.fn(async (fnName: string) => {
    const script: Record<string, unknown> = {
      bootstrap_guest: rpcScript.guest ?? [
        defaultRow({
          user_id: "fallback-guest",
          binding_id: "fallback-guest-binding",
          is_new_user: true,
          has_game_state: false,
        }),
      ],
      bootstrap_authenticated: rpcScript.authenticated ?? [
        defaultRow({
          binding_id: "fallback-auth-binding",
          is_new_binding: true,
          has_profile: false,
          has_game_state: false,
        }),
      ],
      upgrade_guest_to_auth: rpcScript.upgrade ?? [
        defaultRow({
          surviving_user_id: "fallback-auth",
          archived_guest_id: null,
          has_auth_progress: false,
          has_guest_progress: false,
          bindings_preserved: 0,
        }),
      ],
      create_signed_out_guest_after_signout: rpcScript.signOut ?? [
        defaultRow({
          guest_user_id: "fallback-signed-out-guest",
          binding_id: "fallback-signed-out-binding",
          is_new_guest: true,
          has_game_state: false,
          preserved_association_count: 1,
        }),
      ],
      // ensure_profile_and_state is called when upgrade leaves the
      // auth user without a row. The route uses this to repair the
      // empty state path. Default to a successful OK row so the
      // upgrade flow completes.
      ensure_profile_and_state: [
        defaultRow({
          status: "OK",
        }),
      ],
    };
    const data = script[fnName] ?? null;
    // Simulate the upgrade_guest_to_auth RPC's side-effect: when
    // status === 'OK' and the row carries `has_guest_progress: true`
    // with `archived_guest_id`, copy the guest's state into the
    // surviving auth row. The route then reads the auth row back via
    // `loadServerGameStateLite(surviving_user_id)`.
    if (fnName === "upgrade_guest_to_auth" && Array.isArray(data) && data[0]) {
      const row = data[0] as {
        status?: string;
        archived_guest_id?: string | null;
        surviving_user_id?: string;
        has_guest_progress?: boolean;
      };
      if (
        row.status === "OK" &&
        row.has_guest_progress &&
        row.archived_guest_id &&
        row.surviving_user_id
      ) {
        const guest = serverGameStateMock.stateRows.get(
          row.archived_guest_id,
        );
        if (guest) {
          serverGameStateMock.stateRows.set(row.surviving_user_id, {
            ...guest,
          });
        }
      }
    }
    return { data, error: null };
  });
  // `from()` returns a chainable mock that resolves to the state map
  // entries seeded by `serverGameStateMock.stateRows`. Only the
  // `.from(table).select(cols).eq(col, val)` shape is supported, which
  // is enough for `server_game_state` reads.
  const from = vi.fn((table: string) => {
    const stateRows = serverGameStateMock.stateRows;
    // Every chainable method returns `builder` so successive filters
    // resolve in any order. The terminal `.eq(col, val)` returns the
    // resolved data (matches the shape Supabase returns).
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      neq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      is: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      or: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: (resolve: (v: { data: unknown; error: null }) => void) => {
        // Default: resolve with empty data for queries on `server_game_state`.
        // The bootstrap test mocks read state through
        // `serverGameStateMock.loadServerGameStateLite`, so this from()
        // chain is only consulted for device_bindings lookups which
        // intentionally return nothing in this test.
        const data = table === "server_game_state" ? (stateRows ?? null) : null;
        resolve({ data, error: null });
      },
    };
    return builder;
  });
  return {
    // BUG-077 Task 9: canonical surface is getDbClient +
    // requireDbClient + isDbClientConfigured. Legacy aliases kept
    // so other tests still import them. Production code (post
    // Task 9) only uses the canonical names.
    //
    // The mock returns an object with both `rpc()` (for the bootstrap
    // RPCs) AND `from()` (for the post-RPC state reads). Tests that
    // only need RPCs ignore `.from`; tests that read state rely on
    // `.from().select()` returning the row map built below.
    getDbClient: () => ({ rpc, from }),
    requireDbClient: () => ({ rpc, from }),
    isDbClientConfigured: () => true,
    createServiceRoleClient: () => ({ rpc, from }),
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
      from,
      rpc,
    }),
    isSupabaseConfigured: () => true,
    isServiceRoleConfigured: () => true,
  };
}

type BootstrapSupabaseMock = {
  createServiceRoleClient: () => {
    rpc: (...args: unknown[]) => unknown;
  } | null;
  createClient: () => Promise<{
    auth: {
      getUser: () => Promise<unknown>;
      getSession?: () => Promise<unknown>;
    };
  }>;
  isSupabaseConfigured: () => boolean;
  isServiceRoleConfigured: () => boolean;
};

async function loadRouteWith(mock: BootstrapSupabaseMock) {
  vi.doMock("@/lib/db/access", () => mock);
  vi.resetModules();
  return import("@/app/api/auth/bootstrap/route");
}

// ─── Stable UUIDs (RFC 4122 v4) ─────────────────────────────────────────

const UUID_AUTH_RETURNING = "11111111-1111-4111-8111-111111111111";
const UUID_AUTH_FOR_CONFLICT = "33333333-3333-4333-8333-333333333333";
const UUID_GUEST_FOR_UPGRADE = "44444444-4444-4444-8444-444444444444";

// ─── Test fixtures ───────────────────────────────────────────────────────

const RETURNING_STATE = {
  full_state: { quests: [{ id: "startup", completed: true }] },
  money: 8500,
  total_money_earned: 12_000,
  research_points: 80,
  buildings: [
    { id: "mine-1", type: "ironMine", level: 3 },
    { id: "plant-1", type: "powerPlant", level: 2 },
  ],
  buildings_count: 2,
  completed_research: ["basicProcessing", "advancedLogistics"],
  resources: { iron: 250, copper: 175 },
  workers: [{ id: "w-1", type: "engineer" }],
  game_tick: 900,
  game_speed: 1,
  state_hash: "hash-returning",
  state_version: 7,
  last_tick_at: null,
  last_saved_at: null,
  cheat_flag_count: 0,
  quests: [{ id: "startup", completed: true }],
};

const NEW_USER_STATE = {
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
  state_hash: "hash-canonical",
  state_version: 1,
  last_tick_at: null,
  last_saved_at: null,
  cheat_flag_count: 0,
};

// ─── Tests ───────────────────────────────────────────────────────────────

describe("architecture/dataLoadIntegrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.checkRateLimit.mockResolvedValue(null);
    serverGameStateMock.stateRows.clear();
    serverGameStateMock.stateRows.set(UUID_AUTH_RETURNING, {
      ...RETURNING_STATE,
    });
    serverGameStateMock.stateRows.set(UUID_AUTH_FOR_CONFLICT, {
      ...RETURNING_STATE,
      money: 4000,
    });
    serverGameStateMock.stateRows.set(UUID_GUEST_FOR_UPGRADE, {
      ...RETURNING_STATE,
      money: 4200,
      game_tick: 444,
      buildings: [{ id: "g-mine", type: "ironMine", level: 1 }],
      completed_research: ["basicProcessing"],
      state_version: 2,
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 1. Returning player — exact saved gameplay loads on bootstrap.
  // ════════════════════════════════════════════════════════════════════
  describe("1. Returning player", () => {
    it("loads exact saved gameplay data; nothing is rewritten", async () => {
      const mock = buildMockSupabase({
        sessionUserId: UUID_AUTH_RETURNING,
        rpcScript: {
          authenticated: [
            {
              status: "OK",
              error_code: null,
              binding_id: "auth-b-returning",
              is_new_binding: false,
              has_profile: true,
              has_game_state: true,
            },
          ],
          upgrade: [
            {
              status: "OK_NO_GUEST",
              error_code: null,
              surviving_user_id: UUID_AUTH_RETURNING,
              archived_guest_id: null,
              has_auth_progress: true,
              has_guest_progress: false,
              bindings_preserved: 1,
            },
          ],
        },
      });
      const { POST } = await loadRouteWith(
        mock as unknown as BootstrapSupabaseMock,
      );
      const req = buildRequest({
        method: "POST",
        url: "/api/auth/bootstrap",
        body: { deviceId: "dev-returning" },
      });
      const res = await POST(req);
      const body = await readJson<{
        userId?: string;
        isNewUser?: boolean;
        needsStateLoad?: boolean;
        source?: string;
        gameState?: {
          money?: number;
          totalMoneyEarned?: number;
          gameTick?: number;
          stateVersion?: number;
          buildings?: unknown[];
          workers?: unknown[];
          resources?: Record<string, number>;
          completedResearch?: string[];
        };
      }>(res);

      expect(res.status).toBe(200);
      expect(body.userId).toBe(UUID_AUTH_RETURNING);
      expect(body.isNewUser).toBe(false);
      expect(body.source).toBe("auth");
      expect(body.needsStateLoad).toBe(false);
      expect(body.gameState?.money).toBe(8500);
      expect(body.gameState?.totalMoneyEarned).toBe(12_000);
      expect(body.gameState?.gameTick).toBe(900);
      expect(body.gameState?.stateVersion).toBe(7);
      expect(body.gameState?.buildings).toHaveLength(2);
      expect(body.gameState?.workers).toHaveLength(1);
      expect(body.gameState?.resources).toEqual({ iron: 250, copper: 175 });
      expect(body.gameState?.completedResearch).toEqual([
        "basicProcessing",
        "advancedLogistics",
      ]);
    });

    it("is idempotent — repeated bootstrap returns identical values", async () => {
      const buildMock = () =>
        buildMockSupabase({
          sessionUserId: UUID_AUTH_RETURNING,
          rpcScript: {
            authenticated: [
              {
                status: "OK",
                error_code: null,
                binding_id: "auth-b-returning",
                is_new_binding: false,
                has_profile: true,
                has_game_state: true,
              },
            ],
            upgrade: [
              {
                status: "OK_NO_GUEST",
                error_code: null,
                surviving_user_id: UUID_AUTH_RETURNING,
                has_auth_progress: true,
                has_guest_progress: false,
                bindings_preserved: 1,
              },
            ],
          },
        });
      const { POST: POST1 } = await loadRouteWith(
        buildMock() as unknown as BootstrapSupabaseMock,
      );
      const { POST: POST2 } = await loadRouteWith(
        buildMock() as unknown as BootstrapSupabaseMock,
      );
      const req = () =>
        buildRequest({
          method: "POST",
          url: "/api/auth/bootstrap",
          body: { deviceId: "dev-returning" },
        });
      const r1 = await readJson<{
        gameState?: { money?: number; gameTick?: number };
      }>(await POST1(req()));
      const r2 = await readJson<{
        gameState?: { money?: number; gameTick?: number };
      }>(await POST2(req()));
      expect(r1.gameState?.money).toBe(8500);
      expect(r2.gameState?.money).toBe(8500);
      expect(r1.gameState?.gameTick).toBe(r2.gameState?.gameTick);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. Brand-new player bootstrap (canonical money, no placeholder)
  // ════════════════════════════════════════════════════════════════════
  describe("2. Brand-new player", () => {
    it("creates canonical state with starting_money, no zero placeholder", async () => {
      const newGuestId = "99999999-4444-4444-8444-444444444444";
      serverGameStateMock.stateRows.set(newGuestId, { ...NEW_USER_STATE });
      const mock = buildMockSupabase({
        sessionUserId: null,
        rpcScript: {
          guest: [
            {
              status: "OK",
              error_code: null,
              user_id: newGuestId,
              binding_id: "new-guest-binding",
              is_new_user: true,
              has_game_state: true,
            },
          ],
        },
      });
      const { POST } = await loadRouteWith(
        mock as unknown as BootstrapSupabaseMock,
      );
      const req = buildRequest({
        method: "POST",
        url: "/api/auth/bootstrap",
        body: { deviceId: "dev-fresh" },
      });
      const res = await POST(req);
      const body = await readJson<{
        isNewUser?: boolean;
        source?: string;
        userId?: string;
        gameState?: {
          money?: number;
          totalMoneyEarned?: number;
          gameTick?: number;
        };
      }>(res);
      expect(res.status).toBe(200);
      expect(body.source).toBe("fresh");
      expect(body.isNewUser).toBe(true);
      expect(body.userId).toBe(newGuestId);
      // Canonical starting money, not zero placeholder.
      expect(body.gameState?.money).toBe(2000);
      expect(body.gameState?.totalMoneyEarned).toBe(0);
      expect(body.gameState?.gameTick).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 3. Guest-to-Auth upgrade — gameplay transferred, no duplicate.
  // ════════════════════════════════════════════════════════════════════
  describe("3. Guest-to-Auth upgrade", () => {
    it("preserves gameplay data under auth user_id after upgrade", async () => {
      // Seed both rows in the mock state map (the upgrade RPC moves
      // ownership server-side; the route just reads the auth row).
      const mock = buildMockSupabase({
        sessionUserId: UUID_AUTH_RETURNING,
        rpcScript: {
          authenticated: [
            {
              status: "OK",
              error_code: null,
              binding_id: "auth-after-upgrade",
              is_new_binding: false,
              has_profile: true,
              has_game_state: true,
            },
          ],
          upgrade: [
            {
              status: "OK",
              error_code: null,
              surviving_user_id: UUID_AUTH_RETURNING,
              archived_guest_id: UUID_GUEST_FOR_UPGRADE,
              has_auth_progress: false,
              has_guest_progress: true,
              bindings_preserved: 1,
              archive_receipt_id: "rcpt-upgrade",
              policy_applied: "auth_wins_archive_guest",
            },
          ],
        },
      });
      const { POST } = await loadRouteWith(
        mock as unknown as BootstrapSupabaseMock,
      );
      const req = buildRequest({
        method: "POST",
        url: "/api/auth/bootstrap",
        body: { deviceId: "dev-upgrade" },
      });
      const res = await POST(req);
      const body = await readJson<{
        userId?: string;
        gameState?: {
          money?: number;
          gameTick?: number;
          buildings?: unknown[];
          completedResearch?: string[];
        };
      }>(res);
      expect(res.status).toBe(200);
      expect(body.userId).toBe(UUID_AUTH_RETURNING);
      // Auth user is now the surviving identity; gameplay values match.
      expect(body.gameState?.money).toBe(4200);
      expect(body.gameState?.gameTick).toBe(444);
      expect(body.gameState?.buildings).toEqual([
        { id: "g-mine", type: "ironMine", level: 1 },
      ]);
      expect(body.gameState?.completedResearch).toEqual(["basicProcessing"]);
    });

    it("repeat callback does not duplicate the upgrade", async () => {
      const mock = buildMockSupabase({
        sessionUserId: UUID_AUTH_RETURNING,
        rpcScript: {
          authenticated: [
            {
              status: "OK",
              error_code: null,
              binding_id: "auth-1",
              is_new_binding: false,
              has_profile: true,
              has_game_state: true,
            },
          ],
          upgrade: [
            {
              status: "OK_NO_GUEST",
              error_code: null,
              surviving_user_id: UUID_AUTH_RETURNING,
              has_auth_progress: true,
              has_guest_progress: false,
              bindings_preserved: 1,
            },
          ],
        },
      });
      const { POST } = await loadRouteWith(
        mock as unknown as BootstrapSupabaseMock,
      );
      const req = () =>
        buildRequest({
          method: "POST",
          url: "/api/auth/bootstrap",
          body: { deviceId: "dev-1" },
        });
      const r1 = await readJson<{ gameState?: { money?: number } }>(await POST(req()));
      const r2 = await readJson<{ gameState?: { money?: number } }>(await POST(req()));
      // Auth row's money (seeded at 8500 in beforeEach) is unchanged
      // across repeats — has_guest_progress=false means no transfer.
      expect(r1.gameState?.money).toBe(8500);
      expect(r2.gameState?.money).toBe(8500);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 4. Existing-account conflict — 409, both states intact.
  // ════════════════════════════════════════════════════════════════════
  describe("4. Account progress conflict", () => {
    it("returns 409 and leaves both original states unchanged", async () => {
      const guestBefore = serverGameStateMock.stateRows.get(
        UUID_GUEST_FOR_UPGRADE,
      );
      const authBefore = serverGameStateMock.stateRows.get(
        UUID_AUTH_FOR_CONFLICT,
      );
      const mock = buildMockSupabase({
        sessionUserId: UUID_AUTH_FOR_CONFLICT,
        rpcScript: {
          authenticated: [
            {
              status: "OK",
              error_code: null,
              binding_id: "auth-conflict",
              is_new_binding: false,
              has_profile: true,
              has_game_state: true,
            },
          ],
          upgrade: [
            {
              status: "CONFLICT",
              error_code: "ACCOUNT_PROGRESS_CONFLICT",
              surviving_user_id: UUID_AUTH_FOR_CONFLICT,
              archived_guest_id: UUID_GUEST_FOR_UPGRADE,
              has_auth_progress: true,
              has_guest_progress: true,
              bindings_preserved: 0,
              archive_receipt_id: null,
              policy_applied: "explicit_conflict",
            },
          ],
        },
      });
      const { POST } = await loadRouteWith(
        mock as unknown as BootstrapSupabaseMock,
      );
      const req = buildRequest({
        method: "POST",
        url: "/api/auth/bootstrap",
        body: { deviceId: "dev-conflict", mergePolicy: "explicit_conflict" },
      });
      const res = await POST(req);
      expect(res.status).toBe(409);
      const body = await readJson<{
        code?: string;
        archivedGuestId?: string;
      }>(res);
      expect(body.code).toBe("ACCOUNT_PROGRESS_CONFLICT");
      expect(body.archivedGuestId).toBe(UUID_GUEST_FOR_UPGRADE);
      // Both seeded rows in the mock state map remain intact.
      const guestAfter = serverGameStateMock.stateRows.get(
        UUID_GUEST_FOR_UPGRADE,
      );
      const authAfter = serverGameStateMock.stateRows.get(
        UUID_AUTH_FOR_CONFLICT,
      );
      expect(guestAfter?.money).toBe(guestBefore?.money);
      expect(guestAfter?.game_tick).toBe(guestBefore?.game_tick);
      expect(authAfter?.money).toBe(authBefore?.money);
      expect(authAfter?.game_tick).toBe(authBefore?.game_tick);
    });
  });
});
