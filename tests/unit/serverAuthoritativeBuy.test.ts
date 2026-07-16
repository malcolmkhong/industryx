// ============================================
// tests/unit/serverAuthoritativeBuy.test.ts
//
// Phase 6, action #11: server-authoritative buyResource. Verifies the
// server reads the price from state.market (immune to client tampering),
// computes cost with server-side buyPriceMarkup, validates money
// affordability AND storage capacity, and returns authoritative post-buy
// state.
//
// Spend path: money decreases; totalMoneyEarned is NOT changed (buy is
// not income).
// ============================================

import { describe, it, expect, beforeEach } from "vitest";
import balanceFixture from "../fixtures/balanceFixture.json";
import {
  applyBalanceOverrides,
  _resetBalanceForTests,
  type GameBalanceConfig,
} from "@/lib/game/config/balance/balanceConfig";
import { validateBuyAction } from "@/lib/game/production/engine/serverEngine.server";
import type { GameState, MarketPrice } from "@/lib/game/shared/types/types";

function makeMarket(overrides?: Partial<MarketPrice>): MarketPrice {
  return {
    resource: "iron" as never,
    basePrice: 100,
    currentPrice: 100,
    priceHistory: [100],
    demand: 1,
    supply: 1,
    trend: "stable" as never,
    volatility: 0.1,
    ...overrides,
  } as MarketPrice;
}

function makeState(overrides?: {
  money?: number;
  totalMoneyEarned?: number;
  resources?: Record<string, number>;
  market?: MarketPrice[];
  resourceCapacity?: Record<string, number>;
}): Partial<GameState> {
  return {
    money: overrides?.money ?? 100_000,
    totalMoneyEarned: overrides?.totalMoneyEarned ?? 50_000,
    gameTick: 100,
    buildings: [],
    workers: [],
    resources: (overrides?.resources ?? { iron: 0 }) as Record<
      string,
      number
    >,
    market: overrides?.market ?? [
      makeMarket({ resource: "iron" as never, currentPrice: 100 }),
    ],
    completedResearch: [],
    resourceCapacity: overrides?.resourceCapacity as never,
    prestigeState: {
      corporationPoints: 0,
      totalPrestiges: 0,
      megaFactoryUnlocked: false,
      bonuses: [],
    },
  };
}

function makeCompleteBalance(): GameBalanceConfig {
  return structuredClone(balanceFixture) as unknown as GameBalanceConfig;
}

beforeEach(() => {
  _resetBalanceForTests();
  applyBalanceOverrides(makeCompleteBalance());
});

