/**
 * tests/unit/utils/costCalculator-v030.test.ts
 *
 * V-030 / PR-BP-3 §2.11 (2026-07-15):
 *   `getCapacity()` previously fell back to `?? 50` when a resource had
 *   no `resourceCapacity` row in client state. That silent default
 *   diverged from the server tick path (which silently cap'd at
 *   `Infinity`) and from `validateUpgradeStorageAction` (which used a
 *   literal `MAX_STORAGE_UPGRADE = 100`). After §2.1 server-side and
 *   §2.11 client-side, missing capacity rows fail closed.
 *
 * Maps to: Audit §5.5 / §5.8 / §9.5 V-030, BUG-046.
 */

import { describe, it, expect, beforeEach } from "vitest";

import fixture from "../../fixtures/balanceFixture.json";
import {
  applyBalanceOverrides,
  _resetBalanceForTests,
  type GameBalanceConfig,
} from "@/lib/game/config/balance/balanceConfig";
import { getCapacity } from "@/lib/game/shared/utils/costCalculator";
import type { GameState, ResourceType } from "@/lib/game/shared/types/types";

const BALANCE = fixture as unknown as GameBalanceConfig;

interface MinimalState {
  megaProjects: Array<{
    completed: boolean;
    bonus: { type: string; value: number };
  }>;
  resourceCapacity: Record<string, number>;
}

function makeState(
  overrides: Partial<MinimalState> = {},
): GameState {
  return {
    megaProjects: (overrides.megaProjects ?? []) as GameState["megaProjects"],
    resourceCapacity:
      overrides.resourceCapacity ??
      ({ iron: 100 } as Record<ResourceType, number>),
    prestigeState: {
      totalPrestiges: 0,
      corporationPoints: 0,
      bonuses: [],
    },
  } as unknown as GameState;
}

/**
 * Stubbed multiplier cache so the happy-path test does not exercise
 * `buildMultipliers` (a separate concern with its own init chain).
 */
const CACHE_STUB = {
  storageCapacityBonus: 0,
} as unknown as Parameters<typeof getCapacity>[3];

beforeEach(() => {
  _resetBalanceForTests();
  applyBalanceOverrides(BALANCE);
});

describe("getCapacity — V-030 fail-closed (client parity with §2.1 server)", () => {
  it("returns base capacity when row exists", () => {
    const out = getCapacity(
      makeState({ resourceCapacity: { iron: 200 } }),
      "iron",
      undefined,
      CACHE_STUB,
    );
    expect(out).toBe(200);
  });

  it("throws RangeError when resourceCapacity row is missing", () => {
    expect(() =>
      getCapacity(
        makeState({ resourceCapacity: { iron: undefined as unknown as number } }),
        "iron",
      ),
    ).toThrow(/missing or non-finite resourceCapacity for "iron"/);
  });

  it("throws RangeError when resourceCapacity row is non-finite", () => {
    expect(() =>
      getCapacity(
        makeState({ resourceCapacity: { iron: Number.POSITIVE_INFINITY } }),
        "iron",
      ),
    ).toThrow(/missing or non-finite resourceCapacity for "iron"/);
  });

  it("returns Infinity for Terraforming Engine mega project (honored client-side)", () => {
    const out = getCapacity(
      makeState({
        megaProjects: [
          { completed: true, bonus: { type: "unlimitedStorage", value: 0 } },
        ],
        resourceCapacity: { iron: 100 },
      }),
      "iron",
      undefined,
      CACHE_STUB,
    );
    expect(out).toBe(Infinity);
  });
});
