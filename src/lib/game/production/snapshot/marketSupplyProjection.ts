// ============================================
// marketSupplyProjection.ts — V-032 / PR-BP-2.
//
// Server-only projection of a ProductionSnapshot that the global market
// aggregate cron reads. Persisted as the top-level `market_supply`
// JSONB column on `server_game_state` (see migration
// 20260715000000_076_market_supply_state.sql).
//
// Phase 13 invariant kept: `productionSnapshot` remains a UI-only field
// and is stripped before persistence. This projection duplicates only
// the slim server-pure subset the aggregate cron needs
// (`production`, `actualConsumption`) plus a server-side `updatedAt`,
// and survives the persistence boundary intact.
// ============================================

import type { ProductionSnapshot } from "../productionCalculator";

export interface MarketSupplyProjection {
  production: Record<string, number>;
  actualConsumption: Record<string, number>;
  updatedAt: string;
}

/**
 * Build a server-pure supply projection from a post-tick snapshot.
 *
 * Inputs:
 *   - `snapshot` may be null on zero-tick / cold-start paths; in that
 *     case the projection is the empty stub (caller has no new data).
 *   - `now` defaults to the current ISO timestamp; tests can pin it.
 *
 * Output:
 *   - Object safe to insert into `server_game_state.market_supply`
 *     (JSONB column, never NULL).
 *
 * Why we don't reuse `ProductionSnapshot` directly:
 *   - `ProductionSnapshot` carries UI-shaped fields (per-building
 *     detail, power grid, payout breakdown) and is large enough that
 *     persisting it per player would bloat rows for no analytic value.
 *   - The aggregate cron only consumes `production` and
 *     `actualConsumption`. A dedicated projection keeps the column
 *     shape narrow and stable, matching what `market_supply_demand`
 *     consumers expect.
 */
export function buildMarketSupplyProjection(
  snapshot: ProductionSnapshot | null,
  now: string = new Date().toISOString(),
): MarketSupplyProjection {
  if (!snapshot) {
    return { production: {}, actualConsumption: {}, updatedAt: now };
  }
  return {
    production: snapshot.production ?? {},
    actualConsumption: snapshot.actualConsumption ?? {},
    updatedAt: now,
  };
}
