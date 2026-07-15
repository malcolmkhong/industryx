/**
 * tests/unit/storage-validators-fail-closed.test.ts
 *
 * NEW-TEST-049 (PR-BP-3 §2.1 / §2.11, 2026-07-15):
 *   - Storage upgrade validator bulk-cap moved off literal
 *     `MAX_STORAGE_UPGRADE = 100` to `game_config_balance.storage.maxBulkUpgradeLevels`.
 *   - Missing storage row fails closed (was `?? 50` client / `?? Infinity` server).
 *   - `hasUnlimitedStorage(state.megaProjects)` honored server-side (was client-only).
 *
 * References:
 *   - PR-BP-3 §2.1 / §2.11
 *   - Audit V-003, V-004, V-030 (BUGS.md BUG-046/048/068)
 *   - Rules: SEC-002 (fail closed), ARC-002 (no hardcoded balance)
 */

import { describe, it, expect, beforeEach } from "vitest";

import fixture from "../fixtures/balanceFixture.json";
import {
  applyBalanceOverrides,
  _resetBalanceForTests,
  getBalance,
} from "@/lib/game/config/balance/balanceConfig";
import { validateUpgradeStorageAction } from "@/lib/game/production/engine/validators/storage";

interface MinimalStorage {
  money: number;
  totalMoneyEarned?: number;
  gameTick?: number;
  resourceCapacity?: Record<string, number>;
  storageUpgradeLevels?: Record<string, number>;
}

function makeState(overrides: Partial<MinimalStorage> = {}): Parameters<
  typeof validateUpgradeStorageAction
>[2] {
  return {
    money: overrides.money ?? 1e15,
    totalMoneyEarned: overrides.totalMoneyEarned ?? 0,
    gameTick: overrides.gameTick ?? 1,
    resourceCapacity:
      overrides.resourceCapacity ?? ({ iron: 100 } as Record<string, number>),
    storageUpgradeLevels:
      overrides.storageUpgradeLevels ?? ({ iron: 0 } as Record<string, number>),
  };
}

beforeEach(() => {
  _resetBalanceForTests();
  applyBalanceOverrides(
    fixture as unknown as Parameters<typeof applyBalanceOverrides>[0],
  );
});

describe("validateUpgradeStorageAction — bulk-cap from balance (NEW-TEST-049)", () => {
  it("balancer fixture ships storage.maxBulkUpgradeLevels = 100", () => {
    expect(getBalance().storage.maxBulkUpgradeLevels).toBe(100);
  });

  it("rejects levels above the balance-driven cap with a message that mirrors the cap", () => {
    const cap = getBalance().storage.maxBulkUpgradeLevels;
    const state = makeState();
    const result = validateUpgradeStorageAction("iron", cap + 1, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain(`${cap} levels`);
  });

  it("accepts up to (cap - 1) levels (boundary — affordable)", () => {
    const cap = getBalance().storage.maxBulkUpgradeLevels;
    // Geometric cost series 100 * (1.35^n) summed across 99 levels blows
    // past $1e15 — bump the budget to $1e20 to keep the boundary check
    // focused on the cap and not on affordability.
    const state = makeState({ money: 1e20 });
    const result = validateUpgradeStorageAction("iron", cap - 1, state);

    expect(result.valid).toBe(true);
  });

  it("non-numeric / missing cap in balance throws BalanceNotLoadedError (fail closed)", () => {
    _resetBalanceForTests();
    const { storage, ...rest } = fixture as unknown as {
      storage: Record<string, unknown>;
    } & Record<string, unknown>;
    void storage;
    // Applying a fixture with `storage` omitted trips the validator's
    // "incomplete balance" check; nothing gets installed.
    expect(() =>
      applyBalanceOverrides(
        rest as unknown as Parameters<typeof applyBalanceOverrides>[0],
      ),
    ).toThrow(/incomplete balance/);
    // Now `getBalance()` throws BalanceNotLoadedError and the validator
    // inherits the fail-closed state.
    expect(() => getBalance()).toThrow();
    expect(() =>
      validateUpgradeStorageAction("iron", 1, makeState()),
    ).toThrow();
  });
});

describe("storage.maxBulkUpgradeLevels — config transform (NEW-TEST-027)", () => {
  it("balance validator requires the field with `vrange(1, 1000)`", async () => {
    // Smoke: rejects omission.
    _resetBalanceForTests();
    const bad = structuredClone(fixture) as Record<string, unknown>;
    const storage = bad.storage as Record<string, unknown>;
    delete storage.maxBulkUpgradeLevels;
    expect(() =>
      applyBalanceOverrides(
        bad as unknown as Parameters<typeof applyBalanceOverrides>[0],
      ),
    ).toThrow(/missing required field "storage\.maxBulkUpgradeLevels"/);
  });

  it("balance validator rejects out-of-range values (below 1)", () => {
    _resetBalanceForTests();
    const bad = structuredClone(fixture) as Record<string, unknown>;
    (bad.storage as Record<string, unknown>).maxBulkUpgradeLevels = 0;
    expect(() =>
      applyBalanceOverrides(
        bad as unknown as Parameters<typeof applyBalanceOverrides>[0],
      ),
    ).toThrow(/invalid values/);
  });

  it("balance validator rejects out-of-range values (above 1000)", () => {
    _resetBalanceForTests();
    const bad = structuredClone(fixture) as Record<string, unknown>;
    (bad.storage as Record<string, unknown>).maxBulkUpgradeLevels = 1001;
    expect(() =>
      applyBalanceOverrides(
        bad as unknown as Parameters<typeof applyBalanceOverrides>[0],
      ),
    ).toThrow(/invalid values/);
  });
});
