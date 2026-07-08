// ============================================
// tests/unit/serverAuthoritativeStorage.test.ts
//
// Phase 6, action #3: server-authoritative upgradeStorage. Verifies the
// log-dampened cost formula (100 * exponent^N * dampener^N), affordability
// check, and the post-upgrade resourceCapacity + storageUpgradeLevels.
//
// Before this fix, upgradeStorage was 100% client-side. A cheater could
// set state.money = Infinity and call upgradeStorage with levels=99999,
// causing the server to reject on save (resourceCapacity would be
// astronomically large) but only after a wasted DB write.
// ============================================

import { describe, it, expect } from "vitest";
import { validateUpgradeStorageAction } from "@/lib/game/serverEngine";
import type { GameState, ResourceType } from "@/lib/game/types";

function makeState(overrides?: {
  money?: number;
  resourceCapacity?: Record<string, number>;
  storageUpgradeLevels?: Record<string, number>;
}): Partial<GameState> {
  return {
    money: overrides?.money ?? 100_000,
    totalMoneyEarned: 100_000,
    gameTick: 100,
    resourceCapacity: (overrides?.resourceCapacity ?? {
      iron: 100,
      copper: 100,
    }) as Record<ResourceType, number>,
    storageUpgradeLevels: (overrides?.storageUpgradeLevels ?? {
      iron: 0,
      copper: 0,
    }) as Record<ResourceType, number>,
  };
}

describe("validateUpgradeStorageAction (server-authoritative)", () => {
  it("returns valid + correctedState for affordable single-level upgrade", () => {
    const state = makeState({ money: 10_000 });
    const result = validateUpgradeStorageAction("iron", 1, state);

    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    // Level 0->1: cost = floor(100 * 1.5^0 * 0.9^0) = 100
    expect(result.correctedState?.money).toBe(10_000 - 100);
    // Level +1
    const levels = result.correctedState?.storageUpgradeLevels as Record<
      string,
      number
    >;
    expect(levels.iron).toBe(1);
    // Capacity: 100 base * 0.5 ratio * 1 level = +50
    const capacity = result.correctedState?.resourceCapacity as Record<
      string,
      number
    >;
    expect(capacity.iron).toBe(150);
  });

  it("scales cost log-dampened across multiple levels", () => {
    const state = makeState({ money: 1_000_000 });
    // Upgrade 5 levels from 0->5
    const result = validateUpgradeStorageAction("iron", 5, state);

    expect(result.valid).toBe(true);
    // Expected total = sum from n=0 to 4 of floor(100 * 1.5^n * 0.9^n)
    let expectedCost = 0;
    for (let n = 0; n < 5; n++) {
      expectedCost += Math.floor(100 * Math.pow(1.5, n) * Math.pow(0.9, n));
    }
    expect(result.correctedState?.money).toBe(1_000_000 - expectedCost);
    const levels = result.correctedState?.storageUpgradeLevels as Record<
      string,
      number
    >;
    expect(levels.iron).toBe(5);
  });

  it("continues from non-zero current level (additive, not reset)", () => {
    const state = makeState({
      money: 10_000_000,
      storageUpgradeLevels: { iron: 10 } as Record<ResourceType, number>,
    });
    const result = validateUpgradeStorageAction("iron", 3, state);

    expect(result.valid).toBe(true);
    const levels = result.correctedState?.storageUpgradeLevels as Record<
      string,
      number
    >;
    expect(levels.iron).toBe(13); // 10 + 3
  });

  it("rejects upgrade when player cannot afford the cost", () => {
    const state = makeState({ money: 50 });
    const result = validateUpgradeStorageAction("iron", 1, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not enough money");
    expect(result.correctedState).toBeUndefined();
  });

  it("rejects missing resource", () => {
    const state = makeState();
    const result = validateUpgradeStorageAction("", 1, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing resource");
  });

  it("rejects zero or negative levels", () => {
    const state = makeState();
    expect(validateUpgradeStorageAction("iron", 0, state).valid).toBe(false);
    expect(validateUpgradeStorageAction("iron", -1, state).valid).toBe(false);
    expect(validateUpgradeStorageAction("iron", 1.5, state).valid).toBe(false);
  });

  it("rejects non-integer levels", () => {
    const state = makeState();
    const result = validateUpgradeStorageAction("iron", 2.7, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("positive integer");
  });

  it("caps bulk upgrade at 100 levels (DoS protection)", () => {
    const state = makeState({ money: 1e15 });
    const result = validateUpgradeStorageAction("iron", 101, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("100 levels");
  });

  it("does NOT increment totalMoneyEarned (storage is spend path)", () => {
    const state = makeState({ money: 10_000 });
    const result = validateUpgradeStorageAction("iron", 1, state);

    expect(result.valid).toBe(true);
    // Verify correctedState shape: no totalMoneyEarned field (server omits it for spend paths)
    expect(
      Object.prototype.hasOwnProperty.call(
        result.correctedState ?? {},
        "totalMoneyEarned",
      ),
    ).toBe(false);
  });

  it("preserves other resources' capacity and levels", () => {
    const state = makeState({
      money: 100_000,
      resourceCapacity: { iron: 100, copper: 200 } as Record<
        ResourceType,
        number
      >,
      storageUpgradeLevels: { iron: 0, copper: 5 } as Record<
        ResourceType,
        number
      >,
    });
    const result = validateUpgradeStorageAction("iron", 2, state);

    expect(result.valid).toBe(true);
    const capacity = result.correctedState?.resourceCapacity as Record<
      string,
      number
    >;
    const levels = result.correctedState?.storageUpgradeLevels as Record<
      string,
      number
    >;
    // iron updated
    expect(capacity.iron).toBe(100 + 100 * 0.5 * 2); // base + ratio*levels
    expect(levels.iron).toBe(2);
    // copper untouched
    expect(capacity.copper).toBe(200);
    expect(levels.copper).toBe(5);
  });

  it("capacity scales with base capacity (not absolute)", () => {
    // Higher base capacity -> larger absolute gain
    const state = makeState({
      money: 100_000,
      resourceCapacity: {
        iron: 100, // base
        rareEarth: 20, // lower base
      } as Record<ResourceType, number>,
    });
    const resultIron = validateUpgradeStorageAction("iron", 1, state);
    const resultRare = validateUpgradeStorageAction("rareEarth", 1, state);

    expect(resultIron.valid).toBe(true);
    expect(resultRare.valid).toBe(true);
    const ironCap = (
      resultIron.correctedState?.resourceCapacity as Record<string, number>
    ).iron;
    const rareCap = (
      resultRare.correctedState?.resourceCapacity as Record<string, number>
    ).rareEarth;
    // iron base 100 * 0.5 = +50; rareEarth base 20 * 0.5 = +10
    expect(ironCap - 100).toBe(50);
    expect(rareCap - 20).toBe(10);
  });
});
