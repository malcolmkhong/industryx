import { beforeEach, describe, expect, it, vi } from "vitest";

const submitActionToServerMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/limitedMode", () => ({
  gateIfLimited: vi.fn(() => false),
}));

vi.mock("@/lib/game/actions/client/serverActions", () => ({
  submitActionToServer: submitActionToServerMock,
}));

describe("validateActionWithServer fail-closed correctedState contract", () => {
  beforeEach(() => {
    submitActionToServerMock.mockReset();
  });

  it("rejects economy actions when the server omits correctedState", async () => {
    submitActionToServerMock.mockResolvedValueOnce({ valid: true });
    const { validateActionWithServer } = await import("@/lib/game/actions/client/actionValidator");

    const result = await validateActionWithServer(
      "build",
      { buildingType: "ironMine" },
      "request-1",
    );

    expect(result).toEqual({
      approved: false,
      error: "Server did not return authoritative state. Please retry.",
    });
  });

  it("allows game speed changes without correctedState", async () => {
    submitActionToServerMock.mockResolvedValueOnce({ valid: true });
    const { validateActionWithServer } = await import("@/lib/game/actions/client/actionValidator");

    const result = await validateActionWithServer(
      "set_game_speed",
      { speed: 2 },
      "request-2",
    );

    expect(result).toEqual({
      approved: true,
      correctedState: undefined,
    });
  });
});
