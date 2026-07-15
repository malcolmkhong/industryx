/**
 * configMarket.ts — Centralized DB access for the `game_config_market` table.
 *
 * Iteration 8. CRUD for admin resource management. The market tick
 * (`/api/market/tick`) syncs new rows to `server_market_state` on its next
 * 60s cycle, so resources added here become tradable automatically.
 */

import { createServiceRoleClient } from '@/lib/db/access';;

export type ValidSector =
  | 'raw_minerals'
  | 'raw_organic'
  | 'basic_materials'
  | 'components'
  | 'advanced'
  | 'high_tech'
  | 'endgame'
  | 'agriculture';

export interface MarketConfigRow {
  resource_id: string;
  base_price: number;
  sector: string;
  elasticity: number;
  is_tradable: boolean;
}

export async function listAllMarketConfig(): Promise<MarketConfigRow[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('game_config_market')
    .select('resource_id, base_price, sector, elasticity, is_tradable');
  return (data ?? []) as MarketConfigRow[];
}

export async function getMarketConfigById(
  resourceId: string,
): Promise<MarketConfigRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from('game_config_market')
    .select('resource_id, base_price, sector, elasticity, is_tradable')
    .eq('resource_id', resourceId)
    .maybeSingle();
  return (data as MarketConfigRow | null) ?? null;
}

export interface NewMarketConfig {
  resource_id: string;
  base_price: number;
  sector: ValidSector;
  elasticity: number;
  is_tradable: boolean;
}

export async function createMarketConfig(
  values: NewMarketConfig,
): Promise<MarketConfigRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('game_config_market')
    .insert({
      resource_id: values.resource_id,
      base_price: values.base_price,
      sector: values.sector,
      elasticity: values.elasticity,
      is_tradable: values.is_tradable,
    })
    .select('resource_id, base_price, sector, elasticity, is_tradable')
    .single();
  if (error || !data) return null;
  return data as MarketConfigRow;
}

export async function updateMarketConfig(
  resourceId: string,
  patch: Omit<NewMarketConfig, 'resource_id'>,
): Promise<MarketConfigRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('game_config_market')
    .update({
      base_price: patch.base_price,
      sector: patch.sector,
      elasticity: patch.elasticity,
      is_tradable: patch.is_tradable,
    })
    .eq('resource_id', resourceId)
    .select('resource_id, base_price, sector, elasticity, is_tradable')
    .single();
  if (error || !data) return null;
  return data as MarketConfigRow;
}

export async function deleteMarketConfig(
  resourceId: string,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from('game_config_market')
    .delete()
    .eq('resource_id', resourceId);
  return !error;
}// ============================================
// Iteration 8 — error-aware updateMarketConfig + deleteMarketConfig
// ============================================

export interface UpdateMarketConfigResult {
  data: MarketConfigRow | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Update existing resource; returns the row, error code, and error message
 * so the route can map Postgres error codes to HTTP responses (e.g.
 * PGRST116 → 404, 23505 → 409).
 */
export async function updateMarketConfigWithError(
  resourceId: string,
  patch: Omit<NewMarketConfig, 'resource_id'>,
): Promise<UpdateMarketConfigResult> {
  const supabase = createServiceRoleClient();
  if (!supabase) return { data: null, errorCode: null, errorMessage: 'Database not configured' };
  const { data, error } = await supabase
    .from('game_config_market')
    .update({
      base_price: patch.base_price,
      sector: patch.sector,
      elasticity: patch.elasticity,
      is_tradable: patch.is_tradable,
    })
    .eq('resource_id', resourceId)
    .select('resource_id, base_price, sector, elasticity, is_tradable')
    .single();
  if (error || !data) {
    return {
      data: null,
      errorCode: error?.code ?? 'UNKNOWN',
      errorMessage: error?.message ?? 'Update failed',
    };
  }
  return { data: data as MarketConfigRow, errorCode: null, errorMessage: null };
}

export interface CreateMarketConfigResult {
  data: MarketConfigRow | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Create new resource; returns row, error code, error message for HTTP mapping.
 */
export async function createMarketConfigWithError(
  values: NewMarketConfig,
): Promise<CreateMarketConfigResult> {
  const supabase = createServiceRoleClient();
  if (!supabase) return { data: null, errorCode: null, errorMessage: 'Database not configured' };
  const { data, error } = await supabase
    .from('game_config_market')
    .insert({
      resource_id: values.resource_id,
      base_price: values.base_price,
      sector: values.sector,
      elasticity: values.elasticity,
      is_tradable: values.is_tradable,
    })
    .select('resource_id, base_price, sector, elasticity, is_tradable')
    .single();
  if (error || !data) {
    return {
      data: null,
      errorCode: error?.code ?? 'UNKNOWN',
      errorMessage: error?.message ?? 'Insert failed',
    };
  }
  return { data: data as MarketConfigRow, errorCode: null, errorMessage: null };
}
