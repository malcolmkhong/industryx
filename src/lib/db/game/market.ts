/**
 * market — Centralized access to market tables.
 *
 * Iteration 4 of the Database Centralization migration (2026-06-20).
 * Migrated routes: /api/market/state (read), /api/market/tick (read+update).
 *
 * Tables accessed:
 *   - server_market_state     — global prices, tick, volatility, news
 *   - market_player_pressure  — per-player buy/sell pressure per resource
 *   - market_supply_demand     — aggregated production/consumption per resource
 *
 * Conventions:
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 */

import { createServiceRoleClient } from '@/lib/db/access';;
import type { Database } from '@/lib/db/types';

type ServerMarketStateRow = Database['public']['Tables']['server_market_state']['Row'];
type MarketPlayerPressureRow = Database['public']['Tables']['market_player_pressure']['Row'];

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/**
 * Read global market state — tick, prices, news, volatility.
 * Used by /api/market/state GET.
 * Returns Pick<ServerMarketStateRow, 'tick' | 'prices' | 'news' | 'volatility'>.
 */
export async function getMarketState(): Promise<Pick<ServerMarketStateRow, 'tick' | 'prices' | 'news' | 'volatility'> | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_market_state')
    .select('tick, prices, news, volatility')
    .eq('id', 1)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Read full server_market_state row.
 * Used by /api/market/tick POST.
 */
export async function getMarketStateFull(): Promise<ServerMarketStateRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('server_market_state')
    .select(
      'id,tick,prices,base_prices,volatility,circuit_breakers,news,updated_at',
    )
    .eq('id', 1)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Read all market_player_pressure rows for aggregation.
 * Used by /api/market/tick POST.
 */
export async function getAllPlayerPressure(): Promise<MarketPlayerPressureRow[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from('market_player_pressure')
    .select('user_id,resource,buy_volume,sell_volume,updated_at');

  return data ?? [];
}

/**
 * Read all market_supply_demand rows (narrow select).
 * Used by /api/market/tick POST.
 */
export interface SupplyDemandRow {
  resource: string;
  production: number;
  consumption: number;
}

export async function getAllSupplyDemand(): Promise<SupplyDemandRow[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from('market_supply_demand')
    .select('resource, production, consumption');

  return (data ?? []) as SupplyDemandRow[];
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

/**
 * Update the news field on server_market_state.
 * Used by /api/market/tick POST after AI news is generated.
 */
export async function updateMarketNews(news: unknown): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('server_market_state')
    .update({ news, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) {
    console.error('[market] Failed to update news:', error.message);
    return false;
  }
  return true;
}
// ============================================
// Iteration 8 — admin / system-status helpers
// ============================================

export interface MarketStateWithConfig {
  tick: number;
  prices: Record<string, number>;
  base_prices: Record<string, number>;
  volatility: number | null;
  circuit_breakers: Record<string, unknown>;
  news: unknown;
  updated_at: string;
}

/**
 * Latest server_market_state row joined with the full base_prices/circuit_breakers
 * payload. Used by /api/admin/market/overview for resource overview.
 */
export async function getLatestMarketStateExtended(): Promise<MarketStateWithConfig | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from('server_market_state')
    .select('tick, prices, base_prices, volatility, circuit_breakers, news, updated_at')
    .order('tick', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as MarketStateWithConfig | null) ?? null;
}

export async function getLatestMarketTickAndBreakers(): Promise<{
  tick: number;
  circuit_breakers: Record<string, unknown> | null;
} | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from('server_market_state')
    .select('tick, circuit_breakers')
    .order('tick', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    tick: data.tick as number,
    circuit_breakers: (data.circuit_breakers as Record<string, unknown> | null) ?? null,
  };
}

export async function updateMarketCircuitBreakers(
  breakers: Record<string, unknown>,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from('server_market_state')
    .update({ circuit_breakers: breakers, updated_at: new Date().toISOString() })
    .eq('id', 1);
  return !error;
}
// ============================================
// Iteration 8 — getLatestMarketTickInfo for jobs dashboard
// ============================================

export interface LatestMarketTickInfo {
  tick: number;
  updated_at: string;
  resourceCount: number;
}

/**
 * Returns the latest tick + updated_at + count of resources in `prices`.
 * Used by /api/admin/system/jobs and /api/admin/system/status.
 */
export async function getLatestMarketTickInfo(): Promise<LatestMarketTickInfo | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from('server_market_state')
    .select('tick, updated_at, prices')
    .order('tick', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const prices = (data.prices as Record<string, unknown> | null) ?? {};
  return {
    tick: data.tick as number,
    updated_at: data.updated_at as string,
    resourceCount: Object.keys(prices).length,
  };
}
// ============================================
// Iteration 8 — getLatestMarketTickWithNews for system-status
// ============================================

export interface LatestMarketNewsRow {
  news: unknown;
  updated_at: string;
}

/**
 * Returns the latest server_market_state row with non-null news array.
 * Used by /api/admin/system/status for the "AI News Generator" service check.
 */
export async function getLatestMarketNews(): Promise<LatestMarketNewsRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from('server_market_state')
    .select('news, updated_at')
    .not('news', 'is', null)
    .order('tick', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as LatestMarketNewsRow | null) ?? null;
}
