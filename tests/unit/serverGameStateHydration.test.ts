import { describe, expect, it, vi } from "vitest";

const canonical = {
  money: 2000,
  totalMoneyEarned: 0,
  researchPoints: 0,
  buildings: [],
  completedResearch: [],
  resources: { iron: 0, copper: 0 },
  workers: [],
  gameTick: 0,
  gameSpeed: 1,
  quests: [],
  resourceCapacity: { iron: 100, copper: 100 },
  drones: { fleet: [], completedMissions: 0, totalEarned: 0 },
  payoutConfig: {
    basePayoutInterval: 100,
    lastPayoutTick: 0,
    totalPayoutsReceived: 0,
    autoCollect: true,
  },
};

vi.mock("@/lib/db/infra/initialState.server", () => ({
  fetchCanonicalInitialState: vi.fn(async () => structuredClone(canonical)),
}));

import { buildCompleteFullStateForServerRow } from "@/lib/db/game/serverGameState";

describe("buildCompleteFullStateForServerRow", () => {
  it("merges denormalized server_game_state columns into partial full_state", async () => {
    const fullState = await buildCompleteFullStateForServerRow({
      full_state: { resourceCapacity: { iron: 250 }, drones: canonical.drones },
      money: 5379,
      total_money_earned: 4000,
      research_points: 12,
      buildings: [{ id: "b1", type: "ironMine", level: 1 }],
      completed_research: ["basicMining"],
      resources: { iron: 33 },
      workers: [],
      game_tick: 42,
      game_speed: 2,
    });

    expect(fullState.money).toBe(5379);
    expect(fullState.totalMoneyEarned).toBe(4000);
    expect(fullState.researchPoints).toBe(12);
    expect(fullState.buildings).toEqual([
      { id: "b1", type: "ironMine", level: 1 },
    ]);
    expect(fullState.completedResearch).toEqual(["basicMining"]);
    expect(fullState.resources).toEqual({ iron: 33 });
    expect(fullState.gameTick).toBe(42);
    expect(fullState.gameSpeed).toBe(2);
    expect(fullState.resourceCapacity).toEqual({ iron: 250 });
    expect(fullState.payoutConfig).toEqual(canonical.payoutConfig);
  });

  it("rejects invalid required denormalized numeric columns", async () => {
    await expect(
      buildCompleteFullStateForServerRow({
        full_state: {},
        money: "not-money",
        total_money_earned: 0,
        research_points: 0,
        buildings: [],
        completed_research: [],
        resources: {},
        workers: [],
        game_tick: 0,
        game_speed: 1,
      }),
    ).rejects.toThrow(/money/);
  });

  // BUG-093: placeholder rows written by the bootstrap RPC
  // (`full_state = {"bootstrap_pending": true}`) carry denormalized
  // columns that hardcode money=0 / game_tick=0. Without the read-side
  // safety net, the hydration overrides canonical.money=2000 with row.money=0
  // and ships a $0 ServerGameData. The patch makes the placeholder shape
  // bypass the overrides entirely.
  it("treats bootstrap_pending placeholder as canonical-only (BUG-093)", async () => {
    const fullState = await buildCompleteFullStateForServerRow({
      full_state: { bootstrap_pending: true },
      money: 0,
      total_money_earned: 0,
      research_points: 0,
      buildings: [],
      completed_research: [],
      resources: {},
      workers: [],
      game_tick: 0,
      game_speed: 1,
    });

    expect(fullState.money).toBe(2000);
    expect(fullState.totalMoneyEarned).toBe(0);
    expect(fullState.researchPoints).toBe(0);
    expect(fullState.gameTick).toBe(0);
    expect(fullState.gameSpeed).toBe(1);
    expect(fullState.buildings).toEqual(canonical.buildings);
    expect(fullState.completedResearch).toEqual(canonical.completedResearch);
    expect(fullState.resources).toEqual(canonical.resources);
    expect(fullState.workers).toEqual(canonical.workers);
    // full_state itself is not propagated back as a top-level field, but its
    // effect on the merged shape is verified above (canonical wins).
    expect(fullState.payoutConfig).toEqual(canonical.payoutConfig);
    expect(fullState.resourceCapacity).toEqual(canonical.resourceCapacity);
  });

  it("non-placeholder row with money=0 still returns money=0 (no false-positive)", async () => {
    // Defensive: an actual played player with $0 (e.g. spent everything) and
    // a real full_state must NOT be mistaken for a placeholder.
    const fullState = await buildCompleteFullStateForServerRow({
      full_state: { resourceCapacity: { iron: 250 }, customFlag: "real" },
      money: 0,
      total_money_earned: 5000,
      research_points: 12,
      buildings: [{ id: "b1", type: "ironMine", level: 1 }],
      completed_research: ["basicMining"],
      resources: { iron: 33 },
      workers: [],
      game_tick: 42,
      game_speed: 2,
    });

    expect(fullState.money).toBe(0);
    expect(fullState.totalMoneyEarned).toBe(5000);
    expect(fullState.gameTick).toBe(42);
    expect(fullState.gameSpeed).toBe(2);
    expect(fullState.resourceCapacity).toEqual({ iron: 250 });
  });
});
