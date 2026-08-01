import { describe, expect, it } from "vitest";

describe("unused export cleanup", () => {
  it("does not expose unreachable helper APIs", async () => {
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

    expect(tables).not.toHaveProperty("getAllowedTableIds");
    expect(market).not.toHaveProperty("getLatestMarketTickAndBreakers");
    expect(adminUsers).not.toHaveProperty("listAuthUsersByProvider");
    expect(dailyRewards).not.toHaveProperty("getRecentRewards");
    expect(buildingDiscovery).not.toHaveProperty("getAllBuildingTypes");
    expect(buildingDiscovery).not.toHaveProperty("getBuildingCountsByCategory");
    expect(time).not.toHaveProperty("TICKS_PER_SECOND");
    expect(time).not.toHaveProperty("TICKS_PER_MINUTE");
    expect(time).not.toHaveProperty("TICKS_PER_HOUR");
    expect(time).not.toHaveProperty("TICKS_PER_DAY");
    expect(time).not.toHaveProperty("formatTickCountWithDuration");
    expect(time).not.toHaveProperty("ticksToMinutes");
    expect(time).not.toHaveProperty("formatRelativeTime");
    expect(time).not.toHaveProperty("formatTicks");
    expect(time).not.toHaveProperty("formatClockWithDate");
    expect(time).not.toHaveProperty("formatDurationLong");
    expect(tableRows).not.toHaveProperty("validateConfigTable");
    expect(marketResources).not.toHaveProperty("isValidMarketResourceId");
    expect(settingsStore).not.toHaveProperty("DEFAULT_QUICK_ACCESS_SHORTCUTS");
  });
});
