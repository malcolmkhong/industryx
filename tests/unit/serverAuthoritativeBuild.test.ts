// ============================================
// tests/unit/serverAuthoritativeBuild.test.ts
//
// Regression test for the server-authoritative build action (Phase 1
// server-authoritative refactor). Verifies that `validateBuildAction`
// computes the SCALED cost on the server, returns authoritative
// `correctedState`, and matches the client's `getBuildingCost` formula.
//
// Before this fix, the server only checked affordability against base
// cost while the client applied the scaled cost locally — causing
// client/server divergence when mega-project bonuses or scaled exponent
// differed between the two sides.
// ============================================

import { describe, it, expect } from "vitest";
import { validateBuildAction } from "@/lib/game/production/engine/serverEngine";
import type { GameConfig } from "@/lib/game/config/config";
import type { BuildingDefinition } from "@/lib/game/shared/types/types";

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

describe("validateBuildAction (server-authoritative)", () => {
  it("returns authoritative post-action state with scaled cost (1 building)", () => {
    const config = makeConfig();
    const result = validateBuildAction(
      "ironMine",
      { money: 1000, totalMoneyEarned: 0, gameTick: 100, buildings: [] },
      config,
    );
    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    // 1st building: cost = 400 * 1.5^0 = 400
    expect(result.correctedState?.money).toBe(600);
    expect(
      Array.isArray(result.correctedState?.buildings) &&
        (result.correctedState.buildings as unknown[]).length,
    ).toBe(1);
    expect(
      (
        result.correctedState?.buildings as Array<{
          type: string;
          level: number;
        }>
      )[0].type,
    ).toBe("ironMine");
    expect(
      (
        result.correctedState?.buildings as Array<{
          type: string;
          level: number;
        }>
      )[0].level,
    ).toBe(1);
  });

  it("scales cost by costMultiplier on subsequent buildings", () => {
    const config = makeConfig();
    // Two existing ironMines — currentCount=2, scale = 1.5^2 = 2.25
    // expected cost = floor(400 * 2.25) = 900
    const result = validateBuildAction(
      "ironMine",
      {
        money: 2000,
        totalMoneyEarned: 0,
        gameTick: 200,
        buildings: [
          {
            id: "a",
            type: "ironMine",
            level: 1,
            active: true,
            efficiency: 1,
            placedAt: 0,
          },
          {
            id: "b",
            type: "ironMine",
            level: 1,
            active: true,
            efficiency: 1,
            placedAt: 0,
          },
        ],
      },
      config,
    );
    expect(result.valid).toBe(true);
    // money after deduction: 2000 - 900 = 1100
    expect(result.correctedState?.money).toBe(1100);
    // buildings now has 3 entries
    expect(
      Array.isArray(result.correctedState?.buildings) &&
        (result.correctedState.buildings as unknown[]).length,
    ).toBe(3);
  });

  it("rejects build when money is insufficient for scaled cost", () => {
    const config = makeConfig();
    const result = validateBuildAction(
      "ironMine",
      {
        money: 100,
        totalMoneyEarned: 0,
        gameTick: 100,
        buildings: [],
      },
      config,
    );
    // base cost 400 > 100, so server rejects without applying
    expect(result.valid).toBe(false);
    expect(result.correctedState).toBeUndefined();
    expect(result.error).toMatch(/not enough money/i);
  });

  it("applies mega-project buildingCostReduction to scaled cost", () => {
    const config = makeConfig();
    // 1st building 400 with 25% reduction = floor(400 * 0.75) = 300
    const result = validateBuildAction(
      "ironMine",
      {
        money: 1000,
        totalMoneyEarned: 0,
        gameTick: 100,
        buildings: [],
        megaProjects: [
          {
            type: "terraformingEngine" as const,
            name: "Terraforming Engine",
            description: "",
            icon: "",
            stages: [],
            currentStage: 0,
            progress: 1,
            active: false,
            completed: true,
            bonus: {
              type: "buildingCostReduction" as const,
              description: "",
              value: 0.25,
            },
            unlockRequirement: {},
          },
        ],
      },
      config,
    );
    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(700); // 1000 - 300 = 700
  });

  it("rejects when building type is unknown", () => {
    const config = makeConfig();
    const result = validateBuildAction("nonexistent", { money: 1000 }, config);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("rejects when unlock requirement unmet", () => {
    const config = makeConfig({
      unlockRequirement: { research: "advancedMining", prestige: 0 },
    });
    const result = validateBuildAction(
      "ironMine",
      {
        money: 1000,
        totalMoneyEarned: 0,
        gameTick: 100,
        buildings: [],
        completedResearch: [],
        prestigeState: {
          corporationPoints: 0,
          totalPrestiges: 0,
          megaFactoryUnlocked: false,
          bonuses: [],
        },
      },
      config,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/research/i);
  });
});
