import { describe, expect, it, vi } from "vitest";
import type { GetFn } from "@/lib/game/state/store-actions/_actionTypes";

const HOIST_RANK_THRESHOLDS = vi.hoisted((): unknown[] => []);

vi.mock("@/lib/game/config/configCache", () => ({
  RANK_THRESHOLDS: HOIST_RANK_THRESHOLDS,
}));

import { getCurrentRankState } from "@/lib/game/state/store-actions/rank/rankScore";

function getMinimalState() {
  return {
    totalMoneyEarned: 0,
    buildings: [],
    completedResearch: [],
    stats: { contractsCompleted: 0 },
    prestigeState: { totalPrestiges: 0 },
  };
}

describe("rankService empty config", () => {
  it("returns a render-safe fallback rank when rank thresholds are not loaded", () => {
    HOIST_RANK_THRESHOLDS.splice(0);

    const rank = getCurrentRankState(getMinimalState as unknown as GetFn);

    expect(rank.name).toBe("Apprentice");
    expect(rank.score).toBe(0);
    expect(rank.nextRankScore).toBeNull();
    expect(rank.progress).toBe(1);
  });

  it("ignores malformed rank rows during config hydration", () => {
    HOIST_RANK_THRESHOLDS.splice(0, HOIST_RANK_THRESHOLDS.length, undefined, { minScore: 0 });

    const rank = getCurrentRankState(getMinimalState as unknown as GetFn);

    expect(rank.name).toBe("Apprentice");
    expect(rank.score).toBe(0);
  });
});
