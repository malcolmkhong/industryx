// tests/unit/serverAuthoritativeTransport.test.ts - Phase 6 #15 + #16
import { describe, it, expect } from "vitest";
import {
  validateTransportAction,
  validateUpgradeTransportLineAction,
} from "@/lib/game/production/engine/serverEngine";
import type { GameState, BuildingInstance } from "@/lib/game/shared/types/types";
import type { GameConfig } from "@/lib/game/config/config";

function makeBuilding(o?: Partial<BuildingInstance>): BuildingInstance {
  return {
    id: "b1",
    type: "ironMine" as never,
    level: 1,
    efficiency: 1,
    active: true,
    placedAt: 0,
    ...o,
  };
}

function makeConfig(): GameConfig {
  return {
    buildings: {
      ironMine: {
        type: "ironMine",
        name: "Iron Mine",
        description: "",
        category: "extractor",
        baseCost: [{ resource: "money", amount: 100 }],
        costMultiplier: 1.15,
        produces: { resource: "iron", amount: 1 },
        consumes: [],
        powerRequired: 0,
        powerProduction: 0,
        buildTime: 1,
        prerequisites: [],
        tier: 1,
        icon: "",
      },
      factoryT1: {
        type: "factoryT1",
        name: "Factory T1",
        description: "",
        category: "factory",
        baseCost: [{ resource: "money", amount: 200 }],
        costMultiplier: 1.15,
        produces: { resource: "iron", amount: 2 },
        consumes: [{ resource: "iron", amount: 1 }],
        powerRequired: 1,
        powerProduction: 0,
        buildTime: 1,
        prerequisites: [],
        tier: 1,
        icon: "",
      },
    },
    resources: {},
    research: [],
    market: [],
    tradableResourceIds: [],
    weather: {},
    workers: [],
    transport: [
      {
        id: "conveyorBelt",
        name: "Conveyor Belt",
        description: "",
        baseCost: [{ resource: "money", amount: 500 }],
        baseThroughput: 10,
        upgradeMultiplier: 1.5,
        icon: "",
      },
      {
        id: "truck",
        name: "Truck",
        description: "",
        baseCost: [{ resource: "money", amount: 1000 }],
        baseThroughput: 30,
        upgradeMultiplier: 1.4,
        icon: "",
      },
    ],
    automation: [],
    prestigeBonuses: [],
    rankThresholds: [],
    quests: [],
    dailyRewards: [],
    events: [],
    contracts: [],
    megaProjects: [],
    productionChains: [
      {
        upstreamBuilding: "ironMine",
        downstreamBuilding: "factoryT1",
        resource: "iron",
        ratio: 1,
      },
    ],
    achievements: [],
    tradePosts: [],
    leaderboardRewards: [],
  } as unknown as GameConfig;
}

function makeState(o?: {
  money?: number;
  buildings?: BuildingInstance[];
  transportLines?: unknown[];
}): Partial<GameState> {
  return {
    money: o?.money ?? 100_000,
    buildings: o?.buildings ?? [
      makeBuilding({ id: "src" }),
      makeBuilding({ id: "dst", type: "factoryT1" as never }),
    ],
    transportLines: (o?.transportLines ?? []) as never,
    prestigeState: {
      corporationPoints: 0,
      totalPrestiges: 0,
      megaFactoryUnlocked: false,
      bonuses: [],
    },
    stats: {
      totalResourcesProduced: {} as Record<string, number>,
      totalResourcesSold: {} as Record<string, number>,
      peakEfficiency: 0,
      factoriesBuilt: 0,
      transportLinesBuilt: 0,
      researchCompleted: 0,
      contractsCompleted: 0,
      playTime: 0,
    },
  };
}

