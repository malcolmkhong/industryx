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

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/db/types';

type ServerMarketStateRow = Database['public']['Tables']['server_market_state']['Row'];
type MarketPlayerPressureRow = Database['public']['Tables']['market_player_pressure']['Row'];
type MarketSupplyDemandRow = Database['public']['Tables']['market_supply_demand']['Row'];

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
    .select('*')
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
    .select('*');

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