describe("validateBuyAction (server-authoritative)", () => {
  it("returns valid + correctedState for affordable buy", () => {
    const state = makeState({ money: 100_000 });
    const result = validateBuyAction("iron", 100, state);

    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    const resources = result.correctedState?.resources as Record<
      string,
      number
    >;
    expect(resources.iron).toBe(100); // 0 + 100
  });

  it("computes cost from server-side market price + markup", () => {
    // State has currentPrice=200; client could claim price=1 but server uses 200
    const state = makeState({
      money: 100_000,
      market: [makeMarket({ resource: "iron" as never, currentPrice: 200 })],
    });
    const result = validateBuyAction("iron", 10, state);

    expect(result.valid).toBe(true);
    // Server-authoritative: cost uses server-configured price + buyPriceMarkup.
    // The default buyPriceMarkup is 1.1x. Accept any value in [0.5, 5]
    // (research upgrades can modify it; we don't include them in server
    // formula as documented in the validator).
    const moneySpent = 100_000 - (result.correctedState?.money ?? 100_000);
    const ratio = moneySpent / (200 * 10);
    expect(ratio).toBeGreaterThanOrEqual(0.5);
    expect(ratio).toBeLessThanOrEqual(5);
  });

  it("rejects when player lacks money", () => {
    const state = makeState({ money: 1 }); // can't afford anything
    const result = validateBuyAction("iron", 100, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not enough money");
    expect(result.correctedState).toBeUndefined();
  });

  it("rejects when resource not in market", () => {
    const state = makeState({ market: [] });
    const result = validateBuyAction("iron", 100, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("No market found");
  });

  it("rejects when market price is invalid (NaN/Infinity/zero/negative)", () => {
    const state1 = makeState({
      market: [makeMarket({ resource: "iron" as never, currentPrice: NaN })],
    });
    expect(validateBuyAction("iron", 100, state1).valid).toBe(false);

    const state2 = makeState({
      market: [
        makeMarket({ resource: "iron" as never, currentPrice: Infinity }),
      ],
    });
    expect(validateBuyAction("iron", 100, state2).valid).toBe(false);

    const state3 = makeState({
      market: [makeMarket({ resource: "iron" as never, currentPrice: 0 })],
    });
    expect(validateBuyAction("iron", 100, state3).valid).toBe(false);

    const state4 = makeState({
      market: [makeMarket({ resource: "iron" as never, currentPrice: -5 })],
    });
    expect(validateBuyAction("iron", 100, state4).valid).toBe(false);
  });

  it("rejects when buy would overflow storage capacity", () => {
    const state = makeState({
      money: 100_000,
      resources: { iron: 900 } as Record<string, number>,
      resourceCapacity: { iron: 1000 } as Record<string, number>,
    });
    // Trying to buy 200 → would go to 1100 > 1000 capacity
    const result = validateBuyAction("iron", 200, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Storage full");
  });

  it("allows buy up to exactly storage capacity", () => {
    const state = makeState({
      money: 100_000,
      resources: { iron: 800 } as Record<string, number>,
      resourceCapacity: { iron: 1000 } as Record<string, number>,
    });
    // Trying to buy 200 → exactly 1000 (boundary)
    const result = validateBuyAction("iron", 200, state);

    expect(result.valid).toBe(true);
    const resources = result.correctedState?.resources as Record<
      string,
      number
    >;
    expect(resources.iron).toBe(1000);
  });

  it("treats missing capacity as unlimited", () => {
    // No resourceCapacity set → Infinity capacity
    const state = makeState({
      money: 100_000,
      resources: { iron: 999_999 } as Record<string, number>,
    });
    const result = validateBuyAction("iron", 100, state);

    expect(result.valid).toBe(true);
  });

  it("rejects missing resource", () => {
    const state = makeState();
    const result = validateBuyAction("", 100, state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing resource");
  });

  it("rejects invalid amount (zero, negative, non-integer, NaN)", () => {
    const state = makeState();
    expect(validateBuyAction("iron", 0, state).valid).toBe(false);
    expect(validateBuyAction("iron", -10, state).valid).toBe(false);
    expect(validateBuyAction("iron", 10.5, state).valid).toBe(false);
    expect(validateBuyAction("iron", Number.NaN, state).valid).toBe(false);
  });

  it("does NOT change totalMoneyEarned (buy is spend, not income)", () => {
    const state = makeState({
      money: 100_000,
      totalMoneyEarned: 50_000,
    });
    const beforeEarned = state.totalMoneyEarned ?? 0;
    const result = validateBuyAction("iron", 100, state);

    expect(result.valid).toBe(true);
    const afterEarned = result.correctedState?.totalMoneyEarned ?? beforeEarned;
    expect(afterEarned).toBe(beforeEarned);
  });

  it("preserves other resources' amounts", () => {
    const state = makeState({
      resources: { iron: 100, copper: 50, gold: 25 } as Record<
        string,
        number
      >,
    });
    const result = validateBuyAction("iron", 50, state);

    const resources = result.correctedState?.resources as Record<
      string,
      number
    >;
    expect(resources.iron).toBe(150); // 100 + 50
    expect(resources.copper).toBe(50); // unchanged
    expect(resources.gold).toBe(25); // unchanged
  });
});
