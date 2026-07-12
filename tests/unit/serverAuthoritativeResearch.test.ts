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
import { validateResearchAction } from "@/lib/game/production/engine/serverEngine";
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
}): Partial<GameState> {
  return {
    money: 10_000,
    researchPoints: overrides?.researchPoints ?? 500,
    activeResearch: overrides?.activeResearch ?? null,
    completedResearch: overrides?.completedResearch ?? [],
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
