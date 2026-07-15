import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/game/serverGameState", () => ({
  saveServerGameStateOptimistic: vi.fn(),
}));

vi.mock("@/lib/db/game/serverGameStatePayload", () => ({
  asFullState: vi.fn((state) => state),
}));

import { saveServerGameStateOptimistic } from "@/lib/db/game/serverGameState";
import type { ServerGameStateForAction } from "@/lib/db/game/serverGameState";
import { persistCorrectedActionState } from "@/lib/game/actions/server/shared/correctedStatePersistence";
import type { ResourceType } from "@/lib/game/shared/types/resources";

const coalMine = {
  id: "building-coal-1",
  type: "coalMine" as const,
  level: 1,
  active: true,
  efficiency: 1,
  placedAt: 0,
};

const coalResources = { coal: 0 } as Record<ResourceType, number>;

const baseFullState = {
  money: 2000,
  totalMoneyEarned: 2000,
  researchPoints: 0,
  gameTick: 10,
  buildings: [],
  resources: coalResources,
  completedResearch: [],
  workers: [],
};

const baseServerState = {
  full_state: baseFullState,
  money: 2000,
  total_money_earned: 2000,
  game_tick: 10,
  game_speed: 1,
  state_version: 3,
  state_hash: "hash",
  last_tick_at: "2026-07-14T12:00:00.000Z",
  last_saved_at: "2026-07-14T12:00:00.000Z",
  buildings: [],
  buildings_count: 0,
  resources: coalResources,
  research_points: 0,
  completed_research: [],
  workers: [],
  is_locked: false,
  lock_reason: null,
  cheat_flag_count: 0,
} as unknown as ServerGameStateForAction;

describe("persistCorrectedActionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists denormalized gameplay columns with corrected full_state", async () => {
    (saveServerGameStateOptimistic as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...baseServerState,
      full_state: {
        ...baseFullState,
        money: 1500,
        buildings: [coalMine],
      },
      money: 1500,
      buildings: [coalMine],
      buildings_count: 1,
      state_version: 4,
    });

    const result = await persistCorrectedActionState({
      action: "build",
      actionHistory: [],
      activeServerState: baseServerState,
      requestId: "request-1",
      result: {
        valid: true,
        correctedState: {
          money: 1500,
          buildings: [coalMine],
          resources: coalResources,
          gameTick: 10,
        },
      },
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(saveServerGameStateOptimistic).toHaveBeenCalledWith(
      "user-1",
      3,
      expect.objectContaining({
        money: 1500,
        buildings: [coalMine],
        buildings_count: 1,
        resources: coalResources,
        game_tick: 10,
        state_version: 4,
      }),
    );
  });
});
