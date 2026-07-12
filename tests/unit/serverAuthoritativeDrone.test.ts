// tests/unit/serverAuthoritativeDrone.test.ts - Phase 6 #13 + #14
import { describe, it, expect } from "vitest";
import {
  validateStartDroneMissionAction,
  validateCollectDroneAction,
} from "@/lib/game/production/engine/serverEngine";
import type { GameState, Drone } from "@/lib/game/shared/types/types";

function makeDrone(o?: Partial<Drone>): Drone {
  return {
    id: "drone-1",
    status: "idle",
    missionEndTick: 0,
    missionId: null,
    speedLevel: 1,
    capacityLevel: 1,
    fuelEfficiencyLevel: 1,
    ...o,
  };
}

function makeState(o?: {
  money?: number;
  gameTick?: number;
  drones?: { fleet: Drone[]; completedMissions: number; totalEarned: number };
  resources?: Record<string, number>;
  resourceCapacity?: Record<string, number>;
  researchPoints?: number;
  totalMoneyEarned?: number;
}): Partial<GameState> {
  return {
    money: o?.money ?? 100_000,
    gameTick: o?.gameTick ?? 100,
    drones: o?.drones ?? {
      fleet: [makeDrone()],
      completedMissions: 0,
      totalEarned: 0,
    },
    resources: (o?.resources ?? {}) as Record<string, number>,
    resourceCapacity: o?.resourceCapacity as never,
    researchPoints: o?.researchPoints ?? 0,
    totalMoneyEarned: o?.totalMoneyEarned ?? 0,
    buildings: [],
    workers: [],
    prestigeState: {
      corporationPoints: 0,
      totalPrestiges: 0,
      megaFactoryUnlocked: false,
      bonuses: [],
    },
  };
}

function withPayload(
  s: Partial<GameState>,
  p: Record<string, unknown>,
): Partial<GameState> {
  return { ...s, ...p } as Partial<GameState>;
}

// PLACEHOLDER_MARKER

