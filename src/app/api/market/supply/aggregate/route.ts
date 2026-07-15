// ============================================
// POST /api/market/supply/aggregate
// Recompute global supply/demand from all server_game_state rows.
// Called by:
//   - Vercel cron every 60s (recommended)
//   - The /api/market/tick route before running the simulation
//   - Manually via curl for debugging
//
// Source data shape (per player, in `server_game_state.market_supply`):
//   {
//     production: { iron: 12.3, copper: 5.1, ... },
//     actualConsumption: { iron: 8.0, copper: 4.5, ... },
//     updatedAt: "2026-07-15T00:00:00.000Z"
//   }
//
// PR-BP-2 (V-032): the legacy reader on `full_state.productionSnapshot`
// was silently broken — `stripUIFields` removes that field before
// persistence, so the read was always undefined and every player was
// skipped. We now read the dedicated `market_supply` JSONB column
// populated by `buildMarketSupplyProjection` in
// `src/lib/game/production/snapshot/marketSupplyProjection.ts`.
// Phase 13 invariant kept: `productionSnapshot` stays a UI-only field.
//
// Iteration 9e of DB centralization migration:
//   - paginated server_game_state read routed through
//     db/serverGameState#pageServerGameStateFullState.
//   - upsert_supply_demand RPC stays inline (narrow SQL function, no
//     helper value). Documented inline.
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/access';;
import { pageServerGameStateFullState } from '@/lib/db/game/serverGameState';
import type { MarketSupplyProjection } from '@/lib/game/production/snapshot/marketSupplyProjection';

const PAGE = 1000;

export async function POST() {
  // The RPC client needs service-role to write market_supply_demand; not
  // routed through a helper because it is a one-off SQL function with no
  // other callers.
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const productionTotals = new Map<string, number>();
  const consumptionTotals = new Map<string, number>();
  const playerCounts = new Map<string, number>();
  const playersScanned = await collectSupplyDemandPages(
    0,
    productionTotals,
    consumptionTotals,
    playerCounts,
  );
  if (playersScanned === null) {
    return NextResponse.json({ error: 'Read failed' }, { status: 500 });
  }

  // 2. Upsert into market_supply_demand
  const resources = new Set([...productionTotals.keys(), ...consumptionTotals.keys()]);
  const writeResults = await Promise.all([...resources].map(async (resource) => {
    const production = productionTotals.get(resource) ?? 0;
    const consumption = consumptionTotals.get(resource) ?? 0;
    const playerCount = playerCounts.get(resource) ?? 0;
    const { error: rpcError } = await supabase.rpc('upsert_supply_demand', {
      p_resource: resource,
      p_production: production,
      p_consumption: consumption,
      p_player_count: playerCount,
    });
    if (rpcError) {
      console.error(`[aggregate-supply] upsert failed for ${resource}:`, rpcError.message);
      return false;
    }
    return true;
  }));
  const written = writeResults.filter(Boolean).length;

  return NextResponse.json({
    success: true,
    playersScanned,
    resourcesAggregated: written,
    durationMs: Date.now(),
  });
}

// GET = same action (for manual triggering / monitoring)
export function GET() {
  return POST();
}

async function collectSupplyDemandPages(
  offset: number,
  productionTotals: Map<string, number>,
  consumptionTotals: Map<string, number>,
  playerCounts: Map<string, number>,
): Promise<number | null> {
  const page = await pageServerGameStateFullState(offset, PAGE);
  if (page === null) return null;
  if (page.rows.length === 0) return 0;

  let playersScanned = 0;
  for (const row of page.rows) {
    playersScanned += 1;
    // PR-BP-2 (V-032): read server-only supply projection. The previous
    // implementation read `fullState.productionSnapshot`, which
    // `stripUIFields` strips before persistence; the projection column
    // survives the strip and is the canonical server-authoritative
    // source for the aggregate cron.
    const projection = row.market_supply as MarketSupplyProjection | null;
    if (!projection || typeof projection !== 'object') continue;

    for (const [resource, value] of Object.entries(projection.production ?? {})) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
      productionTotals.set(resource, (productionTotals.get(resource) ?? 0) + value);
      playerCounts.set(resource, (playerCounts.get(resource) ?? 0) + 1);
    }

    for (const [resource, value] of Object.entries(projection.actualConsumption ?? {})) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
      consumptionTotals.set(resource, (consumptionTotals.get(resource) ?? 0) + value);
      // Don't double-count: player contributes to BOTH production and consumption for same resource
      if (!productionTotals.has(resource)) {
        playerCounts.set(resource, (playerCounts.get(resource) ?? 0) + 1);
      }
    }
  }

  if (!page.hasMore) return playersScanned;
  const laterPlayersScanned = await collectSupplyDemandPages(
    offset + PAGE,
    productionTotals,
    consumptionTotals,
    playerCounts,
  );
  return laterPlayersScanned === null
    ? null
    : playersScanned + laterPlayersScanned;
}
