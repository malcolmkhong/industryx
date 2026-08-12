import { beforeEach, describe, expect, it, vi } from "vitest";
import { readJson } from "../helpers/request";
import { emptyProductionSnapshot } from "@/lib/game/production/snapshot/emptyProductionSnapshot";
import type { ProductionSnapshot } from "@/lib/game/production/productionCalculator";

function stubSnapshot(over: Partial<ProductionSnapshot> = {}): ProductionSnapshot {
  return { ...emptyProductionSnapshot(), ...over };
}

vi.mock("@/lib/auth/verifyAuth", () => ({
  verifyAuth: vi.fn(),
}));

vi.mock("@/lib/db/auth/bootstrapRpcs.server", () => ({
  callBootstrapGuest: vi.fn(),
  rowErrorCode: vi.fn(() => null),
}));

vi.mock("@/lib/auth/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    serverTick: { maxRequests: 12, windowMs: 60_000, failClosed: true },
    compute: { maxRequests: 10, windowMs: 60_000, failClosed: false },
  },
}));

vi.mock("@/lib/db/game/serverGameState", () => ({
  isServerGameStateAvailable: vi.fn(),
  loadServerGameStateForAction: vi.fn(),
}));

vi.mock("@/lib/game/actions/server/shared/actionPersistence", () => ({
  applyElapsedServerTime: vi.fn(),
}));

import { verifyAuth } from "@/lib/auth/verifyAuth";
import { callBootstrapGuest } from "@/lib/db/auth/bootstrapRpcs.server";
import {
  isServerGameStateAvailable,
  loadServerGameStateForAction,
} from "@/lib/db/game/serverGameState";
import { applyElapsedServerTime } from "@/lib/game/actions/server/shared/actionPersistence";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { POST } from "@/app/api/game/state/live-tick/route";