describe("validateTransportAction (server-authoritative)", () => {
  const config = makeConfig();

  it("returns valid + correctedState for affordable transport build", () => {
    const state = makeState({ money: 100_000 });
    const result = validateTransportAction(
      "conveyorBelt",
      "src",
      "dst",
      "iron",
      state,
      config,
    );
    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    // Money deducted by server-computed cost (500)
    expect(result.correctedState?.money).toBe(99_500);
    const lines = result.correctedState?.transportLines as Array<{
      id: string;
      type: string;
    }>;
    expect(lines.length).toBe(1);
    expect(lines[0].type).toBe("conveyorBelt");
  });

  it("computes cost from server-side config (immune to tampering)", () => {
    const state = makeState({ money: 100_000 });
    const r1 = validateTransportAction(
      "conveyorBelt",
      "src",
      "dst",
      "iron",
      state,
      config,
    );
    const r2 = validateTransportAction(
      "truck",
      "src",
      "dst",
      "iron",
      state,
      config,
    );
    expect(r1.valid && r2.valid).toBe(true);
    // truck costs 1000 vs conveyorBelt 500
    expect(r2.correctedState?.money ?? 0).toBeLessThan(
      r1.correctedState?.money ?? 0,
    );
  });

  it("rejects when transportType missing", () => {
    const state = makeState();
    const result = validateTransportAction(
      "",
      "src",
      "dst",
      "iron",
      state,
      config,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing transportType");
  });

  it("rejects when fromBuildingId missing", () => {
    const state = makeState();
    const result = validateTransportAction(
      "conveyorBelt",
      "",
      "dst",
      "iron",
      state,
      config,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects when toBuildingId missing", () => {
    const state = makeState();
    const result = validateTransportAction(
      "conveyorBelt",
      "src",
      "",
      "iron",
      state,
      config,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects when resource missing", () => {
    const state = makeState();
    const result = validateTransportAction(
      "conveyorBelt",
      "src",
      "dst",
      "",
      state,
      config,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing resource");
  });

  it("rejects when transport type not in config", () => {
    const state = makeState();
    const result = validateTransportAction(
      "spaceship",
      "src",
      "dst",
      "iron",
      state,
      config,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found in config");
  });

  it("rejects when source building not found", () => {
    const state = makeState();
    const result = validateTransportAction(
      "conveyorBelt",
      "ghost",
      "dst",
      "iron",
      state,
      config,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Source building");
  });

  it("rejects when destination building not found", () => {
    const state = makeState();
    const result = validateTransportAction(
      "conveyorBelt",
      "src",
      "ghost",
      "iron",
      state,
      config,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Destination building");
  });

  it("rejects when building type not in config", () => {
    const state = makeState({
      buildings: [
        makeBuilding({ id: "x", type: "alienBuilding" as never }),
        makeBuilding({ id: "y", type: "factoryT1" as never }),
      ],
    });
    const result = validateTransportAction(
      "conveyorBelt",
      "x",
      "y",
      "iron",
      state,
      config,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found in config");
  });

  it("rejects when player lacks money", () => {
    const state = makeState({ money: 100 });
    const result = validateTransportAction(
      "conveyorBelt",
      "src",
      "dst",
      "iron",
      state,
      config,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not enough money");
  });

  it("increments stats.transportLinesBuilt", () => {
    const state = makeState({ money: 100_000 });
    const result = validateTransportAction(
      "conveyorBelt",
      "src",
      "dst",
      "iron",
      state,
      config,
    );
    expect(result.valid).toBe(true);
    const stats = result.correctedState?.stats as {
      transportLinesBuilt: number;
    };
    expect(stats.transportLinesBuilt).toBe(1);
  });

  it("appends to existing transportLines (does NOT replace)", () => {
    const existing = [{ id: "old", type: "truck", level: 1 }];
    const state = makeState({ money: 100_000, transportLines: existing });
    const result = validateTransportAction(
      "conveyorBelt",
      "src",
      "dst",
      "iron",
      state,
      config,
    );
    expect(result.valid).toBe(true);
    const lines = result.correctedState?.transportLines as Array<{
      id: string;
    }>;
    expect(lines.length).toBe(2);
    expect(lines[0].id).toBe("old");
  });

  it("new line has throughput = baseThroughput (no client research bonus)", () => {
    const state = makeState({ money: 100_000 });
    const result = validateTransportAction(
      "conveyorBelt",
      "src",
      "dst",
      "iron",
      state,
      config,
    );
    const lines = result.correctedState?.transportLines as Array<{
      throughput: number;
    }>;
    expect(lines[0].throughput).toBe(10); // baseThroughput, no bonus
  });
});

describe("validateUpgradeTransportLineAction (server-authoritative)", () => {
  const config = makeConfig();

  it("returns valid + correctedState for affordable upgrade", () => {
    const state = makeState({
      money: 100_000,
      transportLines: [
        {
          id: "line-1",
          type: "conveyorBelt",
          level: 1,
          fromBuilding: "src",
          toBuilding: "dst",
          carriesResource: "iron",
          throughput: 10,
          maxThroughput: 30,
          active: true,
        },
      ],
    });
    const result = validateUpgradeTransportLineAction("line-1", state, config);
    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    // Cost = 500 * 1.5^1 = 750 (upgradeCostExponent=1.5 default)
    expect(result.correctedState?.money).toBeLessThan(100_000);
    const lines = result.correctedState?.transportLines as Array<{
      level: number;
      throughput: number;
    }>;
    expect(lines[0].level).toBe(2);
  });

  it("scales cost exponentially per level", () => {
    const stateL1 = makeState({
      money: 100_000,
      transportLines: [
        {
          id: "line-1",
          type: "conveyorBelt",
          level: 1,
          fromBuilding: "src",
          toBuilding: "dst",
          carriesResource: "iron",
          throughput: 10,
          maxThroughput: 30,
          active: true,
        },
      ],
    });
    const stateL2 = makeState({
      money: 100_000,
      transportLines: [
        {
          id: "line-1",
          type: "conveyorBelt",
          level: 2,
          fromBuilding: "src",
          toBuilding: "dst",
          carriesResource: "iron",
          throughput: 15,
          maxThroughput: 30,
          active: true,
        },
      ],
    });
    const r1 = validateUpgradeTransportLineAction("line-1", stateL1, config);
    const r2 = validateUpgradeTransportLineAction("line-1", stateL2, config);
    expect(r1.valid && r2.valid).toBe(true);
    const cost1 = 100_000 - (r1.correctedState?.money ?? 100_000);
    const cost2 = 100_000 - (r2.correctedState?.money ?? 100_000);
    expect(cost2).toBeGreaterThan(cost1);
  });

  it("rejects when lineId missing", () => {
    const result = validateUpgradeTransportLineAction("", makeState(), config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing lineId");
  });

  it("rejects when line not found", () => {
    const result = validateUpgradeTransportLineAction(
      "ghost",
      makeState(),
      config,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("rejects when line type not in config", () => {
    const state = makeState({
      transportLines: [
        {
          id: "line-1",
          type: "spaceship" as never,
          level: 1,
          fromBuilding: "src",
          toBuilding: "dst",
          carriesResource: "iron",
          throughput: 10,
          maxThroughput: 30,
          active: true,
        },
      ],
    });
    const result = validateUpgradeTransportLineAction("line-1", state, config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found in config");
  });

  it("rejects when player lacks money", () => {
    const state = makeState({
      money: 1,
      transportLines: [
        {
          id: "line-1",
          type: "conveyorBelt",
          level: 1,
          fromBuilding: "src",
          toBuilding: "dst",
          carriesResource: "iron",
          throughput: 10,
          maxThroughput: 30,
          active: true,
        },
      ],
    });
    const result = validateUpgradeTransportLineAction("line-1", state, config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not enough money");
  });

  it("throughput scales with upgradeMultiplier and caps at maxThroughput", () => {
    const state = makeState({
      money: 1_000_000,
      transportLines: [
        {
          id: "line-1",
          type: "conveyorBelt",
          level: 1,
          fromBuilding: "src",
          toBuilding: "dst",
          carriesResource: "iron",
          throughput: 10,
          maxThroughput: 30,
          active: true,
        },
      ],
    });
    const result = validateUpgradeTransportLineAction("line-1", state, config);
    expect(result.valid).toBe(true);
    const lines = result.correctedState?.transportLines as Array<{
      throughput: number;
    }>;
    // Throughput = 10 * 1.5^1 = 15 (capped at 30)
    expect(lines[0].throughput).toBe(15);
  });

  it("does not mutate other lines", () => {
    const state = makeState({
      money: 1_000_000,
      transportLines: [
        {
          id: "a",
          type: "conveyorBelt",
          level: 1,
          fromBuilding: "src",
          toBuilding: "dst",
          carriesResource: "iron",
          throughput: 10,
          maxThroughput: 30,
          active: true,
        },
        {
          id: "b",
          type: "truck",
          level: 2,
          fromBuilding: "src",
          toBuilding: "dst",
          carriesResource: "iron",
          throughput: 50,
          maxThroughput: 90,
          active: true,
        },
      ],
    });
    const result = validateUpgradeTransportLineAction("a", state, config);
    expect(result.valid).toBe(true);
    const lines = result.correctedState?.transportLines as Array<{
      id: string;
      level: number;
      throughput: number;
    }>;
    expect(lines.find((l) => l.id === "b")?.level).toBe(2);
    expect(lines.find((l) => l.id === "b")?.throughput).toBe(50);
  });
});
