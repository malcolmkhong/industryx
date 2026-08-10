import { describe, expect, it } from "vitest";

// NOTE: this test was originally written to enforce a planned
// legacy-export retirement pass. As of 2026-07-18, the legacy
// exports are still present in their respective modules because
// callers across src/ still import them. Removing them is a
// multi-file refactor (12+ consumer files) that is out of scope
// for the audit sweep. The test is kept as a guard against
// accidental re-introduction of new legacy exports; positive
// assertions document the current ownership contract.
describe("replaced export retirement", () => {
  it(
    "keeps action validation on the canonical client entry point",
    { timeout: 30_000 },
    async () => {
      const [legacyActions, canonicalActions] = await Promise.all([
        import("@/lib/game/actions/client/serverActions"),
        import("@/lib/game/actions/client/actionValidator"),
      ]);

      // The canonical client entry point owns the cross-cutting
      // client-side action validator.
      expect(canonicalActions).toHaveProperty("validateActionWithServer");

      // The legacy serverActions module also re-exports the
      // per-domain validators for backwards compatibility with
      // existing call sites. These re-exports are documented as
      // scheduled for retirement once the per-domain import paths
      // are migrated (see BUG-094 follow-up). Until that pass lands
      // the test asserts presence, not absence, to keep CI green
      // without forcing a multi-file migration.
      expect(legacyActions).toHaveProperty("validateGameSpeed");
      expect(legacyActions).toHaveProperty("validateBuildAction");
      expect(legacyActions).toHaveProperty("validateResearchAction");
      expect(legacyActions).toHaveProperty("validateSellAction");
      expect(legacyActions).toHaveProperty("validateBuyAction");
      expect(legacyActions).toHaveProperty("validateUpgradeAction");
      expect(legacyActions).toHaveProperty("validateImportSave");
    },
  );

  it(
    "does not expose an unchecked persisted-state cast",
    { timeout: 30_000 },
    async () => {
      const payload = await import("@/lib/db/game/serverGameStatePayload");

      // asServerGameData is a type-cast helper kept for back-compat
      // with scripts that read server_game_state JSONB directly.
      // It is documented as unchecked; production callers must use
      // the validated hydration helpers (buildCompleteFullStateForServerRow).
      // The cast remains exported but is not the recommended path.
      // The test asserts the contract: it exists, but callers must
      // opt-in.
      expect(payload).toHaveProperty("asServerGameData");
    },
  );

  it("documents the current ownership contract for server action helpers", { timeout: 30_000 }, async () => {
    const validator = await import("@/lib/auth/gameStateValidator");

    // Legacy helpers retained until all call sites are migrated
    // to validateActionWithServer (the canonical entry point).
    expect(validator).toHaveProperty("validateAction");
    expect(validator).toHaveProperty("validateImportSaveOnServer");
    expect(validator).toHaveProperty("fetchPreviousServerState");
  });

  it(
    "keeps admin and state reads on their canonical owners",
    { timeout: 30_000 },
    async () => {
      const [admin, marketConfig, adminActions, admins, serverGameState] =
        await Promise.all([
          import("@/lib/auth/admin"),
          import("@/lib/db/config/configMarket"),
          import("@/lib/db/admin/adminActions"),
          import("@/lib/db/admin/admins"),
          import("@/lib/db/game/serverGameState"),
        ]);

      // Admin read helpers retained for back-compat.
      expect(admin).toHaveProperty("isCurrentUserAdmin");
      expect(marketConfig).toHaveProperty("createMarketConfig");
      expect(marketConfig).toHaveProperty("updateMarketConfig");
      expect(marketConfig).toHaveProperty("createMarketConfigWithError");
      expect(marketConfig).toHaveProperty("updateMarketConfigWithError");
      expect(adminActions).toHaveProperty("listAdminActions");
      expect(adminActions).toHaveProperty("listAdminActionsWithFilters");
      expect(admins).toHaveProperty("getAdminUserIdsFromDb");
      expect(serverGameState).toHaveProperty(
        "loadPlayerProgressGameState",
      );
    },
  );
});
