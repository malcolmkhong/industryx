/**
 * playerProgress.ts — Centralized DB access for the `player_progress` table.
 *
 * Iteration 8. Read-only access for admin player search and display.
 * Writes (updateDisplayName etc.) intentionally not exposed here yet —
 * the live update path lives in `auth/admin.ts` via profile sync.
 *
 * Pattern follows the rest of src/lib/db/*: thin wrappers around
 * `createServiceRoleClient()` that return plain objects (no Supabase types).
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

export interface PlayerProgressRow {
  user_id: string;
  display_name: string | null;
  // Other columns are intentionally not exposed unless needed.
}

export async function searchPlayerProgressByDisplayName(
  displayName: string,
  limit: number,
): Promise<string[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('player_progress')
    .select('user_id')
    .ilike('display_name', `%${displayName.toLowerCase()}%`)
    .limit(limit);
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

export async function listPlayerProgressByIds(
  userIds: string[],
): Promise<PlayerProgressRow[]> {
  if (userIds.length === 0) return [];
  const supabase = createServiceRoleClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from('player_progress')
    .select('user_id, display_name')
    .in('user_id', userIds);
  return (data ?? []) as PlayerProgressRow[];
}