// ============================================
// POST /api/market/aggregate-supply
// Recompute global supply/demand from all server_game_state rows.
// Called by:
//   - Vercel cron every 60s (recommended)
//   - The /api/market/tick route before running the simulation
//   - Manually via curl for debugging
//
// Source data shape (per player, in `full_state`):
//   {
//     productionSnapshot: {
//       production: { iron: 12.3, copper: 5.1, ... },
//       actualConsumption: { iron: 8.0, copper: 4.5, ... },
//       gameTick: 12345,
//       capturedAt: 1234567890
//     }
//   }
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface ProductionSnapshot {
  production?: Record<string, number>;
  actualConsumption?: Record<string, number>;
  gameTick?: number;
  capturedAt?: number;
}

interface ServerGameState {
  full_state: Record<string, unknown> | null;
}

export async function POST() {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // 1. Read all server_game_state rows
  //    Using a paginated select to bound memory; default page size is 1000.
  const allRows: ServerGameState[] = [];
  const PAGE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('server_game_state')
      .select('full_state')
      .range(offset, offset + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: `Read failed: ${error.message}` }, { status: 500 });
    }
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allRows.push(...(data as ServerGameState[]));
      if (data.length < PAGE) {
        hasMore = false;
      } else {
        offset += PAGE;
      }
    }
  }

  // 2. Aggregate production + consumption per resource
  const productionTotals = new Map<string, number>();
  const consumptionTotals = new Map<string, number>();
  const playerCounts = new Map<string, number>();

  for (const row of allRows) {
    const snapshot = row.full_state?.productionSnapshot as ProductionSnapshot | undefined;
    if (!snapshot) continue;

    for (const [resource, value] of Object.entries(snapshot.production ?? {})) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
      productionTotals.set(resource, (productionTotals.get(resource) ?? 0) + value);
      playerCounts.set(resource, (playerCounts.get(resource) ?? 0) + 1);
    }

    for (const [resource, value] of Object.entries(snapshot.actualConsumption ?? {})) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
      consumptionTotals.set(resource, (consumptionTotals.get(resource) ?? 0) + value);
      // Don't double-count: player contributes to BOTH production and consumption for same resource
      if (!productionTotals.has(resource)) {
        playerCounts.set(resource, (playerCounts.get(resource) ?? 0) + 1);
      }
    }
  }

  // 3. Upsert into market_supply_demand
  const resources = new Set([...productionTotals.keys(), ...consumptionTotals.keys()]);
  let written = 0;
  for (const resource of resources) {
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
      continue;
    }
    written++;
  }

  return NextResponse.json({
    success: true,
    playersScanned: allRows.length,
    resourcesAggregated: written,
    durationMs: Date.now(),
  });
}

// GET = same action (for manual triggering / monitoring)
export async function GET() {
  return POST();
}
