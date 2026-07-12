// tests/unit/serverAuthoritativePrestige.test.ts
// Phase 6 #17 + Phase 12 update.
//
// Phase 12 (2026-07-10) made validatePrestigeAction async — it now
// fetches the canonical reset state server-side via
// `fetchCanonicalInitialState()` and merges prestigeState into a full
// reset shape. All tests must await it.
//
// Also adds Phase 12 assertions:
//   - correctedState is the FULL canonical reset (not just prestige fields)
//   - money/buildings/etc. are reset to canonical defaults
//   - prestigeState is merged into the canonical reset
//   - lastOnlineTimestamp is preserved from the input state when present
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GameState } from "@/lib/game/shared/types/types";

// Mock the canonical helper BEFORE importing the module under test.
// The canonical state is a known stub so the validator can merge prestigeState into it.
vi.mock("@/lib/db/initialState.server", () => ({
  fetchCanonicalInitialState: vi.fn(async () => ({
    money: 1000,
    totalMoneyEarned: 0,
    gameTick: 0,
    gameSpeed: 1,
    paused: false,
    resources: { iron: 0 },
    resourceCapacity: { iron: 100 },
    buildings: [],
    transportLines: [],
    powerGrid: {
      totalProduction: 0, totalConsumption: 0, efficiency: 1, overload: false, plants: [],
    },
    researchPoints: 0,
    completedResearch: [],
    activeResearch: null,
    researchProgress: 0,
    workers: [],
    market: [],
    sectorTrends: {},
    marketNews: [],
    marketNarratives: [],
    serverMarket: { prices: [], news: [], tick: 0, volatility: 0 },
    contracts: [],
    completedContracts: 0,
    automationUnlocks: [],
    prestigeState: {
      corporationPoints: 0,
      totalPrestiges: 0,
      megaFactoryUnlocked: false,
      bonuses: [],
    },
    activeEvents: [],
    eventLog: [],
    stats: {
      totalResourcesProduced: {}, totalResourcesSold: {}, peakEfficiency: 0,
      factoriesBuilt: 0, transportLinesBuilt: 0, researchCompleted: 0,
      contractsCompleted: 0, playTime: 0,
    },
    megaProjects: [],
    productionHistory: [],
    blueprints: [],
    autoSellResources: [],
    storageUpgradeLevels: {},
    lastOnlineTimestamp: 1700000000000, // canonical stub timestamp
    leaderboardEntries: [],
    loginStreak: { currentStreak: 0, longestStreak: 0, lastLoginDate: "", totalLogins: 0, weeklyRewards: [] },
    weather: { current: "clear" as const, intensity: 0, remaining: 0, nextChange: 100 },
    quests: [],
    payoutConfig: { basePayoutInterval: 100, lastPayoutTick: 0, totalPayoutsReceived: 0, autoCollect: true },
    pendingPayout: 0,
    payoutHistory: [],
    trackedQuest: null,
    drones: {
      fleet: [{ id: "stub-drone-id", status: "idle" as const, missionEndTick: 0, missionId: null, speedLevel: 1, capacityLevel: 1, fuelEfficiencyLevel: 1 }],
      completedMissions: 0,
      totalEarned: 0,
    },
    // Phase 13: NO UI fields. fetchCanonicalInitialState returns pure
    // ServerGameData. Client merges UISessionState on hydration.
  })),
}));

// IMPORTANT: import AFTER vi.mock so the mocked module is resolved.
import { validatePrestigeAction } from "@/lib/game/production/engine/serverEngine";
import type { ServerGameData } from "@/lib/game/shared/types/types";

function makeBuilding(id: string) {
  return { id, type: "ironMine" as never, level: 1, efficiency: 1, active: true, placedAt: 0 };
}

