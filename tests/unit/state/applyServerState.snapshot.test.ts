/**
 * tests/unit/state/applyServerState.snapshot.test.ts
 *
 * NEW-TEST-024 / NEW-TEST-025 (V-001 / PR-BP-1, 2026-07-15):
 *
 * Verifies the `applyServerState` store contract for `productionSnapshot`
 * propagation after live-tick / offline-progress / cloud-load paths.
 *
 * Contract under test:
 *   1. Caller passes a non-null `productionSnapshot` → store installs it
 *      (replaces whatever was there).
 *   2. Caller passes `null` → store preserves `prev.productionSnapshot`.
 *      (Hook-level: hook never calls `applyServerState` on zero-tick;
 *      this branch is defense for zero-tick responses that do reach
 *      the apply boundary.)
 *   3. Caller omits (undefined) → store preserves `prev.productionSnapshot`
 *      (cloud-load path that does not refresh UI snapshot).
 *   4. UI fields (activeTab, selectedBuilding, notifications) always
 *      preserved from prev regardless of arguments.
 *
 * Phase 13 invariant kept: store type stays `productionSnapshot:
 * ProductionSnapshot` (non-null) for the 14 UI consumers; the apply
 * boundary is the only place that allows `null` and falls back to prev.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  applyServerState,
  useGameStore,
} from "@/lib/game/state/store";
import { emptyProductionSnapshot } from "@/lib/game/production/snapshot/emptyProductionSnapshot";
import type { ProductionSnapshot } from "@/lib/game/production/productionCalculator";

function fakeSnapshot(over: Partial<ProductionSnapshot> = {}): ProductionSnapshot {
  // Spread the empty stub as the canonical baseline, then overwrite the
  // fields under test. The real ProductionSnapshot type is wider; tests
  // here focus on the specific fields asserted below.
  const base = emptyProductionSnapshot();
  return { ...base, ...over } as ProductionSnapshot;
}

function readStore() {
  return useGameStore.getState();
}

beforeEach(() => {
  // Reset to known shape.
  useGameStore.setState({
    activeTab: "factory",
    selectedBuilding: "b-1",
    notifications: [{ id: "n-keep", message: "keep me" }],
    productionSnapshot: fakeSnapshot({ moneyIncomeRate: 100 }),
    hydrated: true,
  } as never);
});

describe("applyServerState — productionSnapshot plumbing (V-001 / PR-BP-1)", () => {
  it("NEW-TEST-024: installs a non-null productionSnapshot from the live-tick path", () => {
    const before = readStore().productionSnapshot;
    expect(before?.moneyIncomeRate).toBe(100); // baseline stub value

    const newSnapshot = fakeSnapshot({ moneyIncomeRate: 250, production: { iron: 9 } });
    applyServerState(
      { money: 999, gameTick: 17, resources: { iron: 9 }, workers: [] },
      newSnapshot,
    );

    const after = readStore();
    expect(after.productionSnapshot).toEqual(newSnapshot);
    expect(after.productionSnapshot?.moneyIncomeRate).toBe(250);
    expect(after.productionSnapshot?.production.iron).toBe(9);
    expect(after.hydrated).toBe(true);
  });

  it("NEW-TEST-024: keeps UI session fields (activeTab, selectedBuilding, notifications) from prev", () => {
    applyServerState(
      { money: 1, gameTick: 1, resources: {}, workers: [] },
      fakeSnapshot({ moneyIncomeRate: 200 }),
    );

    const after = readStore();
    expect(after.activeTab).toBe("factory");
    expect(after.selectedBuilding).toBe("b-1");
    expect(after.notifications).toEqual([{ id: "n-keep", message: "keep me" }]);
  });

  it("NEW-TEST-024: applies SERVER_FIELDS (money, gameTick, resources, workers) alongside snapshot", () => {
    applyServerState(
      {
        money: 5550,
        gameTick: 42,
        resources: { iron: 7, coal: 11 },
        workers: [],
      },
      fakeSnapshot({ moneyIncomeRate: 88 }),
    );

    const after = readStore();
    expect(after.money).toBe(5550);
    expect(after.gameTick).toBe(42);
    expect(after.resources).toEqual({ iron: 7, coal: 11 });
    expect(after.productionSnapshot?.moneyIncomeRate).toBe(88);
  });

  it("NEW-TEST-025: zero-tick / cold-start (productionSnapshot=null) preserves prev snapshot", () => {
    const before = readStore().productionSnapshot;
    expect(before?.moneyIncomeRate).toBe(100);

    // Hook never calls applyServerState on zero-tick, but applyServerState
    // itself must remain safe if a caller does pass null.
    applyServerState(
      { money: 0, gameTick: 0, resources: {}, workers: [] },
      null,
    );

    const after = readStore();
    expect(after.productionSnapshot).toBe(before);
    expect(after.productionSnapshot?.moneyIncomeRate).toBe(100);
  });

  it("NEW-TEST-025: omitted productionSnapshot (cloud-load path) preserves prev", () => {
    const before = readStore().productionSnapshot;

    applyServerState({
      money: 250,
      gameTick: 5,
      resources: { iron: 1 },
      workers: [],
    });

    const after = readStore();
    expect(after.productionSnapshot).toBe(before);
    expect(after.productionSnapshot?.moneyIncomeRate).toBe(100);
    expect(after.hydrated).toBe(true); // cloud load still hydrates
  });

  it("does nothing for invalid input shapes (null, non-object)", () => {
    const beforeSnapshot = readStore().productionSnapshot;
    const beforeMoney = readStore().money;

    applyServerState(null, fakeSnapshot({ moneyIncomeRate: 999 }));
    applyServerState(undefined, fakeSnapshot({ moneyIncomeRate: 999 }));
    applyServerState(
      "not-an-object" as unknown as Record<string, unknown>,
      fakeSnapshot({ moneyIncomeRate: 999 }),
    );

    const after = readStore();
    expect(after.productionSnapshot).toBe(beforeSnapshot);
    expect(after.money).toBe(beforeMoney);
  });

  it("matches snapshot to its NEW newState (atomicity contract)", () => {
    // PR-BP-1: snapshot and newState are returned by the same
    // applyElapsedServerTime call, so the route delivers them together
    // and the hook MUST apply them together.
    const newSnapshot = fakeSnapshot({ moneyIncomeRate: 333 });
    applyServerState(
      { money: 1000, gameTick: 99, resources: { iron: 5 }, workers: [] },
      newSnapshot,
    );

    const after = readStore();
    // New money + new gameTick + new snapshot should all derive from the
    // same apply call. Both should land together, not one without the
    // other, to prevent stale snapshot/newState combinations.
    expect(after.money).toBe(1000);
    expect(after.gameTick).toBe(99);
    expect(after.productionSnapshot).toBe(newSnapshot);
  });
});
