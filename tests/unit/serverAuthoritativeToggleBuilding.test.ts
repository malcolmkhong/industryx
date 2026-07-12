// ============================================
// tests/unit/serverAuthoritativeToggleBuilding.test.ts
//
// Phase 6, action #1: server-authoritative toggleBuilding. Verifies that
// `validateToggleBuildingAction` flips the `active` flag and returns the
// post-toggle buildings array in `correctedState`. Does NOT touch money
// (toggle is a no-cost state transition).
//
// Before this fix, `toggleBuilding` called the server for validation but
// then applied its own local `set({...})` instead of the server-returned
// `correctedState`. The correctedState was silently dropped.
// ============================================

import { describe, it, expect } from "vitest";
import { validateToggleBuildingAction } from "@/lib/game/production/engine/serverEngine";
import type {
  GameState,
  BuildingInstance,
  BuildingType,
} from "@/lib/game/shared/types/types";

function makeState(
  buildings: Array<{ id: string; active: boolean; type?: BuildingType }>,
): Partial<GameState> {
  return {
    money: 1000,
    totalMoneyEarned: 1000,
    gameTick: 100,
    buildings: buildings.map((b) => ({
      id: b.id,
      type: b.type ?? ("ironMine" as BuildingType),
      level: 1,
      active: b.active,
      efficiency: 1,
      placedAt: 0,
    })) as BuildingInstance[],
  };
}

describe("validateToggleBuildingAction (server-authoritative)", () => {
  it("flips active=false to active=true and returns correctedState", () => {
    const state = makeState([{ id: "b1", active: false }]);
    const result = validateToggleBuildingAction("b1", true, state);

    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    const buildings = result.correctedState?.buildings as Array<{
      id: string;
      active: boolean;
    }>;
    expect(buildings).toHaveLength(1);
    expect(buildings[0].id).toBe("b1");
    expect(buildings[0].active).toBe(true);
  });

  it("flips active=true to active=false", () => {
    const state = makeState([{ id: "b1", active: true }]);
    const result = validateToggleBuildingAction("b1", false, state);

    expect(result.valid).toBe(true);
    const buildings = result.correctedState?.buildings as Array<{
      id: string;
      active: boolean;
    }>;
    expect(buildings[0].active).toBe(false);
  });

  it("does NOT touch money (toggle is a no-cost state transition)", () => {
    const state = makeState([{ id: "b1", active: true }]);
    const result = validateToggleBuildingAction("b1", false, state);

    expect(result.correctedState?.money).toBeUndefined();
    expect(result.correctedState?.totalMoneyEarned).toBeUndefined();
  });

  it("only modifies the targeted building, leaves others untouched", () => {
    const state = makeState([
      { id: "b1", active: true },
      { id: "b2", active: false },
      { id: "b3", active: true },
    ]);
    const result = validateToggleBuildingAction("b2", true, state);

    const buildings = result.correctedState?.buildings as Array<{
      id: string;
      active: boolean;
    }>;
    expect(buildings).toHaveLength(3);
    expect(buildings.find((b) => b.id === "b1")?.active).toBe(true);
    expect(buildings.find((b) => b.id === "b2")?.active).toBe(true);
    expect(buildings.find((b) => b.id === "b3")?.active).toBe(true);
  });

  it("rejects toggle for non-existent building", () => {
    const state = makeState([{ id: "b1", active: true }]);
    const result = validateToggleBuildingAction("b999", false, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Building instance "b999" not found');
    expect(result.correctedState).toBeUndefined();
  });

  it("rejects toggle with non-boolean 'enabled' value", () => {
    const state = makeState([{ id: "b1", active: true }]);
    // Cast through unknown to bypass the type check (simulating a bad client payload)
    const result = validateToggleBuildingAction(
      "b1",
      "yes" as unknown as boolean,
      state,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("'enabled' boolean");
  });

  it("no-op when toggling to the current value (returns unchanged state)", () => {
    const state = makeState([{ id: "b1", active: true }]);
    const result = validateToggleBuildingAction("b1", true, state);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.buildings).toBeDefined();
    const buildings = result.correctedState?.buildings as Array<{
      id: string;
      active: boolean;
    }>;
    expect(buildings[0].active).toBe(true);
  });

  it("returns valid:false with clear error for missing buildingId (empty state)", () => {
    const state: Partial<GameState> = {
      money: 1000,
      totalMoneyEarned: 1000,
      gameTick: 100,
      buildings: [],
    };
    const result = validateToggleBuildingAction("b1", true, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('"b1" not found');
  });
});
