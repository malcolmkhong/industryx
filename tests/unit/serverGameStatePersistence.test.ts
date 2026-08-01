import { beforeEach, describe, expect, it, vi } from "vitest";

const single = vi.fn();
const select = vi.fn(() => ({ single }));
const upsert = vi.fn(() => ({ select }));
const from = vi.fn(() => ({ upsert }));

vi.mock("@/lib/db/access", () => ({
  requireDbClient: vi.fn(() => ({ from })),
}));

vi.mock("@/lib/db/game/serverGameState", () => ({
  initializeGuestGameState: vi.fn(),
  saveServerGameStateOptimistic: vi.fn(),
  upsertServerGameState: vi.fn(),
}));

import { syncLegacyPlayerProgressProjection } from "@/lib/game/state/persistence/serverGameStatePersistence.server";

describe("syncLegacyPlayerProgressProjection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    single.mockResolvedValue({
      data: { user_id: "player-1" },
      error: null,
    });
  });

  it("writes only the sanitized canonical projection through the persistence boundary", async () => {
    const persisted = await syncLegacyPlayerProgressProjection({
      userId: "player-1",
      displayName: "Commander",
      gameState: {
        money: 500,
        resources: { iron: 4 },
        activeTab: "market",
        notifications: [{ id: "ui-only" }],
      },
    });

    expect(persisted.ok).toBe(true);
    expect(from).toHaveBeenCalledWith("player_progress");
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "player-1",
        display_name: "Commander",
        game_state: {
          money: 500,
          resources: { iron: 4 },
        },
      },
      { onConflict: "user_id" },
    );
  });
});
