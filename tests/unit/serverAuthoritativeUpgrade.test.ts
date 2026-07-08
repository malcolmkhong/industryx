// ============================================
// tests/unit/serverAuthoritativeUpgrade.test.ts
//
// Phase 6, action #2: server-authoritative upgradeBuilding. Verifies
// that `validateUpgradeAction` computes the SCALED upgrade cost on the
// server, applies the mega-project cost reduction, and returns
// authoritative `correctedState` (level +1, money/resources deducted,
// efficiency +0.1 capped at 2.0).
//
// Before this fix, `upgradeBuilding` was 100% client-side: it computed
// cost via getBuildingCost(), called set() directly, and never asked
// the server. A cheater could set state.money = 999999 and upgrade
// without server validation.
// ============================================

import { describe, it, expect } from "vitest";
import { validateUpgradeAction } from "@/lib/game/serverEngine";
import type { GameConfig } from "@/lib/game/config";
import type {
  BuildingDefinition,
  BuildingInstance,
  GameState,
} from "@/lib/game/types";

function makeConfig(overrides?: Partial<BuildingDefinition>): GameConfig {
  const buildingDef = {
    type: "ironMine" as const,
    name: "Iron Mine",
    description: "Mines iron ore.",
    category: "extractor" as const,
    tier: 0,
    baseCost: [{ resource: "money", amount: 400 }],
    costMultiplier: 1.5,
    basePowerConsumption: 10,
    basePowerProduction: 0,
    baseProductionRate: 1,
    fuelRate: 0,
    icon: "test:iron",
    ...overrides,
  } as BuildingDefinition;
  return {
    buildings: { ironMine: buildingDef },
    resources: {},
    research: [],
    market: [],
    workers: [],
    transport: {},
    automation: [],
    prestigeBonuses: [],
    rankThresholds: [],
    quests: [],
    dailyRewards: [],
    eventTemplates: [],
    seasonalEvents: [],
    megaProjects: [],
    weather: {},
    productionChains: [],
    tradableResourceIds: [],
    gameConfig: {} as never,
    loadedAt: 0,
    source: "test",
  } as unknown as GameConfig;
}

function makeBuilding(level = 1, efficiency = 1): BuildingInstance {
  return {
    id: "b1",
    type: "ironMine" as const,
    level,
    active: true,
    efficiency,
    placedAt: 0,
  };
}

function makeState(overrides?: {
  money?: number;
  totalMoneyEarned?: number;
  buildings?: BuildingInstance[];
  resources?: Record<string, number>;
}): Partial<GameState> {
  return {
    money: overrides?.money ?? 1000,
    totalMoneyEarned: overrides?.totalMoneyEarned ?? 1000,
    gameTick: 100,
    buildings: overrides?.buildings ?? [makeBuilding(1)],
    resources: (overrides?.resources ?? { iron: 0 }) as Record<string, number>,
  };
}

