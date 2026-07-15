/**
 * tests/api/telemetry/bootstrap.test.ts
 *
 * Tests for POST /api/telemetry/bootstrap — anonymized bootstrap-outcome
 * telemetry per AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §19 + §21 PR 5.
 *
 * Covers:
 *   - 200 happy path (insert + ok)
 *   - 400 missing deviceId (validation)
 *   - 400 missing outcome (validation)
 *   - 400 outcome not in whitelist
 *   - 400 malformed JSON
 *   - idempotency dedupe (same deviceId + outcome within the same minute)
 *   - 429 rate limited (RATE_LIMITS.player)
 *   - 503 when service-role client is unconfigured
 *   - 500 when the insert fails
 *   - captures auth user id when present (no PII)
 *
 * Strategy: mock @/lib/supabase/server for auth + service-role. Replace
 * @/lib/auth/rateLimiter with a controllable stub.
 */

// Test mocks use `any` per .rules §9 / TS-001 exception for test mocks.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRequest, readJson } from "../helpers/request";

// Rate limiter stub: default allow; tests can override.
const checkRateLimit = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/auth/rateLimiter", () => ({
  checkRateLimit: (...args: any[]) => (checkRateLimit as any)(...args),
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

// ─── Helpers ────────────────────────────────────────────────────────────

interface InsertCall {
  table: string;
  payload: Record<string, unknown>;
}

interface MockSupabaseOpts {
  /** Existing dedupe rows inside the minute (per device_id+outcome). */
  existingRows?: Array<{ id: string; device_id: string; outcome: string }>;
  /** When provided, .insert() returns this error. */
  insertError?: { message: string } | null;
  /** Optional auth user id from createClient().auth.getUser(). */
  sessionUserId?: string | null;
}

function buildMockSupabase(opts: MockSupabaseOpts = {}) {
  const insertCalls: InsertCall[] = [];

  // The dedupe query in the route is awaited as `.select().eq().eq().gte().limit()`.
  // We make the builder thenable with the dedupe rows as the awaited value.
  const from = vi.fn((table: string): any => {
    if (table === "bootstrap_telemetry") {
      const dedupeResolve = (resolve: (v: unknown) => void) => {
        resolve({ data: opts.existingRows ?? [], error: null });
      };
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        order: vi.fn(() => builder),
        in: vi.fn(() => builder),
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertCalls.push({ table, payload });
          if (opts.insertError) {
            return Promise.resolve({ data: null, error: opts.insertError });
          }
          return Promise.resolve({ data: [{ id: "new-row-id" }], error: null });
        }),
        then: dedupeResolve,
      };
      return builder;
    }
    return {
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
  });

  return {
    supabase: {
      from,
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    insertCalls,
    createServiceRoleClient: () => ({ from }),
    createClient: async () => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: opts.sessionUserId ? { id: opts.sessionUserId } : null },
          error: null,
        }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: opts.sessionUserId ? { user: { id: opts.sessionUserId } } : null },
          error: null,
        }),
      },
    }),
    isSupabaseConfigured: () => true,
    isServiceRoleConfigured: () => true,
  };
}

type ImportedRoute = typeof import("@/app/api/telemetry/bootstrap/route");

interface TelemetrySupabaseMock {
  createServiceRoleClient: () => { from: any } | null;
  createClient: () => Promise<{
    auth: {
      getUser: () => Promise<{ data: { user: { id: string } | null }; error: null }>;
    };
  }>;
  isSupabaseConfigured: () => boolean;
  isServiceRoleConfigured: () => boolean;
}

async function loadRouteWith(mock: TelemetrySupabaseMock): Promise<ImportedRoute> {
  vi.doMock('@/lib/db/access', () => mock);
  vi.resetModules();
  return import("@/app/api/telemetry/bootstrap/route");
}

const UUID_DEVICE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

// ─── Tests ──────────────────────────────────────────────────────────────

