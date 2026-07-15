/**
 * tests/unit/production/pr-bp-3-seasonal-preserve.test.ts
 *
 * V-015 / PR-BP-3: the seasonal-event transformer in runtimeCache must
 * forward `season / startDate / endDate / isActive` from
 * `game_config_seasonal_events` so UI consumers can distinguish real
 * seasonal windows from default 500-tick placeholder events.
 *
 * Legacy literals for `duration / color / triggerChance` remain as
 * fallback defaults because no DB columns exist; pinning them in this
 * test prevents a silent default change.
 */

import { describe, it, expect } from "vitest";

// Import indirectly via configCache rebuild side effects.
import {
  SEASONAL_EVENTS,
  updateFromSupabase,
} from "@/lib/game/config/runtimeCache";
import type { GameConfig } from "@/lib/game/config/config";

const NOW = "2026-12-21T00:00:00.000Z";

function buildGameConfig(): GameConfig {
  return {
    buildings: {},
    resources: {},
    research: [],
    market: [],
    workers: [],
    transport: {} as never,
    automation: [],
    prestigeBonuses: [],
    rankThresholds: [],
    quests: [],
    dailyRewards: [],
    eventTemplates: [],
    megaProjects: [],
    weather: {} as never,
    productionChains: [],
    seasonalEvents: [
      {
        id: "doubleProduction",
        name: "Production Frenzy",
        description: "x2 production",
        season: "winter",
        startDate: "2026-12-01T00:00:00.000Z",
        endDate: "2027-01-31T23:59:59.000Z",
        effects: [],
        rewards: [],
        icon: "snowflake",
        isActive: true,
      },
    ],
    gameConfig: {} as never,
    loadedAt: 0,
    source: "supabase",
    balance: {} as never,
    tradableResourceIds: [],
    idMigrationMap: {},
  } as unknown as GameConfig;
}

describe("V-015 / PR-BP-3 — seasonal events preserve DB columns", () => {
  it("forwards season/startDate/endDate/isActive through runtime cache", () => {
    updateFromSupabase(buildGameConfig());
    expect(SEASONAL_EVENTS).toHaveLength(1);
    const e = SEASONAL_EVENTS[0] as unknown as Record<string, unknown>;
    expect(e.season).toBe("winter");
    expect(e.startDate).toBe("2026-12-01T00:00:00.000Z");
    expect(e.endDate).toBe("2027-01-31T23:59:59.000Z");
    expect(e.isActive).toBe(true);
  });

  it("keeps legacy literal defaults for duration/color/triggerChance", () => {
    updateFromSupabase(buildGameConfig());
    const e = SEASONAL_EVENTS[0] as unknown as Record<string, unknown>;
    // Legacy fallback literals — pinned to catch silent changes.
    expect(e.duration).toBe(500);
    expect(e.color).toBe("#a855f7");
    expect(e.triggerChance).toBe(0.001);
  });
});
