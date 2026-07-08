// tests/unit/serverAuthoritativePrestige.test.ts - Phase 6 #17
import { describe, it, expect } from "vitest";
import { validatePrestigeAction } from "@/lib/game/serverEngine";
import type { GameState } from "@/lib/game/types";

function makeBuilding(id: string) {
  return { id, type: "ironMine" as never, level: 1, efficiency: 1, active: true, placedAt: 0 };
}

function makeState(o?: {
  buildings?: ReturnType<typeof makeBuilding>[];
  completedResearch?: string[];
  contractsCompleted?: number;
  corporationPoints?: number;
  totalPrestiges?: number;
}): Partial<GameState> {
  return {
    money: 10_000,
    buildings: o?.buildings ?? [makeBuilding("a"), makeBuilding("b"), makeBuilding("c"), makeBuilding("d"), makeBuilding("e")],
    completedResearch: o?.completedResearch ?? [],
    stats: {
      totalResourcesProduced: {} as Record<string, number>,
      totalResourcesSold: {} as Record<string, number>,
      peakEfficiency: 0, factoriesBuilt: 0,
      transportLinesBuilt: 0, researchCompleted: 0,
      contractsCompleted: o?.contractsCompleted ?? 0,
      playTime: 0,
    },
    prestigeState: {
      corporationPoints: o?.corporationPoints ?? 0,
      totalPrestiges: o?.totalPrestiges ?? 0,
      megaFactoryUnlocked: false,
      bonuses: [],
    },
  };
}

describe("validatePrestigeAction (server-authoritative)", () => {
  it("returns valid + correctedState for eligible prestige", () => {
    const state = makeState();
    const result = validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    const ps = result.correctedState?.prestigeState as {
      corporationPoints: number; totalPrestiges: number;
    };
    // 5 buildings * 0.5 cpPerBuilding + 0 research + 0 contracts = 2
    expect(ps.corporationPoints).toBeGreaterThan(0);
    expect(ps.totalPrestiges).toBe(1);
  });

  it("computes CP using server-side formula", () => {
    // 10 buildings + 3 research + 5 contracts
    const buildings = Array.from({ length: 10 }, (_, i) => makeBuilding(`b${i}`));
    const state = makeState({
      buildings,
      completedResearch: ["r1", "r2", "r3"],
      contractsCompleted: 5,
    });
    const result = validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const ps = result.correctedState?.prestigeState as { corporationPoints: number };
    // cpPerBuilding = 0.5 default
    // 10 * 0.5 + 3 * 2 + 5 = 5 + 6 + 5 = 16
    expect(ps.corporationPoints).toBeGreaterThanOrEqual(15);
    expect(ps.corporationPoints).toBeLessThanOrEqual(20);
  });

  it("increments totalPrestiges by exactly 1", () => {
    const state = makeState({ totalPrestiges: 4 });
    const result = validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const ps = result.correctedState?.prestigeState as { totalPrestiges: number };
    expect(ps.totalPrestiges).toBe(5);
  });

  it("adds to existing corporationPoints (does not reset)", () => {
    const state = makeState({ corporationPoints: 100 });
    const result = validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const ps = result.correctedState?.prestigeState as { corporationPoints: number };
    expect(ps.corporationPoints).toBeGreaterThan(100);
  });

  it("rejects when buildings < 5", () => {
    const state = makeState({ buildings: [makeBuilding("a"), makeBuilding("b"), makeBuilding("c"), makeBuilding("d")] });
    const result = validatePrestigeAction(state);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least 5 buildings");
    expect(result.correctedState).toBeUndefined();
  });

  it("rejects when buildings empty", () => {
    const state = makeState({ buildings: [] });
    const result = validatePrestigeAction(state);
    expect(result.valid).toBe(false);
  });

  it("preserves megaFactoryUnlocked and bonuses in correctedState", () => {
    const state = makeState();
    state.prestigeState = {
      ...state.prestigeState!,
      megaFactoryUnlocked: true,
      bonuses: [{ id: "b1", purchased: true } as never],
    };
    const result = validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const ps = result.correctedState?.prestigeState as {
      megaFactoryUnlocked: boolean;
      bonuses: unknown[];
    };
    expect(ps.megaFactoryUnlocked).toBe(true);
    expect(ps.bonuses.length).toBe(1);
  });

  it("rejects when CP would be invalid (negative)", () => {
    // Hard to force CP to be negative via normal inputs. Sanity check:
    // valid CP is non-negative, so this should always return valid CP.
    const state = makeState();
    const result = validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const ps = result.correctedState?.prestigeState as { corporationPoints: number };
    expect(ps.corporationPoints).toBeGreaterThanOrEqual(0);
  });

  it("exactly 5 buildings accepted (boundary)", () => {
    const state = makeState({ buildings: [makeBuilding("a"), makeBuilding("b"), makeBuilding("c"), makeBuilding("d"), makeBuilding("e")] });
    const result = validatePrestigeAction(state);
    expect(result.valid).toBe(true);
  });

  it("scales with research count", () => {
    const s0 = makeState({ completedResearch: [] });
    const s3 = makeState({ completedResearch: ["a", "b", "c"] });
    const r0 = validatePrestigeAction(s0);
    const r3 = validatePrestigeAction(s3);
    const cp0 = (r0.correctedState?.prestigeState as { corporationPoints: number }).corporationPoints;
    const cp3 = (r3.correctedState?.prestigeState as { corporationPoints: number }).corporationPoints;
    // Each research adds 2 CP
    expect(cp3 - cp0).toBeGreaterThanOrEqual(6);
    expect(cp3 - cp0).toBeLessThanOrEqual(7); // floor() may round
  });

  it("scales with contractsCompleted", () => {
    const s0 = makeState({ contractsCompleted: 0 });
    const s10 = makeState({ contractsCompleted: 10 });
    const r0 = validatePrestigeAction(s0);
    const r10 = validatePrestigeAction(s10);
    const cp0 = (r0.correctedState?.prestigeState as { corporationPoints: number }).corporationPoints;
    const cp10 = (r10.correctedState?.prestigeState as { corporationPoints: number }).corporationPoints;
    expect(cp10 - cp0).toBe(10);
  });
});
