// ============================================
// tests/unit/serverAuthoritativeWorker.test.ts
//
// Phase 6, action #4 + #5: server-authoritative hireWorker and
// assignWorker. Verifies server-side baseHireCost lookup, money
// deduction, and worker array append/update. Also covers assignWorker
// building-existence validation and no-op detection.
//
// Before this fix, hireWorker and assignWorker called the server for
// validation but the server had no handler (returned 400 "Invalid
// action"). The client fell back to local mutation only because the
// error was swallowed by the network-fail-open path. A cheater could
// bypass server validation entirely.
// ============================================

import { describe, it, expect } from "vitest";
import {
  validateHireWorkerAction,
  validateAssignWorkerAction,
} from "@/lib/game/production/engine/serverEngine";
import type { GameConfig } from "@/lib/game/config/config";
import type { GameState, Worker, BuildingInstance } from "@/lib/game/shared/types/types";

function makeConfig(): GameConfig {
  return {
    workers: [
      {
        id: "engineer",
        name: "Engineer",
        description: "Boosts efficiency.",
        baseHireCost: 500,
        effects: { efficiencyBonus: 0.1 },
        icon: "test:engineer",
      },
      {
        id: "technician",
        name: "Technician",
        description: "Reduces maintenance.",
        baseHireCost: 300,
        effects: { maintenanceReduction: 0.2 },
        icon: "test:technician",
      },
    ],
    buildings: {},
    resources: {},
    research: [],
    market: [],
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

function makeState(overrides?: {
  money?: number;
  workers?: Worker[];
  buildings?: BuildingInstance[];
}): Partial<GameState> {
  return {
    money: overrides?.money ?? 10_000,
    totalMoneyEarned: 10_000,
    gameTick: 100,
    workers: overrides?.workers ?? [],
    buildings: overrides?.buildings ?? [],
  };
}

describe("validateHireWorkerAction (server-authoritative)", () => {
  it("returns valid + correctedState for affordable hire", () => {
    const state = makeState({ money: 10_000 });
    const result = validateHireWorkerAction("engineer", state, makeConfig());

    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    expect(result.correctedState?.money).toBe(9_500); // 10000 - 500
    const workers = result.correctedState?.workers as Worker[];
    expect(workers).toHaveLength(1);
    expect(workers[0].type).toBe("engineer");
    expect(workers[0].level).toBe(1);
    expect(workers[0].experience).toBe(0);
    expect(workers[0].assignedTo).toBeNull();
    expect(workers[0].id).toBeTruthy();
  });

  it("uses server-side baseHireCost (immune to client tampering)", () => {
    // Client's local WORKER_DEFS could be tampered; server config is the
    // source of truth. Test verifies the cost is taken from config, not
    // from any client-supplied value.
    const state = makeState({ money: 10_000 });
    const result = validateHireWorkerAction("engineer", state, makeConfig());

    // 10000 - 500 (server config) = 9500
    expect(result.correctedState?.money).toBe(9_500);
  });

  it("rejects hire when player cannot afford", () => {
    const state = makeState({ money: 100 });
    const result = validateHireWorkerAction("engineer", state, makeConfig());

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not enough money");
    expect(result.correctedState).toBeUndefined();
  });

  it("rejects unknown worker type", () => {
    const state = makeState({ money: 10_000 });
    const result = validateHireWorkerAction("wizard", state, makeConfig());

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown worker type "wizard"');
  });

  it("rejects missing workerType", () => {
    const state = makeState();
    const result = validateHireWorkerAction("", state, makeConfig());

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing workerType");
  });

  it("appends to existing workers array (not overwrites)", () => {
    const existingWorker: Worker = {
      id: "wrk_existing",
      type: "technician" as Worker["type"],
      level: 1,
      experience: 0,
      assignedTo: null,
      efficiency: 1,
      speed: 1,
      maintenance: 0,
    };
    const state = makeState({ money: 10_000, workers: [existingWorker] });
    const result = validateHireWorkerAction("engineer", state, makeConfig());

    const workers = result.correctedState?.workers as Worker[];
    expect(workers).toHaveLength(2);
    expect(workers[0].id).toBe("wrk_existing");
    expect(workers[1].type).toBe("engineer");
  });

  it("does NOT increment totalMoneyEarned (hire is a spend path)", () => {
    const state = makeState({ money: 10_000 });
    const result = validateHireWorkerAction("engineer", state, makeConfig());

    expect(result.valid).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(
        result.correctedState ?? {},
        "totalMoneyEarned",
      ),
    ).toBe(false);
  });

  it("rejects when config has invalid baseHireCost (defense-in-depth)", () => {
    const state = makeState({ money: 10_000 });
    const config = makeConfig();
    // Corrupt the config to test the validator's resilience
    config.workers[0].baseHireCost = -1 as unknown as number;
    const result = validateHireWorkerAction("engineer", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid baseHireCost");
  });
});

describe("validateAssignWorkerAction (server-authoritative)", () => {
  function workerWith(id: string, assignedTo: string | null = null): Worker {
    return {
      id,
      type: "engineer",
      level: 1,
      experience: 0,
      assignedTo,
      efficiency: 1,
      speed: 1,
      maintenance: 0,
    };
  }

  function buildingWith(id: string): BuildingInstance {
    return {
      id,
      type: "ironMine" as const,
      level: 1,
      active: true,
      efficiency: 1,
      placedAt: 0,
    };
  }

  it("assigns a worker to a building", () => {
    const state = makeState({
      workers: [workerWith("w1")],
      buildings: [buildingWith("b1")],
    });
    const result = validateAssignWorkerAction("w1", "b1", state);

    expect(result.valid).toBe(true);
    const workers = result.correctedState?.workers as Worker[];
    expect(workers[0].assignedTo).toBe("b1");
  });

  it("unassigns a worker (buildingId = null)", () => {
    const state = makeState({
      workers: [workerWith("w1", "b1")],
    });
    const result = validateAssignWorkerAction("w1", null, state);

    expect(result.valid).toBe(true);
    const workers = result.correctedState?.workers as Worker[];
    expect(workers[0].assignedTo).toBeNull();
  });

  it("rejects non-existent worker", () => {
    const state = makeState();
    const result = validateAssignWorkerAction("w999", "b1", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Worker "w999" not found');
  });

  it("rejects non-existent building (when assigning)", () => {
    const state = makeState({
      workers: [workerWith("w1")],
      buildings: [],
    });
    const result = validateAssignWorkerAction("w1", "b999", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Building "b999" not found');
  });

  it("rejects missing workerId", () => {
    const state = makeState();
    const result = validateAssignWorkerAction("", "b1", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing workerId");
  });

  it("no-op when assigning to current target (returns unchanged state)", () => {
    const state = makeState({
      workers: [workerWith("w1", "b1")],
      buildings: [buildingWith("b1")],
    });
    const result = validateAssignWorkerAction("w1", "b1", state);

    expect(result.valid).toBe(true);
    const workers = result.correctedState?.workers as Worker[];
    // Same array reference (no allocation needed)
    expect(workers).toBe(state.workers);
  });

  it("preserves other workers' assignments", () => {
    const state = makeState({
      workers: [
        workerWith("w1", "b1"),
        workerWith("w2", "b2"),
        workerWith("w3"), // unassigned
      ],
      buildings: [buildingWith("b1"), buildingWith("b2")],
    });
    const result = validateAssignWorkerAction("w2", null, state);

    const workers = result.correctedState?.workers as Worker[];
    expect(workers[0].assignedTo).toBe("b1"); // unchanged
    expect(workers[1].assignedTo).toBeNull(); // unassigned
    expect(workers[2].assignedTo).toBeNull(); // unchanged
  });

  it("rejects when buildingId is wrong type (not string or null)", () => {
    const state = makeState({
      workers: [workerWith("w1")],
    });
    const result = validateAssignWorkerAction(
      "w1",
      42 as unknown as string,
      state,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("must be a string or null");
  });
});
