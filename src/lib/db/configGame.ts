/**
 * configGame.ts — Centralized DB access for the `game_config_game` table.
 *
 * Iteration 8. Read-only check used by system-status to verify DB connectivity
 * and that the game config row exists.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

export async function pingGameConfig(): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceRoleClient();
  if (!supabase) return { ok: false, error: 'Supabase service-role client not configured' };
  const { error } = await supabase.from('game_config_game').select('id').limit(1);
  return error ? { ok: false, error: error.message } : { ok: true };
}