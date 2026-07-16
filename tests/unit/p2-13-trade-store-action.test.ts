/**
 * tests/unit/p2-13-trade-store-action.test.ts
 *
 * P2-13 (BUILDING_PRODUCTION_AUDIT §10.6 P2, 2026-07-16):
 *   TradingPostPanel called `useGameStore.setState({ resources: ... })`
 *   directly after a trade, bypassing the action boundary (STO-003).
 *   Replaced with a new `applyTradeResources` store action that the
 *   component calls.
 *
 * This test pins:
 *   1. The panel no longer calls `useGameStore.setState` for trade
 *      resources.
 *   2. The panel calls the new `applyTradeResources` action.
 *   3. The action applies updated resources and bumps
 *      `stats.tradesCompleted` by one.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useGameStore } from "@/lib/game/state/store";

function readSource(relPath: string): string {
  return readFileSync(join(process.cwd(), "src", relPath), "utf8");
}

describe("P2-13 — TradingPostPanel routes through store action", () => {
  beforeEach(() => {
    // Reset the store to a stub so per-test state is isolated.
    useGameStore.setState(useGameStore.getInitialState(), true);
  });

  it("TradingPostPanel no longer calls useGameStore.setState for resources", () => {
    const content = readSource("components/game/TradingPostPanel.tsx");
    expect(content, "P2-13 incomplete — setState for resources still present").not.toMatch(
      /useGameStore\.setState\(\s*\{\s*resources:\s*serverResult/,
    );
  });

  it("TradingPostPanel calls applyTradeResources", () => {
    const content = readSource("components/game/TradingPostPanel.tsx");
    expect(content).toMatch(/applyTradeResources/);
  });

  it("applyTradeResources action exists on the store", () => {
    expect(typeof useGameStore.getState().applyTradeResources).toBe(
      "function",
    );
  });

  it("applyTradeResources updates resources and bumps tradesCompleted", () => {
    const store = useGameStore.getState();
    store.applyTradeResources({
      iron: 50,
      money: 0,
      ironPlate: 0,
      coal: 0,
    });

    const after = useGameStore.getState();
    expect(after.resources.iron).toBe(50);
    expect(after.stats?.tradesCompleted).toBe(1);

    // A second call bumps again.
    after.applyTradeResources({
      iron: 60,
      money: 0,
      ironPlate: 0,
      coal: 0,
    });
    expect(useGameStore.getState().resources.iron).toBe(60);
    expect(useGameStore.getState().stats?.tradesCompleted).toBe(2);
  });
});
