// ============================================================================
// IndustriaX: Leaderboard API — GET global rankings
// Fetches top entries from Supabase leaderboard table
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface LeaderboardRow {
  id: string;
  user_id: string;
  corporation_name: string;
  score: number;
  total_money_earned: number;
  buildings_built: number;
  research_completed: number;
  contracts_completed: number;
  prestige_count: number;
  play_time_ticks: number;
  rank_name: string | null;
  game_tick: number;
  created_at: string;
  rank: number;
}

interface UserRankRow {
  best_score: number;
  best_rank: number;
  total_runs: number;
}

export async function GET(request: Request) {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const userId = searchParams.get('userId') || undefined;

    // Fetch top leaderboard entries using the stored function
    const { data: entries, error: entriesError } = await supabase
      .rpc('get_leaderboard', { p_limit: limit, p_user_id: userId || null });

    if (entriesError) {
      console.error('[Leaderboard] Failed to fetch entries:', entriesError.message);
      return NextResponse.json(
        { error: 'Failed to fetch leaderboard' },
        { status: 500 },
      );
    }

    // Fetch user's rank if authenticated
    let userRank: UserRankRow | null = null;
    if (userId) {
      const { data: rankData, error: rankError } = await supabase
        .rpc('get_user_rank', { p_user_id: userId });

      if (!rankError && rankData && rankData.length > 0) {
        userRank = rankData[0] as UserRankRow;
      }
    }

    // Format entries for the frontend
    const formattedEntries: LeaderboardRow[] = (entries || []).map(
      (entry: Record<string, unknown>, index: number) => ({
        id: entry.id as string,
        user_id: entry.user_id as string,
        corporation_name: (entry.corporation_name as string) || 'Unknown Corp',
        score: Number(entry.score) || 0,
        total_money_earned: Number(entry.total_money_earned) || 0,
        buildings_built: Number(entry.buildings_built) || 0,
        research_completed: Number(entry.research_completed) || 0,
        contracts_completed: Number(entry.contracts_completed) || 0,
        prestige_count: Number(entry.prestige_count) || 0,
        play_time_ticks: Number(entry.play_time_ticks) || 0,
        rank_name: (entry.rank_name as string) || null,
        game_tick: Number(entry.game_tick) || 0,
        created_at: entry.created_at as string,
        rank: Number(entry.rank) || index + 1,
      }),
    );

    return NextResponse.json({
      entries: formattedEntries,
      userRank: userRank ? {
        bestScore: userRank.best_score,
        bestRank: userRank.best_rank,
        totalRuns: userRank.total_runs,
      } : null,
    });
  } catch (err) {
    console.error('[Leaderboard] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