describe("validateUpgradeAction (server-authoritative)", () => {
  it("returns valid + correctedState for affordable upgrade", () => {
    const config = makeConfig();
    const state = makeState({ money: 1000 });
    const result = validateUpgradeAction("b1", state, config);

    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    // Level 1 -> 2: cost = ceil(400 * 1.5^1) = 600
    expect(result.correctedState?.money).toBe(400);
    const buildings = result.correctedState?.buildings as BuildingInstance[];
    expect(buildings[0].level).toBe(2);
    // Efficiency +0.1 per upgrade
    expect(buildings[0].efficiency).toBeCloseTo(1.1);
  });

  it("uses SCALED cost (not base cost) for higher-level buildings", () => {
    const config = makeConfig();
    // Level 5 -> 6: money cost = floor(400 * 1.5^5) = 3037
    const state = makeState({
      money: 10000,
      buildings: [makeBuilding(5)],
    });
    const result = validateUpgradeAction("b1", state, config);

    expect(result.valid).toBe(true);
    const expectedScaled = Math.floor(400 * Math.pow(1.5, 5));
    expect(result.correctedState?.money).toBe(10000 - expectedScaled);
  });

  it("rejects upgrade when player cannot afford SCALED cost", () => {
    const config = makeConfig();
    // Level 5 needs ~3038 money, but player has 100
    const state = makeState({
      money: 100,
      buildings: [makeBuilding(5)],
    });
    const result = validateUpgradeAction("b1", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not enough money");
    expect(result.correctedState).toBeUndefined();
  });

  it("applies mega-project cost reduction server-side", () => {
    const config = makeConfig();
    const state = makeState({
      money: 10000,
      buildings: [makeBuilding(1)],
      // 20% off all building costs
    } as Partial<GameState>);
    state.megaProjects = [
      {
        id: "p1",
        completed: true,
        bonus: { type: "buildingCostReduction", value: 0.2 },
      } as never,
    ];

    const result = validateUpgradeAction("b1", state, config);

    expect(result.valid).toBe(true);
    // Level 1->2: scaled = 400*1.5 = 600, with 20% off = 480
    expect(result.correctedState?.money).toBe(10000 - 480);
  });

  it("does NOT increment totalMoneyEarned on upgrade (spend path)", () => {
    const config = makeConfig();
    const state = makeState({ money: 1000, totalMoneyEarned: 5000 });
    const result = validateUpgradeAction("b1", state, config);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.totalMoneyEarned).toBeUndefined();
  });

  it("deducts non-money resources from cost array", () => {
    const config = makeConfig({
      baseCost: [
        { resource: "money", amount: 400 },
        { resource: "iron", amount: 50 },
      ],
    });
    const state = makeState({
      money: 1000,
      resources: { iron: 100 } as Record<string, number>,
    });
    const result = validateUpgradeAction("b1", state, config);

    expect(result.valid).toBe(true);
    // money: floor(400*1.5) = 600
    // iron: ceil(50*1.5) = 75
    expect(result.correctedState?.money).toBe(400);
    const resources = result.correctedState?.resources as Record<
      string,
      number
    >;
    expect(resources.iron).toBe(25); // 100 - 75
  });

  it("rejects upgrade for non-existent buildingId", () => {
    const config = makeConfig();
    const state = makeState();
    const result = validateUpgradeAction("b999", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Building instance "b999" not found');
  });

  it("rejects upgrade when building type is not in config", () => {
    const config = makeConfig();
    const state = makeState();
    const stateBad: Partial<GameState> = {
      ...state,
      buildings: [
        {
          id: "b1",
          type: "unknownBuilding" as never,
          level: 1,
          active: true,
          efficiency: 1,
          placedAt: 0,
        },
      ],
    };
    const result = validateUpgradeAction("b1", stateBad, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found in game config");
  });

  it("efficiency capped at 2.0 after upgrades", () => {
    const config = makeConfig();
    // Start at efficiency 1.95 — one more upgrade would push to 2.05 but should cap at 2.0
    const state = makeState({
      money: 10000,
      buildings: [makeBuilding(5, 1.95)],
    });
    const result = validateUpgradeAction("b1", state, config);

    expect(result.valid).toBe(true);
    const buildings = result.correctedState?.buildings as BuildingInstance[];
    expect(buildings[0].level).toBe(6);
    expect(buildings[0].efficiency).toBe(2.0); // capped, not 2.05
  });

  it("preserves other buildings in the array (only the targeted one is updated)", () => {
    const config = makeConfig();
    const state = makeState({
      money: 10000,
      buildings: [
        makeBuilding(1),
        { ...makeBuilding(3), id: "b2" },
        { ...makeBuilding(2), id: "b3" },
      ],
    });
    const result = validateUpgradeAction("b2", state, config);

    expect(result.valid).toBe(true);
    const buildings = result.correctedState?.buildings as BuildingInstance[];
    expect(buildings).toHaveLength(3);
    expect(buildings[0].id).toBe("b1");
    expect(buildings[0].level).toBe(1); // unchanged
    expect(buildings[1].id).toBe("b2");
    expect(buildings[1].level).toBe(4); // upgraded from 3
    expect(buildings[2].id).toBe("b3");
    expect(buildings[2].level).toBe(2); // unchanged
  });
});