function makeState(o?: {
  buildings?: ReturnType<typeof makeBuilding>[];
  completedResearch?: string[];
  contractsCompleted?: number;
  corporationPoints?: number;
  totalPrestiges?: number;
  lastOnlineTimestamp?: number;
}): Partial<ServerGameData> {
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
    lastOnlineTimestamp: o?.lastOnlineTimestamp,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validatePrestigeAction (server-authoritative)", () => {
  // ─── Phase 6 (#17) assertions ─────────────────────────────────────────

  it("returns valid + correctedState for eligible prestige", async () => {
    const state = makeState();
    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    const ps = result.correctedState?.prestigeState as {
      corporationPoints: number; totalPrestiges: number;
    };
    expect(ps.corporationPoints).toBeGreaterThan(0);
    expect(ps.totalPrestiges).toBe(1);
  });

  it("computes CP using server-side formula", async () => {
    const buildings = Array.from({ length: 10 }, (_, i) => makeBuilding(`b${i}`));
    const state = makeState({
      buildings,
      completedResearch: ["r1", "r2", "r3"],
      contractsCompleted: 5,
    });
    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const ps = result.correctedState?.prestigeState as { corporationPoints: number };
    expect(ps.corporationPoints).toBeGreaterThanOrEqual(15);
    expect(ps.corporationPoints).toBeLessThanOrEqual(20);
  });

  it("increments totalPrestiges by exactly 1", async () => {
    const state = makeState({ totalPrestiges: 4 });
    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const ps = result.correctedState?.prestigeState as { totalPrestiges: number };
    expect(ps.totalPrestiges).toBe(5);
  });

  it("adds to existing corporationPoints (does not reset)", async () => {
    const state = makeState({ corporationPoints: 100 });
    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const ps = result.correctedState?.prestigeState as { corporationPoints: number };
    expect(ps.corporationPoints).toBeGreaterThan(100);
  });

  it("rejects when buildings < 5", async () => {
    const state = makeState({ buildings: [makeBuilding("a"), makeBuilding("b"), makeBuilding("c"), makeBuilding("d")] });
    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least 5 buildings");
    expect(result.correctedState).toBeUndefined();
  });

  it("rejects when buildings empty", async () => {
    const state = makeState({ buildings: [] });
    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(false);
  });

  it("preserves megaFactoryUnlocked and bonuses in correctedState", async () => {
    const state = makeState();
    state.prestigeState = {
      ...state.prestigeState!,
      megaFactoryUnlocked: true,
      bonuses: [{ id: "b1", purchased: true } as never],
    };
    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const ps = result.correctedState?.prestigeState as {
      megaFactoryUnlocked: boolean;
      bonuses: unknown[];
    };
    expect(ps.megaFactoryUnlocked).toBe(true);
    expect(ps.bonuses.length).toBe(1);
  });

  it("exactly 5 buildings accepted (boundary)", async () => {
    const state = makeState({ buildings: [makeBuilding("a"), makeBuilding("b"), makeBuilding("c"), makeBuilding("d"), makeBuilding("e")] });
    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(true);
  });

  it("scales with research count", async () => {
    const s0 = makeState({ completedResearch: [] });
    const s3 = makeState({ completedResearch: ["a", "b", "c"] });
    const r0 = await validatePrestigeAction(s0);
    const r3 = await validatePrestigeAction(s3);
    const cp0 = (r0.correctedState?.prestigeState as { corporationPoints: number }).corporationPoints;
    const cp3 = (r3.correctedState?.prestigeState as { corporationPoints: number }).corporationPoints;
    expect(cp3 - cp0).toBeGreaterThanOrEqual(6);
    expect(cp3 - cp0).toBeLessThanOrEqual(7);
  });

  it("scales with contractsCompleted", async () => {
    const s0 = makeState({ contractsCompleted: 0 });
    const s10 = makeState({ contractsCompleted: 10 });
    const r0 = await validatePrestigeAction(s0);
    const r10 = await validatePrestigeAction(s10);
    const cp0 = (r0.correctedState?.prestigeState as { corporationPoints: number }).corporationPoints;
    const cp10 = (r10.correctedState?.prestigeState as { corporationPoints: number }).corporationPoints;
    expect(cp10 - cp0).toBe(10);
  });

  // ─── Phase 12 assertions — full canonical reset shape ────────────────

  it("returns FULL canonical reset in correctedState (not just prestigeState)", async () => {
    const state = makeState();
    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const cs = result.correctedState as Partial<ServerGameData>;
    // Every visible field is reset to canonical defaults
    expect(cs.money).toBe(1000);                              // canonical money
    expect(cs.totalMoneyEarned).toBe(0);
    expect(cs.gameTick).toBe(0);
    expect(cs.gameSpeed).toBe(1);
    expect(cs.buildings).toEqual([]);                         // reset
    expect(cs.resources).toEqual({ iron: 0 });                // canonical zeros
    expect(cs.resourceCapacity).toEqual({ iron: 100 });       // canonical capacity
    expect(cs.researchPoints).toBe(0);
    expect(cs.completedResearch).toEqual([]);
    expect(cs.workers).toEqual([]);
    expect(cs.contracts).toEqual([]);
    // prestigeState is merged with the increment
    const ps = cs.prestigeState as { corporationPoints: number; totalPrestiges: number };
    expect(ps.totalPrestiges).toBe(1);
  });

  it("overrides pre-prestige state values with canonical defaults", async () => {
    // Build a state with massive resources / money / buildings
    const buildings = Array.from({ length: 50 }, (_, i) => makeBuilding(`b${i}`));
    const state = makeState({
      buildings,
      corporationPoints: 9999,
      totalPrestiges: 9,
    });
    state.money = 1_000_000;
    // Cast: stubbing resources with just iron for the override-prove test.
    // (Partial<GameState>['resources'] is a strict record of all 82 keys;
    // the validator only reads the iron field for this assertion.)
    state.resources = { iron: 9999 } as never;

    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const cs = result.correctedState as Partial<ServerGameData>;
    // Pre-prestige values must NOT leak through to correctedState
    expect(cs.money).toBe(1000);
    expect(cs.buildings).toEqual([]);
    expect(cs.resources).toEqual({ iron: 0 });
    // Existing CP + earned CP (50 * 0.5 = 25) → 10024, totalPrestiges = 10
    const ps = cs.prestigeState as { corporationPoints: number; totalPrestiges: number };
    expect(ps.corporationPoints).toBeGreaterThan(9999);
    expect(ps.totalPrestiges).toBe(10);
  });

  it("preserves lastOnlineTimestamp from input state when present", async () => {
    const state = makeState({ lastOnlineTimestamp: 1710000000000 });
    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const cs = result.correctedState as Partial<ServerGameData>;
    expect(cs.lastOnlineTimestamp).toBe(1710000000000);
  });

  it("falls back to canonical lastOnlineTimestamp when not in input", async () => {
    const state = makeState();
    // No lastOnlineTimestamp on input
    const result = await validatePrestigeAction(state);
    expect(result.valid).toBe(true);
    const cs = result.correctedState as Partial<ServerGameData>;
    expect(cs.lastOnlineTimestamp).toBe(1700000000000); // from canonical mock
  });

  it("is async (returns Promise)", () => {
    const state = makeState();
    const ret = validatePrestigeAction(state);
    expect(ret).toBeInstanceOf(Promise);
  });
});
