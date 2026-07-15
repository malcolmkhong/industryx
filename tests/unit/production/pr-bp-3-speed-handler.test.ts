/**
 * tests/unit/production/pr-bp-3-speed-handler.test.ts
 *
 * V-020 / PR-BP-3: `handleSetGameSpeed` previously fired-and-forgot its
 * CAS persist. The new contract awaits the CAS, surfaces typed failure
 * on persist error or CAS loss, and otherwise returns success only when
 * the row actually updated.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/game/serverGameState", () => ({
  saveServerGameStateOptimistic: vi.fn(),
}));

import { handleSetGameSpeed } from "@/lib/game/actions/server/handlers/speed";
import { saveServerGameStateOptimistic } from "@/lib/db/game/serverGameState";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("V-020 / PR-BP-3 — set_game_speed awaits CAS", () => {
  it("returns valid:false on rejected speed", async () => {
    const res = await handleSetGameSpeed(
      { speed: 7 },
      { state_version: 1 },
      "user-1",
    );
    expect(res.valid).toBe(false);
    expect(saveServerGameStateOptimistic).not.toHaveBeenCalled();
  });

  it("returns valid:true after CAS persists", async () => {
    (saveServerGameStateOptimistic as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        user_id: "user-1",
        money: 1000,
        game_tick: 50,
        game_speed: 5,
        state_version: 2,
      },
    );
    const res = await handleSetGameSpeed(
      { speed: 5 },
      { state_version: 1 },
      "user-1",
    );
    expect(res.valid).toBe(true);
    expect(saveServerGameStateOptimistic).toHaveBeenCalledWith(
      "user-1",
      1,
      expect.objectContaining({ game_speed: 5, state_version: 2 }),
    );
  });

  it("returns valid:false when CAS returns null (version mismatch)", async () => {
    (saveServerGameStateOptimistic as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null,
    );
    const res = await handleSetGameSpeed(
      { speed: 2 },
      { state_version: 1 },
      "user-1",
    );
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/CAS lost|refetch/i);
  });

  it("returns valid:false when CAS throws", async () => {
    (saveServerGameStateOptimistic as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("connection lost"),
    );
    const res = await handleSetGameSpeed(
      { speed: 10 },
      { state_version: 1 },
      "user-1",
    );
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/failed to persist/i);
  });
});
