// ============================================
// tests/unit/gameTick.inputFloor.test.ts
//
// Regression test for Phase 1 / C2 bug: when multiple identical factories
// run in the same tick, their `canProduce` check must observe the
// post-consumption state of the prior factory. Otherwise the total input
// consumed in one tick can exceed the player's actual stock and the
// resource balance goes negative.
//
// We exercise the production calculator directly (the same call site the
// game tick uses) to isolate the logic. We inject `gameDefs` so we don't
// depend on Supabase-populated BUILDING_DEFS at test time.
// ============================================

import { describe, it, expect } from "vitest";

import {
  computeProduction,
  type GameDefs,
  type MultiplierCache,
} from "@/lib/game/production/productionCalculator";
import type { BuildingInstance, BuildingDefinition } from "@/lib/game/shared/types/types";

function makeMultiplierCache(gameDefs?: GameDefs): MultiplierCache {
  return {
    modifierEngine: null,
    gameDefs,
    eventProductionGlobal: 1,
    eventProductionTargeted: new Map(),
    eventPowerConsumption: 1,
    eventResearch: 1,
    weatherProduction: 1,
    weatherSolar: 1,
    weatherWind: 1,
    powerEfficiency: 1,
    transportProductionBonus: 1,
    transportThroughputBonus: 0,
    productionBonus: 0,
    extractorBonus: 0,
    factoryBonus: 0,
    t1FactoryBonus: 0,
    t2FactoryBonus: 0,
    t3FactoryBonus: 0,
    marketBonus: 0,
    hasMarketAnalysis: false,
    transportMegaBonus: 0,
    workerEfficiencyResearchBonus: 0,
    workerEfficiencyTotal: 0,
    workersByBuilding: new Map(),
    specificBuildingBonuses: new Map(),
  } as unknown as MultiplierCache;
}

// Synthetic factory: 2 iron + 1 coal -> 1 steel. Mirrors the pre-refactor
// steelForge shape so the test exercises the production branch in
// productionCalculator.ts:541 (`def.category === "factory" && def.inputs
// && def.outputs`).
function makeSteelForgeDef(): BuildingDefinition {
  return {
    type: "testForge",
    name: "Test Forge",
    description: "Synthetic factory for C2 regression test",
    category: "factory",
    tier: 1,
    baseCost: { resource: "money", amount: 0 },
    costMultiplier: 1,
    basePowerConsumption: 0,
    basePowerProduction: 0,
    baseProductionRate: 1,
    inputs: [
      { resource: "iron", amount: 2 },
      { resource: "coal", amount: 1 },
    ],
    outputs: [{ resource: "steel", amount: 1 }],
    icon: "test",
  } as unknown as BuildingDefinition;
}

describe("C2 input resource floor", () => {
  it("two identical factories sharing a 3-iron/2-coal stockpile produce at most once", () => {
    // C2 fix: propagate a `consumed` shadow array through the factory
    // loop so factory #N sees post-consumption state of factories
    // #1..N-1. Without it, two factories collectively consume 4 iron
    // from a 3-iron stockpile and drive the balance negative.
    const def = makeSteelForgeDef();
    const gameDefs: GameDefs = { buildings: { testForge: def }, workers: {} };
    const cache = makeMultiplierCache(gameDefs);

    const factory = {
      id: "f1",
      type: "testForge",
      level: 1,
      efficiency: 1,
      active: true,
      placedAt: 0,
    } as unknown as BuildingInstance;

    // Stock: 3 iron, 2 coal (enough for 1 factory, not 2).
    const startingResources: Record<string, number> = {
      iron: 3,
      coal: 2,
      steel: 0,
    };
    const consumed = { ...startingResources };

    // Factory A — consumes 2 iron + 1 coal.
    const resultA = computeProduction(factory, cache, consumed);
    expect(resultA.canProduce).toBe(true);
    expect(resultA.actualInputs.length).toBeGreaterThan(0);

    // Apply A's consumption to the shadow array (mirroring gameTick.ts).
    for (const input of resultA.actualInputs) {
      consumed[input.resource] = (consumed[input.resource] ?? 0) - input.amount;
    }

    // After A: 1 iron, 1 coal left.
    expect(consumed.iron).toBe(1);
    expect(consumed.coal).toBe(1);

    // Factory B — must observe the post-A state.
    const resultB = computeProduction(factory, cache, consumed);
    expect(resultB.canProduce).toBe(false);
    expect(resultB.actualInputs.length).toBe(0);

    // Sanity: state never goes negative.
    expect(consumed.iron).toBeGreaterThanOrEqual(0);
    expect(consumed.coal).toBeGreaterThanOrEqual(0);
  });

  it("WITHOUT C2 fix, two factories against the same static stock both produce (documenting the bug shape)", () => {
    // This test documents the original bug: if gameTick.ts naively passes
    // `newResources` (the pre-loop snapshot) to every factory, both
    // factories canProduce=true and collectively consume 4 iron / 2 coal
    // from a 3-iron / 2-coal stockpile. Used as a regression sentinel —
    // if this behavior ever changes at the production-calculator level,
    // the C2 fix in gameTick.ts would no longer be necessary.
    const def = makeSteelForgeDef();
    const gameDefs: GameDefs = { buildings: { testForge: def }, workers: {} };
    const cache = makeMultiplierCache(gameDefs);

    const factory = {
      id: "f1",
      type: "testForge",
      level: 1,
      efficiency: 1,
      active: true,
      placedAt: 0,
    } as unknown as BuildingInstance;

    const staticStock = { iron: 3, coal: 2, steel: 0 };

    const a = computeProduction(factory, cache, staticStock);
    const b = computeProduction(factory, cache, staticStock);

    expect(a.canProduce).toBe(true);
    expect(b.canProduce).toBe(true);

    // Total demand if both produce: 4 iron, 2 coal. Stock only had 3/2.
    // This over-consumption is the bug gameTick.ts:107 used to have.
    const totalIronDemand = (a.actualInputs[0]?.amount ?? 0) +
      (b.actualInputs[0]?.amount ?? 0);
    expect(totalIronDemand).toBeGreaterThan(staticStock.iron);
  });

  it("production calculator never returns canProduce=true when any input is below threshold", () => {
    // Defensive: the calculator itself must check availability correctly.
    const def = makeSteelForgeDef();
    const gameDefs: GameDefs = { buildings: { testForge: def }, workers: {} };
    const cache = makeMultiplierCache(gameDefs);

    const factory = {
      id: "f1",
      type: "testForge",
      level: 1,
      efficiency: 1,
      active: true,
      placedAt: 0,
    } as unknown as BuildingInstance;

    // Exactly enough stock: produces.
    expect(
      computeProduction(factory, cache, { iron: 2, coal: 1, steel: 0 })
        .canProduce,
    ).toBe(true);

    // One iron short: does NOT produce.
    expect(
      computeProduction(factory, cache, { iron: 1, coal: 1, steel: 0 })
        .canProduce,
    ).toBe(false);

    // Zero stock: does NOT produce.
    expect(
      computeProduction(factory, cache, { iron: 0, coal: 0, steel: 0 })
        .canProduce,
    ).toBe(false);

    // Missing resource key (treated as 0): does NOT produce.
    expect(
      computeProduction(factory, cache, { steel: 0 }).canProduce,
    ).toBe(false);
  });
});
