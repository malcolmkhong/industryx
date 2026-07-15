/**
 * tests/unit/marketSupplyProjection.test.ts
 *
 * NEW-TEST-031 (V-032 / PR-BP-2, 2026-07-15):
 *
 * Unit-level coverage for the server-only supply projection builder.
 * The aggregate cron reads `server_game_state.market_supply` produced
 * by this helper. Verifies the slim subset shape
 * (`production`, `actualConsumption`, `updatedAt`) and the null-snapshot
 * fallback used by zero-tick / cold-start paths.
 */

import { describe, expect, it } from "vitest";
import { emptyProductionSnapshot } from "@/lib/game/production/snapshot/emptyProductionSnapshot";
import {
  buildMarketSupplyProjection,
  type MarketSupplyProjection,
} from "@/lib/game/production/snapshot/marketSupplyProjection";
import type { ProductionSnapshot } from "@/lib/game/production/productionCalculator";

const PINNED_NOW = "2026-07-15T00:00:00.000Z";

describe("buildMarketSupplyProjection (V-032 / PR-BP-2)", () => {
  it("projects the canonical subset of a non-null snapshot", () => {
    const snap = {
      ...emptyProductionSnapshot(),
      production: { iron: 12.3, copper: 5.1 },
      actualConsumption: { iron: 8, copper: 4.5 },
    } as ProductionSnapshot;

    const projection = buildMarketSupplyProjection(snap, PINNED_NOW);

    expect(projection.production).toEqual({ iron: 12.3, copper: 5.1 });
    expect(projection.actualConsumption).toEqual({ iron: 8, copper: 4.5 });
    expect(projection.updatedAt).toBe(PINNED_NOW);
  });

  it("returns an empty projection when snapshot is null (zero-tick / cold start)", () => {
    const projection = buildMarketSupplyProjection(null, PINNED_NOW);

    expect(projection.production).toEqual({});
    expect(projection.actualConsumption).toEqual({});
    expect(projection.updatedAt).toBe(PINNED_NOW);
  });

  it("ignores fields that are not in the slim subset (power / payout / buildings / rates)", () => {
    // Defends the contract: the projection is intentionally NARROW. UI
    // fields like per-building detail, power grid, payout breakdown,
    // and rates are NOT persisted into market_supply.
    const snap = {
      ...emptyProductionSnapshot(),
      production: { iron: 1 },
      actualConsumption: {},
      buildings: { "extractor-iron": { outputs: [], inputs: [], efficiency: 0.5 } },
      powerProduction: 50,
      powerConsumption: 30,
      payoutPerCycle: 100,
      payoutBreakdown: { extractors: 50, factories: 40, power: 10 },
      sellMultiplier: 1.5,
      moneyIncomeRate: 7,
      moneyExpenseRate: 3,
    } as unknown as ProductionSnapshot;

    const projection = buildMarketSupplyProjection(snap, PINNED_NOW) as
      MarketSupplyProjection & { [k: string]: unknown };

    expect(projection.production).toEqual({ iron: 1 });
    expect(projection.actualConsumption).toEqual({});
    expect(projection.updatedAt).toBe(PINNED_NOW);
    // Confirm the slim shape: no power / payout / buildings / rates keys.
    expect("buildings" in projection).toBe(false);
    expect("powerProduction" in projection).toBe(false);
    expect("payoutPerCycle" in projection).toBe(false);
    expect("sellMultiplier" in projection).toBe(false);
    expect("moneyIncomeRate" in projection).toBe(false);
  });

  it("defaults now to current ISO when caller omits it", () => {
    const snap = {
      ...emptyProductionSnapshot(),
      production: { iron: 1 },
    } as ProductionSnapshot;

    const projection = buildMarketSupplyProjection(snap);

    expect(typeof projection.updatedAt).toBe("string");
    expect(new Date(projection.updatedAt).toString()).not.toBe("Invalid Date");
  });
});
