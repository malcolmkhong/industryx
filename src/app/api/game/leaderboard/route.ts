// ============================================================================
// IndustriaX: Leaderboard API — GET global rankings
// Fetches top entries from Supabase leaderboard table
// ============================================================================

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { getUserGuestStatus } from '@/lib/auth/guestCheck';
import { getLeaderboard, getUserRank } from '@/lib/db/game/leaderboard';

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
    const auth = await verifyAuth();
    if (!auth.success) return auth.response;

    const guestStatus = await getUserGuestStatus(auth.userId);
    if (guestStatus.isGuest) {
      return NextResponse.json(
        { error: 'Bind Account to access the leaderboard', code: 'GUEST_GATED' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
        // Fail-closed per [SEC-011]: parseInt of bad input returns NaN;
        // Math.min(NaN, 100) === NaN. Use `|| 50` to clamp to a sane default.
        const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100);
        const userId = searchParams.get('userId') || undefined;

    // Fetch top leaderboard entries
    const entries = await getLeaderboard(limit);

    // Fetch user's rank if authenticated
    let userRank: UserRankRow | null = null;
    if (userId) {
      userRank = await getUserRank(userId);
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
              // RPC get_leaderboard returns rank_name as text (nullable).
              rank_name: (entry.rank_name as string | null) ?? null,
              game_tick: Number(entry.game_tick) || 0,
              created_at: entry.created_at as string,
              // RPC returns `rank` as a computed ROW_NUMBER. If RPC is bypassed and
              // a plain table read is used (no rank column), fall back to index+1.
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
