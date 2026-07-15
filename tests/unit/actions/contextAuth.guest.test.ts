import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/verifyAuth", () => ({
  verifyAuth: vi.fn(),
}));

vi.mock("@/lib/auth/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: {
    action: { maxRequests: 20, windowMs: 60_000, failClosed: true },
  },
}));

vi.mock("@/lib/db/auth/bootstrapRpcs.server", () => ({
  callBootstrapGuest: vi.fn(),
  rowErrorCode: vi.fn(() => null),
}));

import { verifyAuth } from "@/lib/auth/verifyAuth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { callBootstrapGuest } from "@/lib/db/auth/bootstrapRpcs.server";
import { authorizeActionContext } from "@/lib/game/actions/server/shared/contextAuth";

describe("authorizeActionContext guest device binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      response: new Response("unauthorized", { status: 401 }),
    });
    (callBootstrapGuest as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      row: {
        status: "OK",
        user_id: "guest-user-1",
        binding_id: "binding-1",
        is_new_user: false,
        has_game_state: true,
        error_code: null,
      },
    });
  });

  it("authorizes an unauthenticated guest when device binding matches request user", async () => {
    const result = await authorizeActionContext("guest-user-1", "device-1", "build");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.auth.userId).toBe("guest-user-1");
    }
    expect(callBootstrapGuest).toHaveBeenCalledWith({
      deviceId: "device-1",
      fingerprintHash: null,
    });
    expect(checkRateLimit).toHaveBeenCalledWith(
      "guest:device-1",
      RATE_LIMITS.action,
      "/api/game/actions/build",
    );
  });

  it("rejects a guest action when device binding resolves to a different user", async () => {
    const result = await authorizeActionContext("other-user", "device-1", "build");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });
}
);