describe("POST /api/telemetry/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue(null);
  });

  it("returns 200 ok on happy path with valid body", async () => {
    const mock = buildMockSupabase({ existingRows: [] });
    const { POST } = await loadRouteWith(mock);

    const req = buildRequest({
      method: "POST",
      url: "/api/telemetry/bootstrap",
      body: {
        deviceId: UUID_DEVICE,
        outcome: "ready",
        source: "deviceId",
        durationMs: 1234,
        fingerprintStatus: "ok",
        stateAtEmit: "bootstrapping",
        isGuest: true,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{ ok?: boolean; error?: string; code?: string }>(res);
    expect(body.ok).toBe(true);
    const { RATE_LIMITS } = await import("@/lib/auth/rateLimiter");
    expect(checkRateLimit).toHaveBeenCalledWith(
      UUID_DEVICE,
      RATE_LIMITS.bootstrap,
      "/api/telemetry/bootstrap",
    );

    // Verify insert was called exactly once with the sanitized payload.
    expect(mock.insertCalls).toHaveLength(1);
    const insert = mock.insertCalls[0]!;
    expect(insert.table).toBe("bootstrap_telemetry");
    expect(insert.payload.device_id).toBe(UUID_DEVICE);
    expect(insert.payload.outcome).toBe("ready");
    expect(insert.payload.source).toBe("deviceId");
    expect(insert.payload.duration_ms).toBe(1234);
    expect(insert.payload.fingerprint_status).toBe("ok");
    expect(insert.payload.state_at_emit).toBe("bootstrapping");
    expect(insert.payload.is_guest).toBe(true);
    // NO PII fields are ever inserted.
    expect(insert.payload.email).toBeUndefined();
    expect(insert.payload.ip).toBeUndefined();
    expect(insert.payload.fingerprint).toBeUndefined();
  });

  it("returns 400 INVALID_TELEMETRY_BODY when deviceId is missing", async () => {
    const mock = buildMockSupabase({ existingRows: [] });
    const { POST } = await loadRouteWith(mock);

    const req = buildRequest({
      method: "POST",
      url: "/api/telemetry/bootstrap",
      body: { outcome: "ready" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string; code?: string }>(res);
    expect(body.code).toBe("INVALID_TELEMETRY_BODY");
    expect(body.error ?? "").toMatch(/deviceId/i);
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("returns 400 INVALID_TELEMETRY_BODY when outcome is missing", async () => {
    const mock = buildMockSupabase({ existingRows: [] });
    const { POST } = await loadRouteWith(mock);

    const req = buildRequest({
      method: "POST",
      url: "/api/telemetry/bootstrap",
      body: { deviceId: UUID_DEVICE },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string; code?: string }>(res);
    expect(body.code).toBe("INVALID_TELEMETRY_BODY");
    expect(body.error ?? "").toMatch(/outcome/i);
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("returns 400 INVALID_TELEMETRY_BODY when outcome is not in the whitelist", async () => {
    const mock = buildMockSupabase({ existingRows: [] });
    const { POST } = await loadRouteWith(mock);

    const req = buildRequest({
      method: "POST",
      url: "/api/telemetry/bootstrap",
      body: { deviceId: UUID_DEVICE, outcome: "not-a-real-outcome" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await readJson<{ error?: string; code?: string }>(res);
    expect(body.code).toBe("INVALID_TELEMETRY_BODY");
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("dedupes insert when an existing (device_id, outcome) row exists in the same minute", async () => {
    const mock = buildMockSupabase({
      existingRows: [{ id: "existing-row", device_id: UUID_DEVICE, outcome: "ready" }],
    });
    const { POST } = await loadRouteWith(mock);

    const req = buildRequest({
      method: "POST",
      url: "/api/telemetry/bootstrap",
      body: {
        deviceId: UUID_DEVICE,
        outcome: "ready",
        source: "deviceId",
        durationMs: 500,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readJson<{ ok?: boolean; deduped?: boolean }>(res);
    expect(body.ok).toBe(true);
    expect(body.deduped).toBe(true);

    // Dedupe should suppress the insert.
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("returns 429 when the rate limiter blocks the request", async () => {
    checkRateLimit.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "Rate limit exceeded", code: "RATE_LIMITED" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );

    const mock = buildMockSupabase({ existingRows: [] });
    const { POST } = await loadRouteWith(mock);

    const req = buildRequest({
      method: "POST",
      url: "/api/telemetry/bootstrap",
      body: { deviceId: UUID_DEVICE, outcome: "ready" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("returns 503 TELEMETRY_UNAVAILABLE when service-role is not configured", async () => {
    const noClientMock: TelemetrySupabaseMock = {
      createServiceRoleClient: () => null,
      createClient: async () => ({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      }),
      isSupabaseConfigured: () => true,
      isServiceRoleConfigured: () => false,
    };
    const { POST } = await loadRouteWith(noClientMock);

    const req = buildRequest({
      method: "POST",
      url: "/api/telemetry/bootstrap",
      body: { deviceId: UUID_DEVICE, outcome: "ready" },
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await readJson<{ error?: string; code?: string }>(res);
    expect(body.code).toBe("TELEMETRY_UNAVAILABLE");
  });

  it("returns 500 INTERNAL_TELEMETRY_ERROR when the insert fails", async () => {
    const mock = buildMockSupabase({
      existingRows: [],
      insertError: { message: "DB is on fire" },
    });
    const { POST } = await loadRouteWith(mock);

    const req = buildRequest({
      method: "POST",
      url: "/api/telemetry/bootstrap",
      body: { deviceId: UUID_DEVICE, outcome: "ready", source: "deviceId" },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await readJson<{ error?: string; code?: string }>(res);
    expect(body.code).toBe("INTERNAL_TELEMETRY_ERROR");
    // Even on insert failure, we expect exactly one insert attempt.
    expect(mock.insertCalls).toHaveLength(1);
  });

  it("captures auth user id when a Supabase session is present (no PII otherwise)", async () => {
    const mock = buildMockSupabase({
      existingRows: [],
      sessionUserId: "auth-user-uuid",
    });
    const { POST } = await loadRouteWith(mock);

    const req = buildRequest({
      method: "POST",
      url: "/api/telemetry/bootstrap",
      body: { deviceId: UUID_DEVICE, outcome: "signed_in", source: "auth" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mock.insertCalls).toHaveLength(1);
    expect(mock.insertCalls[0]!.payload.user_id).toBe("auth-user-uuid");
    // Email must NEVER be recorded.
    expect(mock.insertCalls[0]!.payload.email).toBeUndefined();
  });

  it("returns 400 INVALID_TELEMETRY_BODY on malformed JSON", async () => {
    const mock = buildMockSupabase({ existingRows: [] });
    const { POST } = await loadRouteWith(mock);

    const { NextRequest } = await import("next/server");
    const badReq = new NextRequest(
      "http://localhost:3000/api/telemetry/bootstrap",
      {
        method: "POST",
        body: "this-is-not-json",
        headers: { "content-type": "application/json" },
      },
    );

    const res = await POST(badReq);
    expect(res.status).toBe(400);
    expect(mock.insertCalls).toHaveLength(0);
  });
});
