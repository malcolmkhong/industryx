/**
 * playerActions.ts — Centralized DB access for the `player_actions` table.
 *
 * Iteration 8. Read-only counts for admin economy dashboard.
 */

import { createServiceRoleClient } from '@/lib/db/access';;

export async function countActionsSince(sinceISO: string): Promise<number> {
  const supabase = createServiceRoleClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from('player_actions')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceISO);
  return count ?? 0;
}

export async function countInvalidActionsSince(sinceISO: string): Promise<number> {
  const supabase = createServiceRoleClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from('player_actions')
    .select('id', { count: 'exact', head: true })
    .eq('is_valid', false)
    .gte('created_at', sinceISO);
  return count ?? 0;
}

export async function countOnlinePlayers(): Promise<number> {
  const supabase = createServiceRoleClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from('player_sessions')
    .select('user_id', { count: 'exact', head: true })
    .eq('is_online', true);
  return count ?? 0;
}// ============================================
// Iteration 8 — actions list + audit export helpers
// ============================================

export interface ListPlayerActionsFilters {
  userId?: string;
  actionType?: string;
  isValid?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface ListPlayerActionsResult {
  actions: Record<string, unknown>[];
  total: number;
}

/**
 * Filtered, paginated player-actions query for admin actions log.
 * Used by /api/admin/audit/player-actions.
 */
export async function listPlayerActionsWithFilters(
  page: number,
  limit: number,
  filters: ListPlayerActionsFilters,
): Promise<ListPlayerActionsResult> {
  const supabase = createServiceRoleClient();
  if (!supabase) return { actions: [], total: 0 };

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('player_actions')
    .select('*', { count: 'exact' })
    .range(from, to)
    .order('created_at', { ascending: false });

  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.actionType) query = query.eq('action_type', filters.actionType);
  if (typeof filters.isValid === 'boolean') query = query.eq('is_valid', filters.isValid);
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);

  const { data, count, error } = await query;
  if (error) {
    console.error('[PlayerActions] Error listing actions (filtered):', error.message);
    return { actions: [], total: 0 };
  }
  return { actions: (data ?? []) as Record<string, unknown>[], total: count ?? 0 };
}

export interface ListAdminActionsForExportFilters {
  dateFrom?: string;
  dateTo?: string;
}

export async function listAdminActionsForExport(
  filters: ListAdminActionsForExportFilters,
): Promise<Record<string, unknown>[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];
  let query = supabase
    .from('admin_actions')
    .select('admin_user_id, target_user_id, action_type, details, created_at')
    .order('created_at', { ascending: false });
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);
  const { data, error } = await query;
  if (error) {
    console.error('[AdminActions] Error listing for export:', error.message);
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
}
