// ============================================
// tests/unit/serverAuthoritativeResearch.test.ts
//
// Phase 6, action #12: server-authoritative startResearch. Verifies the
// server validates researchId existence, prerequisites, completion, and
// RP cost, then returns the authoritative post-start state (RP deducted,
// activeResearch set, progress=0). The client applies exactly what the
// server says — no local cost computation.
//
// Spend path: researchPoints decreases by researchDef.cost.
// completedResearch is NOT changed (research only completes via tick loop).
// ============================================

import { describe, it, expect } from "vitest";
import {
  validateAddResearchToQueueAction,
  validateCancelResearchAction,
  validateRemoveResearchFromQueueAction,
  validateResearchAction,
} from "@/lib/game/production/engine/serverEngine";
import type { GameState } from "@/lib/game/shared/types/types";
import type { GameConfig } from "@/lib/game/config/config";

function makeResearch(
  overrides?: Partial<{
    id: string;
    name: string;
    cost: number;
    prerequisites: string[];
  }>,
): {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: number;
  cost: number;
  timeRequired: number;
  prerequisites: string[];
  effects: Record<string, unknown>[];
  icon: string;
} {
  return {
    id: "auto_1",
    name: "Basic Automation",
    description: "",
    category: "automation",
    tier: 1,
    cost: 100,
    timeRequired: 60,
    prerequisites: [],
    effects: [],
    icon: "auto",
    ...overrides,
  };
}

function makeConfig(items: ReturnType<typeof makeResearch>[]): GameConfig {
  return {
    buildings: {},
    resources: {},
    research: items,
    market: [],
    tradableResourceIds: [],
    weather: {},
    contracts: [],
    events: [],
    megaProjects: [],
  } as unknown as GameConfig;
}

