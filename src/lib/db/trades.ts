/**
 * trades — Centralized access to the `trade_history` table.
 *
 * Iteration 3 of the Database Centralization migration (2026-06-20).
 * Migrated routes: /api/game/trade (insert), /api/game/trades (read).
 *
 * Conventions:
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 *   - All inserts are fire-and-forget at the caller level
 *     (errors surfaced via try/catch at the route level).
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/db/types';

type TradeHistoryRow = Database['public']['Tables']['trade_history']['Row'];
type TradeHistoryInsert = Database['public']['Tables']['trade_history']['Insert'];

/**
 * Shape for the trade_history insert in /api/game/trade POST.
 * All fields are required per the table schema.
 */
export interface RecordTradeParams {
  userId: string;
  giveResource: string;
  giveAmount: number;
  receiveResource: string;
  receiveAmount: number;
  commissionRate: number;
  gameTick: number;
  /** Optional: server state version at time of trade (used for analytics) */
  serverStateVersion?: number;
  /** Optional: market phase at time of trade */
  marketPhase?: string;
}

/**
 * Narrow shape returned for the GET /api/game/trades list response.
 * Only the columns the caller actually uses — avoids leaking internal fields.
 */
export interface TradeHistoryItem {
  id: string;
  giveResource: string;
  giveAmount: number;
  receiveResource: string;
  receiveAmount: number;
  commissionRate: number;
  serverValidated: boolean;
  marketPhase: string | null;
  tick: number;
  createdAt: string;
}

/** Result shape for paginated trade history with count */
export interface TradeHistoryResult {
  trades: TradeHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Insert a new trade history row.
 * Called after a successful trade in /api/game/trade POST.
 * Fire-and-forget at caller level; caller handles any error response.
 */
export async function recordTrade(params: RecordTradeParams): Promise<void> {
  const supabase = createServiceRoleClient();
  if (!supabase) return;

  const insert: TradeHistoryInsert = {
    user_id: params.userId,
    give_resource: params.giveResource,
    give_amount: params.giveAmount,
    receive_resource: params.receiveResource,
    receive_amount: params.receiveAmount,
    commission_rate: params.commissionRate,
    server_validated: true,
    game_tick: params.gameTick,
    server_state_version: params.serverStateVersion ?? null,
    market_phase: params.marketPhase ?? null,
  };

  const { error } = await supabase.from('trade_history').insert(insert);
  if (error) {
    // Re-throw so caller can handle/log appropriately.
    // Trade has already succeeded at this point — this is best-effort audit.
    console.error('[trades] Failed to record trade history:', error);
    throw error;
  }
}

/**
 * Fetch paginated trade history for a specific user.
 * Used by GET /api/game/trades.
 *
 * @param userId     - authenticated user
 * @param limit      - max rows to return (caller caps at 200)
 * @param offset     - pagination offset
 * @returns narrow TradeHistoryResult or null on DB unavailable
 */
export async function getTradeHistory(
  userId: string,
  limit: number,
  offset: number,
): Promise<TradeHistoryResult | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error, count } = await supabase
    .from('trade_history')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[trades] Failed to fetch trade history:', error);
    throw error; // Unexpected — caller returns 500
  }

  return {
    trades: (data as TradeHistoryRow[]).map((t): TradeHistoryItem => ({
      id: t.id,
      giveResource: t.give_resource,
      giveAmount: Number(t.give_amount),
      receiveResource: t.receive_resource,
      receiveAmount: Number(t.receive_amount),
      commissionRate: Number(t.commission_rate),
      serverValidated: t.server_validated,
      marketPhase: t.market_phase,
      tick: t.game_tick,
      createdAt: t.created_at,
    })),
    total: count ?? 0,
    limit,
    offset,
  };
}
