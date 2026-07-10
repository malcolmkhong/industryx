import { describe, expect, it } from "vitest";

import { DEFAULT_BALANCE_SUBSET, type GameConfig } from "@/lib/game/config";
import { RESOURCE_META, updateFromSupabase } from "@/lib/game/configCache";

function makeConfig(resources: GameConfig["resources"]): GameConfig {
  return {
    buildings: {},
    resources,
    research: [],
    market: [],
    tradableResourceIds: [],
    weather: {},
    workers: [],
    transport: [],
    automation: [],
    prestigeBonuses: [],
    rankThresholds: [],
    quests: [],
    dailyRewards: [],
    eventTemplates: [],
    seasonalEvents: [],
    megaProjects: [],
    gameConfig: {},
    balance: DEFAULT_BALANCE_SUBSET,
    productionChains: [],
    loadedAt: Date.now(),
    source: "supabase",
  };
}

describe("configCache resource metadata", () => {
  it("preserves Supabase baseCapacity for server consumers", () => {
    updateFromSupabase(
      makeConfig({
        water: {
          name: "Water",
          icon: "water-drop",
          tier: 0,
          color: "#38bdf8",
          category: "raw",
          baseCapacity: 200,
        },
      }),
    );

    expect(RESOURCE_META.water.baseCapacity).toBe(200);
  });
});