function makeState(overrides?: {
  researchPoints?: number;
  activeResearch?: string | null;
  completedResearch?: string[];
  researchProgress?: number;
  researchQueue?: string[];
}): Partial<GameState> {
  return {
    money: 10_000,
    researchPoints: overrides?.researchPoints ?? 500,
    activeResearch: overrides?.activeResearch ?? null,
    completedResearch: overrides?.completedResearch ?? [],
    researchProgress: overrides?.researchProgress ?? 0,
    researchQueue: overrides?.researchQueue ?? [],
    gameTick: 100,
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

describe("validateResearchAction (server-authoritative)", () => {
  it("returns valid + correctedState for affordable research", () => {
    const config = makeConfig([makeResearch({ cost: 100 })]);
    const state = makeState({ researchPoints: 500 });
    const result = validateResearchAction("auto_1", state, config);

    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    expect(result.correctedState?.researchPoints).toBe(400); // 500 - 100
    expect(result.correctedState?.activeResearch).toBe("auto_1");
    expect(result.correctedState?.researchProgress).toBe(0);
  });

  it("deducts server-side cost (immune to client tampering)", () => {
    const config = makeConfig([makeResearch({ cost: 250 })]);
    const state = makeState({ researchPoints: 1000 });
    const result = validateResearchAction("auto_1", state, config);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.researchPoints).toBe(750); // 1000 - 250
    // Client cannot inflate the cost — server-computed value only.
  });

  it("rejects when researchId not found in config", () => {
    const config = makeConfig([makeResearch({ id: "auto_1" })]);
    const state = makeState();
    const result = validateResearchAction("nonexistent_xyz", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found");
    expect(result.correctedState).toBeUndefined();
  });

  it("rejects missing researchId", () => {
    const config = makeConfig([makeResearch()]);
    const state = makeState();
    expect(validateResearchAction("", state, config).valid).toBe(false);
    expect(
      validateResearchAction(undefined as never, state, config).valid,
    ).toBe(false);
  });

  it("rejects when prerequisites not met", () => {
    const config = makeConfig([
      makeResearch({ id: "auto_1", prerequisites: [] }),
      makeResearch({ id: "auto_2", prerequisites: ["auto_1"] }),
    ]);
    const state = makeState(); // empty completedResearch
    const result = validateResearchAction("auto_2", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Prerequisite");
    expect(result.error).toContain("auto_1");
  });

  it("accepts when all prerequisites met", () => {
    const config = makeConfig([
      makeResearch({ id: "auto_1", prerequisites: [] }),
      makeResearch({ id: "auto_2", prerequisites: ["auto_1"] }),
    ]);
    const state = makeState({ completedResearch: ["auto_1"] });
    const result = validateResearchAction("auto_2", state, config);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.activeResearch).toBe("auto_2");
  });

  it("rejects when research already completed", () => {
    const config = makeConfig([makeResearch()]);
    const state = makeState({ completedResearch: ["auto_1"] });
    const result = validateResearchAction("auto_1", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("already completed");
  });

  it("rejects when research already in progress (single-research rule)", () => {
    const config = makeConfig([
      makeResearch({ id: "auto_1", cost: 50 }),
      makeResearch({ id: "auto_2", cost: 50, prerequisites: ["auto_1"] }),
      makeResearch({ id: "auto_3", cost: 50, prerequisites: ["auto_1"] }),
    ]);
    // auto_1 is already completed; auto_2 is currently active.
    // Try to start auto_3 (prereq auto_1 met) but another research is active.
    const state = makeState({
      activeResearch: "auto_2",
      completedResearch: ["auto_1"],
    });
    const result = validateResearchAction("auto_3", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("already in progress");
  });

  it("rejects when player lacks research points", () => {
    const config = makeConfig([makeResearch({ cost: 1000 })]);
    const state = makeState({ researchPoints: 100 }); // can't afford
    const result = validateResearchAction("auto_1", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not enough research points");
    expect(result.correctedState).toBeUndefined();
  });

  it("rejects when research has invalid cost (negative)", () => {
    const config = makeConfig([makeResearch({ cost: -50 })]);
    const state = makeState({ researchPoints: 1000 });
    const result = validateResearchAction("auto_1", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid cost");
  });

  it("rejects when research has invalid cost (NaN)", () => {
    const config = makeConfig([makeResearch({ cost: Number.NaN })]);
    const state = makeState({ researchPoints: 1000 });
    const result = validateResearchAction("auto_1", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid cost");
  });

  it("does NOT change completedResearch (start ≠ complete)", () => {
    const config = makeConfig([makeResearch()]);
    const state = makeState({ completedResearch: ["other_thing"] });
    const result = validateResearchAction("auto_1", state, config);

    expect(result.valid).toBe(true);
    // correctedState should not include completedResearch
    expect(result.correctedState?.completedResearch).toBeUndefined();
  });

  it("exactly-boundary affordability passes", () => {
    const config = makeConfig([makeResearch({ cost: 100 })]);
    const state = makeState({ researchPoints: 100 }); // exactly the cost
    const result = validateResearchAction("auto_1", state, config);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.researchPoints).toBe(0); // 100 - 100 = 0
  });

  it("multiple prerequisites all checked", () => {
    const config = makeConfig([
      makeResearch({ id: "a" }),
      makeResearch({ id: "b" }),
      makeResearch({ id: "c", prerequisites: ["a", "b"] }),
    ]);
    // Only have 'a' — missing 'b'
    const state = makeState({ completedResearch: ["a"] });
    const result = validateResearchAction("c", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("b");
  });
});

describe("validateCancelResearchAction (server-authoritative)", () => {
  // Reuse the makeResearch / makeConfig helpers from the start-tests scope.
  const cancelConfig = (items: ReturnType<typeof makeResearch>[]): GameConfig =>
    makeConfig(items);

  it("rejects when no research is active", () => {
    const config = cancelConfig([makeResearch()]);
    const state = makeState({ activeResearch: null });
    const result = validateCancelResearchAction("auto_1", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("No active research");
  });

  it("rejects when payload id does not match active research", () => {
    const config = cancelConfig([
      makeResearch({ id: "auto_1" }),
      makeResearch({ id: "auto_2", prerequisites: ["auto_1"] }),
    ]);
    const state = makeState({ activeResearch: "auto_1" });
    const result = validateCancelResearchAction("auto_2", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain(`Active research is "auto_1"`);
  });

  it("rejects when the research is already completed", () => {
    const config = cancelConfig([makeResearch()]);
    const state = makeState({
      activeResearch: "auto_1",
      completedResearch: ["auto_1"],
    });
    const result = validateCancelResearchAction("auto_1", state, config);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("already completed");
  });

  it("rejects missing researchId", () => {
    const config = cancelConfig([makeResearch()]);
    const state = makeState({ activeResearch: "auto_1" });
    expect(validateCancelResearchAction("", state, config).valid).toBe(false);
  });

  it("rejects refundFraction out of range", () => {
    const config = cancelConfig([makeResearch()]);
    const state = makeState({ activeResearch: "auto_1" });

    expect(
      validateCancelResearchAction("auto_1", state, config, -0.1).valid,
    ).toBe(false);
    expect(
      validateCancelResearchAction("auto_1", state, config, 1.5).valid,
    ).toBe(false);
    expect(
      validateCancelResearchAction("auto_1", state, config, Number.NaN).valid,
    ).toBe(false);
  });

  it("returns valid + cleared state for a refund=1 cancel", () => {
    const config = cancelConfig([makeResearch({ cost: 100 })]);
    // After start: researchPoints = 400, activeResearch = "auto_1"
    const state = makeState({
      researchPoints: 400,
      activeResearch: "auto_1",
      researchProgress: 12,
    });
    const result = validateCancelResearchAction("auto_1", state, config, 1);

    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    // Full refund: 400 + 100 = 500
    expect(result.correctedState?.researchPoints).toBe(500);
    expect(result.correctedState?.activeResearch).toBeNull();
    expect(result.correctedState?.researchProgress).toBe(0);
  });

  it("returns valid + partial refund when refundFraction < 1", () => {
    const config = cancelConfig([makeResearch({ cost: 200 })]);
    const state = makeState({
      researchPoints: 100,
      activeResearch: "auto_1",
    });
    const result = validateCancelResearchAction("auto_1", state, config, 0.5);

    expect(result.valid).toBe(true);
    // 100 + (200 × 0.5) = 200
    expect(result.correctedState?.researchPoints).toBe(200);
    expect(result.correctedState?.activeResearch).toBeNull();
  });

  it("does NOT touch completedResearch (cancel != complete)", () => {
    const config = cancelConfig([makeResearch()]);
    const state = makeState({
      activeResearch: "auto_1",
      completedResearch: ["other_thing"],
    });
    const result = validateCancelResearchAction("auto_1", state, config, 1);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.completedResearch).toBeUndefined();
  });

  it("rejects if the active research id is not in game config", () => {
    const config = cancelConfig([makeResearch({ id: "auto_1" })]);
    // Server ran into a config drift — the active research id has
    // been removed. The validator must refuse before refund math runs.
    const state = makeState({
      researchPoints: 50,
      activeResearch: "ghost_research_xyz",
    });
    const result = validateCancelResearchAction(
      "ghost_research_xyz",
      state,
      config,
      1,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found in game config");
  });
});

describe("validateAddResearchToQueueAction (server-authoritative)", () => {
  it("appends id to queue and deducts cost", () => {
    const config = makeConfig([makeResearch({ id: "auto_1", cost: 100 })]);
    const state = makeState({ researchPoints: 500 });
    const result = validateAddResearchToQueueAction("auto_1", state, config);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.researchPoints).toBe(400);
    expect(result.correctedState?.researchQueue).toEqual(["auto_1"]);
  });

  it("rejects missing researchId", () => {
    const config = makeConfig([makeResearch()]);
    const state = makeState();
    expect(
      validateAddResearchToQueueAction("", state, config).valid,
    ).toBe(false);
  });

  it("rejects unknown id", () => {
    const config = makeConfig([makeResearch({ id: "auto_1" })]);
    const state = makeState();
    const result = validateAddResearchToQueueAction("ghost", state, config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found in game config");
  });

  it("rejects when research is already active", () => {
    const config = makeConfig([makeResearch({ id: "auto_1", cost: 100 })]);
    const state = makeState({
      activeResearch: "auto_1",
      researchPoints: 500,
    });
    const result = validateAddResearchToQueueAction("auto_1", state, config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("already active");
  });

  it("rejects when research is already completed", () => {
    const config = makeConfig([makeResearch()]);
    const state = makeState({ completedResearch: ["auto_1"] });
    const result = validateAddResearchToQueueAction("auto_1", state, config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("already completed");
  });

  it("rejects when research is already in queue", () => {
    const config = makeConfig([makeResearch({ id: "auto_1", cost: 50 })]);
    const state = makeState({
      researchPoints: 500,
      researchQueue: ["auto_1"],
    });
    const result = validateAddResearchToQueueAction("auto_1", state, config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("already in queue");
  });

  it("rejects when queue is full", () => {
    const config = makeConfig([makeResearch({ id: "auto_2", cost: 1 })]);
    const state = makeState({
      researchPoints: 9999,
      researchQueue: ["a", "b", "c", "d", "e"], // length=5 == max
    });
    const result = validateAddResearchToQueueAction("auto_2", state, config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("queue is full");
  });

  it("rejects when direct prereq missing", () => {
    const config = makeConfig([
      makeResearch({ id: "auto_1", prerequisites: [] }),
      makeResearch({ id: "auto_2", prerequisites: ["auto_1"] }),
    ]);
    const state = makeState();
    const result = validateAddResearchToQueueAction("auto_2", state, config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Prerequisite");
  });

  it("accepts when prereq is satisfied by an earlier-queued item (monotonic)", () => {
    const config = makeConfig([
      makeResearch({ id: "auto_1", cost: 50, prerequisites: [] }),
      makeResearch({ id: "auto_2", cost: 50, prerequisites: ["auto_1"] }),
    ]);
    const state = makeState({
      researchPoints: 500,
      researchQueue: ["auto_1"], // auto_2 depends on auto_1, which sits earlier in the queue
    });
    const result = validateAddResearchToQueueAction("auto_2", state, config);
    expect(result.valid).toBe(true);
    expect(result.correctedState?.researchQueue).toEqual(["auto_1", "auto_2"]);
  });

  it("rejects when player cannot afford cost", () => {
    const config = makeConfig([makeResearch({ id: "auto_1", cost: 1000 })]);
    const state = makeState({ researchPoints: 100 });
    const result = validateAddResearchToQueueAction("auto_1", state, config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not enough research points");
  });

  it("rejects invalid cost in config (NaN)", () => {
    const config = makeConfig([makeResearch({ id: "auto_1", cost: Number.NaN })]);
    const state = makeState({ researchPoints: 1000 });
    const result = validateAddResearchToQueueAction("auto_1", state, config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid cost");
  });
});

describe("validateRemoveResearchFromQueueAction (server-authoritative)", () => {
  it("removes id from queue and refunds cost", () => {
    const config = makeConfig([makeResearch({ id: "auto_1", cost: 100 })]);
    const state = makeState({
      researchPoints: 400, // post-deduction state
      researchQueue: ["auto_1"],
    });
    const result = validateRemoveResearchFromQueueAction(
      "auto_1",
      state,
      config,
    );
    expect(result.valid).toBe(true);
    expect(result.correctedState?.researchPoints).toBe(500);
    expect(result.correctedState?.researchQueue).toEqual([]);
  });

  it("rejects when id is not in the queue", () => {
    const config = makeConfig([makeResearch()]);
    const state = makeState({ researchQueue: [] });
    const result = validateRemoveResearchFromQueueAction(
      "auto_1",
      state,
      config,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not in queue");
  });

  it("rejects missing researchId", () => {
    const config = makeConfig([makeResearch()]);
    const state = makeState({ researchQueue: ["auto_1"] });
    expect(
      validateRemoveResearchFromQueueAction("", state, config).valid,
    ).toBe(false);
  });

  it("removes only the matching id (others preserved)", () => {
    const config = makeConfig([
      makeResearch({ id: "auto_1", cost: 50 }),
      makeResearch({ id: "auto_2", cost: 75 }),
    ]);
    const state = makeState({
      researchPoints: 200,
      researchQueue: ["auto_1", "auto_2"],
    });
    const result = validateRemoveResearchFromQueueAction(
      "auto_1",
      state,
      config,
    );
    expect(result.valid).toBe(true);
    expect(result.correctedState?.researchQueue).toEqual(["auto_2"]);
    expect(result.correctedState?.researchPoints).toBe(250);
  });

  it("refunds 0 when config no longer has the id (config drift)", () => {
    // Queue contains a stale id whose config row was deleted. Refund
    // is 0 but the entry is still removable so the queue stays valid.
    const config = makeConfig([makeResearch({ id: "auto_1", cost: 50 })]);
    const state = makeState({
      researchPoints: 100,
      researchQueue: ["ghost_research"],
    });
    const result = validateRemoveResearchFromQueueAction(
      "ghost_research",
      state,
      config,
    );
    expect(result.valid).toBe(true);
    expect(result.correctedState?.researchQueue).toEqual([]);
    expect(result.correctedState?.researchPoints).toBe(100);
  });
});