function request(body: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/game/state/live-tick", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/game/state/live-tick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      userId: "user-1",
    });
    (isServerGameStateAvailable as ReturnType<typeof vi.fn>).mockReturnValue(
      true,
    );
    (loadServerGameStateForAction as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        full_state: { gameTick: 10, resources: { iron: 0 } },
        game_tick: 10,
        game_speed: 1,
        state_version: 1,
        last_tick_at: "2026-07-12T00:00:00.000Z",
        is_locked: false,
        lock_reason: null,
      },
    );
    (callBootstrapGuest as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      row: {
        status: "OK_EXISTING",
        error_code: null,
        user_id: "guest-user-1",
        binding_id: "guest-binding-1",
        is_new_user: false,
        has_game_state: true,
      },
    });
  });

  it("returns auth response when the session is invalid", async () => {
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: new Response("unauthorized", { status: 401 }),
    });

    const res = await POST(request());

    expect(res.status).toBe(401);
    expect(applyElapsedServerTime).not.toHaveBeenCalled();
  });

  it("settles elapsed server time and returns authoritative state", async () => {
    const snap = stubSnapshot({ moneyIncomeRate: 12.5 });
    (applyElapsedServerTime as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      activeServerState: {
        full_state: { gameTick: 15, resources: { iron: 5 } },
        game_tick: 15,
      },
      elapsedTicks: 5,
      productionSnapshot: snap,
    });

    const res = await POST(request());
    const body = await readJson<{
      newState: { gameTick: number; resources: { iron: number } };
      ticksApplied: number;
      gameTick: number;
      productionSnapshot: ProductionSnapshot | null;
    }>(res);

    expect(res.status).toBe(200);
    expect(applyElapsedServerTime).toHaveBeenCalledWith(
      expect.objectContaining({ game_tick: 10 }),
      "user-1",
    );
    expect(checkRateLimit).toHaveBeenCalledWith(
      "user-1",
      RATE_LIMITS.serverTick,
      "/api/game/state/live-tick",
    );
    expect(body.newState.resources.iron).toBe(5);
    expect(body.ticksApplied).toBe(5);
    expect(body.gameTick).toBe(15);
  });

  // NEW-TEST-024 (V-001): live-tick returns productionSnapshot matched
  // to the post-tick state. PR-BP-1 contract:
  //   - response carries `productionSnapshot` field
  //   - snapshot and newState come from the same `applyElapsedServerTime`
  //     call (matched settlement)
  //   - `productionSnapshot` is non-null when `ticksApplied > 0`
  //   - `productionSnapshot` may be `null` when `ticksApplied === 0`
  it("NEW-TEST-024: returns productionSnapshot alongside newState when ticks applied", async () => {
    const snap = stubSnapshot({
      moneyIncomeRate: 12.5,
      production: { iron: 3 },
      consumption: { iron: 1 },
      actualConsumption: { iron: 1 },
    });
    (applyElapsedServerTime as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      activeServerState: {
        full_state: { gameTick: 15, resources: { iron: 5 } },
        game_tick: 15,
      },
      elapsedTicks: 5,
      productionSnapshot: snap,
    });

    const res = await POST(request());
    const body = await readJson<{
      newState: { gameTick: number };
      productionSnapshot: ProductionSnapshot | null;
      ticksApplied: number;
    }>(res);

    expect(res.status).toBe(200);
    expect(body.ticksApplied).toBe(5);
    expect(body.productionSnapshot).toEqual(snap);
    expect(body.productionSnapshot?.moneyIncomeRate).toBe(12.5);
    expect(body.productionSnapshot?.production.iron).toBe(3);
  });

  // NEW-TEST-024 cold-start branch: zero-tick response carries null
  // snapshot; client hook's applyServerState() then preserves prev.
  it("NEW-TEST-024 cold-start: returns productionSnapshot=null when no ticks applied", async () => {
    (applyElapsedServerTime as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      activeServerState: {
        full_state: { gameTick: 10, resources: { iron: 0 } },
        game_tick: 10,
      },
      elapsedTicks: 0,
      productionSnapshot: null,
    });

    const res = await POST(request());
    const body = await readJson<{
      newState: { gameTick: number };
      productionSnapshot: unknown;
      ticksApplied: number;
    }>(res);

    expect(res.status).toBe(200);
    expect(body.ticksApplied).toBe(0);
    expect(body.productionSnapshot).toBeNull();
  });

  it("settles elapsed server time for an active guest device binding", async () => {
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: new Response("unauthorized", { status: 401 }),
    });
    (applyElapsedServerTime as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      activeServerState: {
        full_state: { gameTick: 20, money: 2100, resources: { iron: 8 } },
        game_tick: 20,
      },
      elapsedTicks: 10,
      productionSnapshot: stubSnapshot({}),
    });

    const res = await POST(request({ deviceId: "device-1" }));
    const body = await readJson<{
      newState: { gameTick: number; money: number; resources: { iron: number } };
      ticksApplied: number;
      gameTick: number;
    }>(res);

    expect(res.status).toBe(200);
    expect(callBootstrapGuest).toHaveBeenCalledWith({
      deviceId: "device-1",
      fingerprintHash: null,
    });
    expect(loadServerGameStateForAction).toHaveBeenCalledWith("guest-user-1");
    expect(applyElapsedServerTime).toHaveBeenCalledWith(
      expect.objectContaining({ game_tick: 10 }),
      "guest-user-1",
    );
    expect(checkRateLimit).toHaveBeenCalledWith(
      "guest:device-1",
      RATE_LIMITS.serverTick,
      "/api/game/state/live-tick",
    );
    expect(body.newState.money).toBe(2100);
    expect(body.newState.resources.iron).toBe(8);
    expect(body.ticksApplied).toBe(10);
    expect(body.gameTick).toBe(20);
  });

  it("rejects unauthenticated live tick when no deviceId is provided", async () => {
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: new Response("unauthorized", { status: 401 }),
    });

    const res = await POST(request());

    expect(res.status).toBe(401);
    expect(callBootstrapGuest).not.toHaveBeenCalled();
    expect(applyElapsedServerTime).not.toHaveBeenCalled();
  });
});