describe("validateStartDroneMissionAction (server-authoritative)", () => {
  it("returns valid + correctedState for affordable mission start", () => {
    const state = makeState({ money: 100_000 });
    const result = validateStartDroneMissionAction(
      "drone-mission-ironMine-factoryT1",
      "drone-1",
      withPayload(state, { _missionFuelCost: 50, _missionBaseTicks: 60 }),
    );
    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    expect(result.correctedState?.money).toBeLessThan(100_000);
    const fleet = (result.correctedState?.drones as { fleet: Drone[] }).fleet;
    const drone = fleet.find((d) => d.id === "drone-1");
    expect(drone?.status).toBe("delivering");
    expect(drone?.missionId).toBe("drone-mission-ironMine-factoryT1");
    expect(drone?.missionEndTick).toBeGreaterThan(state.gameTick ?? 0);
  });

  it("rejects when droneId missing", () => {
    const state = makeState();
    const result = validateStartDroneMissionAction(
      "drone-mission-ironMine-factoryT1",
      "",
      withPayload(state, { _missionFuelCost: 50, _missionBaseTicks: 60 }),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing droneId");
  });

  it("rejects when missionId missing", () => {
    const state = makeState();
    const result = validateStartDroneMissionAction(
      "",
      "drone-1",
      withPayload(state, { _missionFuelCost: 50, _missionBaseTicks: 60 }),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing missionId");
  });

  it("rejects when drone not found in fleet", () => {
    const state = makeState();
    const result = validateStartDroneMissionAction(
      "drone-mission-ironMine-factoryT1",
      "nonexistent",
      withPayload(state, { _missionFuelCost: 50, _missionBaseTicks: 60 }),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("rejects when drone already delivering", () => {
    const state = makeState({
      drones: {
        fleet: [makeDrone({ status: "delivering", missionId: "x" })],
        completedMissions: 0,
        totalEarned: 0,
      },
    });
    const result = validateStartDroneMissionAction(
      "drone-mission-x-y",
      "drone-1",
      withPayload(state, { _missionFuelCost: 50, _missionBaseTicks: 60 }),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not idle");
  });

  it("rejects invalid missionId format", () => {
    const state = makeState();
    const result = validateStartDroneMissionAction(
      "rogue",
      "drone-1",
      withPayload(state, { _missionFuelCost: 50, _missionBaseTicks: 60 }),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid missionId format");
  });

  it("rejects when player lacks money for fuel", () => {
    const state = makeState({ money: 1 });
    const result = validateStartDroneMissionAction(
      "drone-mission-x-y",
      "drone-1",
      withPayload(state, { _missionFuelCost: 1000, _missionBaseTicks: 60 }),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not enough money");
  });

  it("higher fuelEfficiencyLevel costs less fuel", () => {
    const r1 = validateStartDroneMissionAction(
      "drone-mission-x-y",
      "drone-1",
      withPayload(makeState({ money: 100_000 }), {
        _missionFuelCost: 100,
        _missionBaseTicks: 60,
        drones: {
          fleet: [makeDrone({ fuelEfficiencyLevel: 1 })],
          completedMissions: 0,
          totalEarned: 0,
        },
      }),
    );
    const r5 = validateStartDroneMissionAction(
      "drone-mission-x-y",
      "drone-2",
      withPayload(makeState({ money: 100_000 }), {
        _missionFuelCost: 100,
        _missionBaseTicks: 60,
        drones: {
          fleet: [makeDrone({ id: "drone-2", fuelEfficiencyLevel: 5 })],
          completedMissions: 0,
          totalEarned: 0,
        },
      }),
    );
    expect(r1.valid && r5.valid).toBe(true);
    const fuelL1 = 100_000 - (r1.correctedState?.money ?? 100_000);
    const fuelL5 = 100_000 - (r5.correctedState?.money ?? 100_000);
    expect(fuelL5).toBeLessThan(fuelL1);
  });

  it("higher speedLevel delivers faster", () => {
    const r1 = validateStartDroneMissionAction(
      "drone-mission-x-y",
      "drone-1",
      withPayload(makeState({ gameTick: 0, money: 100_000 }), {
        _missionFuelCost: 50,
        _missionBaseTicks: 600,
        drones: {
          fleet: [makeDrone({ speedLevel: 1 })],
          completedMissions: 0,
          totalEarned: 0,
        },
      }),
    );
    const r5 = validateStartDroneMissionAction(
      "drone-mission-x-y",
      "drone-2",
      withPayload(makeState({ gameTick: 0, money: 100_000 }), {
        _missionFuelCost: 50,
        _missionBaseTicks: 600,
        drones: {
          fleet: [makeDrone({ id: "drone-2", speedLevel: 5 })],
          completedMissions: 0,
          totalEarned: 0,
        },
      }),
    );
    expect(r1.valid && r5.valid).toBe(true);
    const fleet1 = (r1.correctedState?.drones as { fleet: Drone[] }).fleet;
    const fleet5 = (r5.correctedState?.drones as { fleet: Drone[] }).fleet;
    const end1 = fleet1.find((d) => d.id === "drone-1")?.missionEndTick ?? 0;
    const end5 = fleet5.find((d) => d.id === "drone-2")?.missionEndTick ?? 0;
    expect(end5).toBeLessThan(end1);
  });

  it("deliveryTicks has 10-tick floor", () => {
    const state = makeState({ gameTick: 1000, money: 100_000 });
    const result = validateStartDroneMissionAction(
      "drone-mission-x-y",
      "drone-1",
      withPayload(state, {
        _missionFuelCost: 50,
        _missionBaseTicks: 1,
        drones: {
          fleet: [makeDrone({ speedLevel: 5 })],
          completedMissions: 0,
          totalEarned: 0,
        },
      }),
    );
    expect(result.valid).toBe(true);
    const fleet = (result.correctedState?.drones as { fleet: Drone[] }).fleet;
    expect(fleet[0].missionEndTick - 1000).toBeGreaterThanOrEqual(10);
  });

  it("does NOT change completedMissions or totalEarned on start", () => {
    const state = makeState({
      money: 100_000,
      drones: {
        fleet: [makeDrone()],
        completedMissions: 7,
        totalEarned: 12345,
      },
    });
    const result = validateStartDroneMissionAction(
      "drone-mission-x-y",
      "drone-1",
      withPayload(state, { _missionFuelCost: 50, _missionBaseTicks: 60 }),
    );
    expect(result.valid).toBe(true);
    const drones = result.correctedState?.drones as {
      completedMissions: number;
      totalEarned: number;
    };
    expect(drones.completedMissions).toBe(7);
    expect(drones.totalEarned).toBe(12345);
  });

  it("missing _missionFuelCost defaults to 0 fuel", () => {
    const state = makeState({ money: 1 });
    const result = validateStartDroneMissionAction(
      "drone-mission-x-y",
      "drone-1",
      withPayload(state, { _missionBaseTicks: 60 }),
    );
    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(1);
  });
});

// END_PART_1

describe("validateCollectDroneAction (server-authoritative)", () => {
  it("returns valid + correctedState for completed mission", () => {
    const state = makeState({
      money: 1000,
      totalMoneyEarned: 5000,
      gameTick: 200,
      drones: {
        fleet: [
          makeDrone({
            status: "delivering",
            missionId: "x",
            missionEndTick: 150,
          }),
        ],
        completedMissions: 3,
        totalEarned: 1000,
      },
      researchPoints: 10,
    });
    const result = validateCollectDroneAction(
      "drone-1",
      withPayload(state, {
        _missionRewardMoney: 500,
        _missionRewardResearchPoints: 25,
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(1500);
    expect(result.correctedState?.totalMoneyEarned).toBe(5500);
    expect(result.correctedState?.researchPoints).toBe(35);
    const drones = result.correctedState?.drones as {
      fleet: Drone[];
      completedMissions: number;
      totalEarned: number;
    };
    expect(drones.completedMissions).toBe(4);
    expect(drones.totalEarned).toBe(1500);
    expect(drones.fleet[0].status).toBe("idle");
    expect(drones.fleet[0].missionEndTick).toBe(0);
    expect(drones.fleet[0].missionId).toBeNull();
  });

  it("rejects missing droneId", () => {
    const result = validateCollectDroneAction("", makeState());
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing droneId");
  });

  it("rejects when drone not found", () => {
    const result = validateCollectDroneAction("nonexistent", makeState());
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("rejects when drone is idle (nothing to collect)", () => {
    const result = validateCollectDroneAction("drone-1", makeState());
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not delivering");
  });

  it("rejects when mission not yet complete", () => {
    const state = makeState({
      gameTick: 100,
      drones: {
        fleet: [
          makeDrone({
            status: "delivering",
            missionId: "x",
            missionEndTick: 200,
          }),
        ],
        completedMissions: 0,
        totalEarned: 0,
      },
    });
    const result = validateCollectDroneAction("drone-1", state);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not yet complete");
  });

  it("accepts exactly at missionEndTick (boundary)", () => {
    const state = makeState({
      gameTick: 200,
      money: 100,
      drones: {
        fleet: [
          makeDrone({
            status: "delivering",
            missionId: "x",
            missionEndTick: 200,
          }),
        ],
        completedMissions: 0,
        totalEarned: 0,
      },
    });
    const result = validateCollectDroneAction(
      "drone-1",
      withPayload(state, { _missionRewardMoney: 50 }),
    );
    expect(result.valid).toBe(true);
  });

  it("applies reward resources with storage cap", () => {
    const state = makeState({
      money: 100,
      gameTick: 200,
      resources: { iron: 100 } as Record<string, number>,
      resourceCapacity: { iron: 150 } as Record<string, number>,
      drones: {
        fleet: [
          makeDrone({
            status: "delivering",
            missionId: "x",
            missionEndTick: 100,
          }),
        ],
        completedMissions: 0,
        totalEarned: 0,
      },
    });
    const result = validateCollectDroneAction(
      "drone-1",
      withPayload(state, {
        _missionRewardResources: [{ resource: "iron", amount: 100 }],
      }),
    );
    expect(result.valid).toBe(true);
    const resources = result.correctedState?.resources as Record<
      string,
      number
    >;
    expect(resources.iron).toBe(150);
  });

  it("ignores invalid reward fields (defense-in-depth)", () => {
    const state = makeState({
      money: 100,
      gameTick: 200,
      drones: {
        fleet: [
          makeDrone({
            status: "delivering",
            missionId: "x",
            missionEndTick: 100,
          }),
        ],
        completedMissions: 0,
        totalEarned: 0,
      },
    });
    const result = validateCollectDroneAction(
      "drone-1",
      withPayload(state, {
        _missionRewardMoney: Number.NaN,
        _missionRewardResearchPoints: -5,
        _missionRewardResources: [{ resource: "iron", amount: Number.NaN }],
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(100);
    expect(result.correctedState?.researchPoints).toBe(0);
    const resources = result.correctedState?.resources as Record<
      string,
      number
    >;
    expect(resources.iron).toBeUndefined();
  });

  it("does not mutate other drones' state", () => {
    const state = makeState({
      gameTick: 200,
      money: 100,
      drones: {
        fleet: [
          makeDrone({
            id: "a",
            status: "delivering",
            missionId: "x",
            missionEndTick: 100,
          }),
          makeDrone({ id: "b", status: "idle" }),
        ],
        completedMissions: 0,
        totalEarned: 0,
      },
    });
    const result = validateCollectDroneAction(
      "a",
      withPayload(state, { _missionRewardMoney: 50 }),
    );
    expect(result.valid).toBe(true);
    const fleet = (result.correctedState?.drones as { fleet: Drone[] }).fleet;
    expect(fleet.find((d) => d.id === "b")?.status).toBe("idle");
  });
});

// END_OF_TESTS
