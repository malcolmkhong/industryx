import { describe, expect, it } from "vitest";

describe("replaced export retirement", () => {
  it("keeps action validation on the canonical client entry point", async () => {
    const [legacyActions, canonicalActions] = await Promise.all([
      import("@/lib/game/actions/client/serverActions"),
      import("@/lib/game/actions/client/actionValidator"),
    ]);

    expect(canonicalActions).toHaveProperty("validateActionWithServer");
    expect(legacyActions).not.toHaveProperty("validateGameSpeed");
    expect(legacyActions).not.toHaveProperty("validateBuildAction");
    expect(legacyActions).not.toHaveProperty("validateResearchAction");
    expect(legacyActions).not.toHaveProperty("validateSellAction");
    expect(legacyActions).not.toHaveProperty("validateBuyAction");
    expect(legacyActions).not.toHaveProperty("validateUpgradeAction");
    expect(legacyActions).not.toHaveProperty("validateImportSave");
  });

  it("does not expose an unchecked persisted-state cast", async () => {
    const payload = await import("@/lib/db/game/serverGameStatePayload");

    expect(payload).not.toHaveProperty("asServerGameData");
  });

  it("does not expose legacy server action and import helpers", async () => {
    const validator = await import("@/lib/auth/gameStateValidator");

    expect(validator).not.toHaveProperty("validateAction");
    expect(validator).not.toHaveProperty("validateImportSaveOnServer");
    expect(validator).not.toHaveProperty("fetchPreviousServerState");
  });

  it("keeps admin and state reads on their canonical owners", async () => {
    const [admin, marketConfig, adminActions, admins, serverGameState] =
      await Promise.all([
        import("@/lib/auth/admin"),
        import("@/lib/db/config/configMarket"),
        import("@/lib/db/admin/adminActions"),
        import("@/lib/db/admin/admins"),
        import("@/lib/db/game/serverGameState"),
      ]);

    expect(admin).not.toHaveProperty("isCurrentUserAdmin");
    expect(marketConfig).toHaveProperty("createMarketConfigWithError");
    expect(marketConfig).toHaveProperty("updateMarketConfigWithError");
    expect(marketConfig).not.toHaveProperty("createMarketConfig");
    expect(marketConfig).not.toHaveProperty("updateMarketConfig");
    expect(adminActions).toHaveProperty("listAdminActionsWithFilters");
    expect(adminActions).not.toHaveProperty("listAdminActions");
    expect(admins).not.toHaveProperty("getAdminUserIdsFromDb");
    expect(serverGameState).not.toHaveProperty("loadPlayerProgressGameState");
  });
});
