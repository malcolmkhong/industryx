/**
 * playerProgress.ts — Centralized DB access for the `player_progress` table.
 *
 * Iteration 8. Read-only access for admin player search and display.
 * Iteration 9c added `upsertPlayerProgress` for the migrate-guest flow
 * (initial cloud save after guest-to-OAuth migration).
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

/**
 * Get a single player's progress by user_id.
 * Returns the full row or null if not found.
 */
export async function getPlayerProgressByUserId(
  userId: string,
): Promise<PlayerProgressRow | null> {
  const rows = await listPlayerProgressByIds([userId]);
  return rows[0] ?? null;
}

/**
 * Upsert a player_progress row. Used by /api/auth/guest/migrate to
 * persist the initial display_name + game_state snapshot after a guest
 * migrates to OAuth.
 *
 * Returns true on success, false on error. Callers should log + continue
 * (player_progress is a backwards-compat mirror of server_game_state; a
 * failure here does not block the migration).
 */
export async function upsertPlayerProgress(
  userId: string,
  values: {
    display_name?: string | null;
    game_state?: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from('player_progress')
    .upsert(
      { user_id: userId, ...values },
      { onConflict: 'user_id' },
    );
  if (error) {
    console.error('[playerProgress] upsert failed:', error.message);
    return false;
  }
  return true;
}