import { beforeEach, describe, expect, it, vi } from "vitest";
import { readJson } from "../helpers/request";

vi.mock("@/lib/auth/verifyAuth", () => ({
  verifyAuth: vi.fn(),
}));

vi.mock("@/lib/auth/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
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
import {
  isServerGameStateAvailable,
  loadServerGameStateForAction,
} from "@/lib/db/game/serverGameState";
import { applyElapsedServerTime } from "@/lib/game/actions/server/shared/actionPersistence";
import { POST } from "@/app/api/game/state/live-tick/route";

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
  });

  it("returns auth response when the session is invalid", async () => {
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      response: new Response("unauthorized", { status: 401 }),
    });

    const res = await POST();

    expect(res.status).toBe(401);
    expect(applyElapsedServerTime).not.toHaveBeenCalled();
  });

  it("settles elapsed server time and returns authoritative state", async () => {
    (applyElapsedServerTime as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      activeServerState: {
        full_state: { gameTick: 15, resources: { iron: 5 } },
        game_tick: 15,
      },
      elapsedTicks: 5,
    });

    const res = await POST();
    const body = await readJson<{
      newState: { gameTick: number; resources: { iron: number } };
      ticksApplied: number;
      gameTick: number;
    }>(res);

    expect(res.status).toBe(200);
    expect(applyElapsedServerTime).toHaveBeenCalledWith(
      expect.objectContaining({ game_tick: 10 }),
      "user-1",
    );
    expect(body.newState.resources.iron).toBe(5);
    expect(body.ticksApplied).toBe(5);
    expect(body.gameTick).toBe(15);
  });
});
