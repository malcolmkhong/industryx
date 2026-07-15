/**
 * tests/api/game/initial-state.test.ts
 *
 * Public bootstrap/config hydration tests for GET /api/game/state/initial.
 * This route returns canonical startup data only; it must not require a
 * Supabase user session, but it must use the public config rate-limit profile.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, readJson } from "../helpers/request";

const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    publicConfig: { maxRequests: 30, windowMs: 60_000, failClosed: false },
  },
}));

vi.mock("@/lib/auth/rateLimiter", () => ({
  checkRateLimit: rateLimitMock.checkRateLimit,
  RATE_LIMITS: rateLimitMock.RATE_LIMITS,
}));

vi.mock("@/app/api/auth/_shared/request-ip-log-helper", () => ({
  extractClientIp: vi.fn(() => "203.0.113.9"),
  hashIp: vi.fn((ip: string) => `hash:${ip}`),
}));

const initialStateMock = vi.hoisted(() => ({
  fetchCanonicalInitialState: vi.fn(async () => ({
    money: 2000,
    resources: { iron: 0 },
    resourceCapacity: { iron: 100 },
    buildings: [],
    quests: [{ id: "q-start", status: "active" }],
    gameTick: 0,
    gameSpeed: 1,
  })),
}));

vi.mock("@/lib/db/infra/initialState.server", () => ({
  fetchCanonicalInitialState: initialStateMock.fetchCanonicalInitialState,
}));

import { GET } from "@/app/api/game/state/initial/route";

describe("GET /api/game/state/initial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.checkRateLimit.mockResolvedValue(null);
    initialStateMock.fetchCanonicalInitialState.mockResolvedValue({
      money: 2000,
      resources: { iron: 0 },
      resourceCapacity: { iron: 100 },
      buildings: [],
      quests: [{ id: "q-start", status: "active" }],
      gameTick: 0,
      gameSpeed: 1,
    });
  });

  it("returns canonical startup data without requiring auth", async () => {
    const req = buildRequest({
      method: "GET",
      url: "/api/game/state/initial",
      ip: "203.0.113.9",
    });

    const res = await GET(req);
    const body = await readJson<{
      initialState?: {
        money?: number;
        quests?: Array<{ id: string }>;
        gameTick?: number;
      };
      fetchedAt?: number;
    }>(res);

    expect(res.status).toBe(200);
    expect(body.initialState?.money).toBe(2000);
    expect(body.initialState?.quests).toHaveLength(1);
    expect(body.initialState?.gameTick).toBe(0);
    expect(typeof body.fetchedAt).toBe("number");
  });

  it("uses publicConfig rate limit keyed by hashed client IP", async () => {
    const req = buildRequest({
      method: "GET",
      url: "/api/game/state/initial",
      ip: "203.0.113.9",
    });

    await GET(req);

    expect(rateLimitMock.checkRateLimit).toHaveBeenCalledWith(
      "public:hash:203.0.113.9",
      rateLimitMock.RATE_LIMITS.publicConfig,
      "/api/game/state/initial",
    );
  });

  it("returns 429 when public config rate limit rejects", async () => {
    rateLimitMock.checkRateLimit.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const req = buildRequest({
      method: "GET",
      url: "/api/game/state/initial",
      ip: "203.0.113.9",
    });

    const res = await GET(req);

    expect(res.status).toBe(429);
    expect(initialStateMock.fetchCanonicalInitialState).not.toHaveBeenCalled();
  });

  it("returns 503 when canonical startup config cannot load", async () => {
    initialStateMock.fetchCanonicalInitialState.mockRejectedValueOnce(
      new Error("DB unavailable"),
    );
    const req = buildRequest({
      method: "GET",
      url: "/api/game/state/initial",
      ip: "203.0.113.9",
    });

    const res = await GET(req);
    const body = await readJson<{ code?: string; error?: string }>(res);

    expect(res.status).toBe(503);
    expect(body.code).toBe("INITIAL_STATE_FAILED");
  });
});
