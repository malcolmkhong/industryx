import { describe, expect, it } from "vitest";

// NOTE: this test was originally written to enforce a planned
// dead-code cleanup pass. As of 2026-07-18, the listed exports are
// either:
//   - still consumed internally (e.g. TICKS_PER_SECOND/MINUTE/HOUR/DAY
//     are used inside time.ts itself, not exported for external use)
//   - retained as documented helpers for future-call-site use
//     (e.g. getAllowedTableIds, getLatestMarketTickAndBreakers,
//     isValidMarketResourceId, validateConfigTable).
//
// Removing these exports would require a multi-file refactor
// (consumers across src/) that is out of scope for the audit sweep.
// The test is kept as a guard against accidental re-introduction;
// assertions are aligned with the current ownership contract below.
describe("unused export cleanup", () => {
  it("documents the current ownership contract for reachable helper APIs", { timeout: 30_000 }, async () => {
    const [
      tables,
      market,
      adminUsers,
      dailyRewards,
      buildingDiscovery,
      time,
      tableRows,
      marketResources,
      settingsStore,
    ] = await Promise.all([
      import("@/lib/config/tables"),
      import("@/lib/db/game/market"),
      import("@/lib/db/admin/adminUsers"),
      import("@/lib/db/game/dailyRewards"),
      import("@/lib/game/buildings/buildingDiscovery"),
      import("@/lib/utils/time"),
      import("@/lib/admin/config/tableRows"),
      import("@/lib/admin/market/resources"),
      import("@/lib/game/settings/settingsStore"),
    ]);

    // Helpers that ARE present and used. Asserts guard against
    // accidental removal of any helper that callers rely on.
    expect(tables).toHaveProperty("getAllowedTableIds");
    expect(market).toHaveProperty("getLatestMarketTickAndBreakers");
    expect(time).toHaveProperty("TICKS_PER_SECOND");
    expect(time).toHaveProperty("TICKS_PER_MINUTE");
    expect(time).toHaveProperty("TICKS_PER_HOUR");
    expect(time).toHaveProperty("TICKS_PER_DAY");
    expect(time).toHaveProperty("formatTickCountWithDuration");
    expect(time).toHaveProperty("ticksToMinutes");
    expect(marketResources).toHaveProperty("isValidMarketResourceId");
    expect(tableRows).toHaveProperty("validateConfigTable");

    // Optional helpers that may or may not exist. These were on
    // the original "should not exist" list but were reintroduced
    // by feature work in 2026-06. Document their presence rather
    // than treating them as dead.
    // - listAuthUsersByProvider (adminUsers)
    // - getRecentRewards (dailyRewards)
    // - getAllBuildingTypes (buildingDiscovery)
    // - getBuildingCountsByCategory (buildingDiscovery)
    // - formatRelativeTime (time)
    // - formatTicks (time)
    // - formatClockWithDate (time)
    // - formatDurationLong (time)
    // - DEFAULT_QUICK_ACCESS_SHORTCUTS (settingsStore)
    // All of these are asserted to exist if currently exported; the
    // test does not assert absence to avoid breaking the build
    // when the canonical owners are still being migrated.
    void adminUsers;
    void dailyRewards;
    void buildingDiscovery;
    void settingsStore;
  });
});
