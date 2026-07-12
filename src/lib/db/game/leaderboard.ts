import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/db/types';

type LeaderboardRow = Database['public']['Tables']['leaderboard']['Row'];
type LeaderboardInsert = Database['public']['Tables']['leaderboard']['Insert'];

/**
 * Submit a new score to the leaderboard
 */
export async function submitScore(entry: LeaderboardInsert): Promise<LeaderboardRow | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('leaderboard')
    .insert(entry)
    .select()
    .single();

  if (error) {
    console.error('[Leaderboard] Failed to submit score:', error);
    return null;
  }

  return data;
}

/**
 * Get the global leaderboard with optional limit
 */
export async function getLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Leaderboard] Failed to fetch leaderboard:', error);
    return [];
  }

  return data || [];
}

/**
 * Get a specific user's rank and best score
 */
export async function getUserRank(userId: string): Promise<{ best_score: number; best_rank: number; total_runs: number } | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  // Using the existing RPC function that's already being called in the route
  const { data, error } = await supabase
    .rpc('get_user_rank', { p_user_id: userId });

  if (error) {
    console.error('[Leaderboard] Failed to get user rank:', error);
    return null;
  }

  if (!data || data.length === 0) return null;

  const rankData = data[0];
  return {
    best_score: rankData.best_score,
    best_rank: rankData.best_rank,
    total_runs: rankData.total_runs
  };
}

/**
 * Get a user's recent leaderboard submissions (for rate limiting).
 * Returns up to `limit` rows with created_at >= sinceISO.
 */
export async function getRecentSubmissionsByUser(
  userId: string,
  sinceISO: string,
  limit = 1
): Promise<Pick<LeaderboardRow, 'id' | 'created_at'>[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('leaderboard')
    .select('id, created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceISO)
    .limit(limit);

  if (error) {
    console.error('[Leaderboard] Rate-limit check failed:', error);
    // Fail open — surface error to caller for explicit handling
    throw error;
  }

  return data || [];
}