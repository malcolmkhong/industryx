// ============================================================================
// IndustriaX: Leaderboard Submit API — POST score on prestige
// Server-validated score submission with cheat detection
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { validateGameState } from '@/lib/auth/gameStateValidator';
import { logActionAsync } from '@/lib/auth/gameStateValidator';
import { getUserGuestStatus } from '@/lib/auth/guestCheck';
import { loadServerGameStateForLeaderboard } from '@/lib/db/serverGameState';
import { submitScore, getUserRank, getRecentSubmissionsByUser } from '@/lib/db/leaderboard';

export const dynamic = 'force-dynamic';

interface SubmitPayload {
  corporationName?: string;
  score: number;
  totalMoneyEarned: number;
  buildingsBuilt: number;
  researchCompleted: number;
  contractsCompleted: number;
  prestigeCount: number;
  playTimeTicks: number;
  rankName?: string;
  gameTick: number;
  // Include minimal game state for validation
  gameState: Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 },
      );
    }

    // ── Auth check ──
    // Get the authorization header to verify the user
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the user's token with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication' },
        { status: 401 },
      );
    }

    const userId = user.id;

    const guestStatus = await getUserGuestStatus(userId);
    if (guestStatus.isGuest) {
      return NextResponse.json(
        { error: 'Bind Account to submit leaderboard scores', code: 'GUEST_GATED' },
        { status: 403 }
      );
    }

    // ── Phase 2.6: Fetch server-authoritative game state ──
    const serverState = await loadServerGameStateForLeaderboard(userId);
    if (!serverState) {
      return NextResponse.json(
        { error: 'No authoritative server state found', code: 'NO_SERVER_STATE' },
        { status: 404 },
      );
    }

    if (serverState.is_locked) {
      return NextResponse.json(
        { error: serverState.lock_reason ?? 'Account locked', code: 'ACCOUNT_LOCKED' },
        { status: 403 },
      );
    }

    // ── Parse payload ──
    const body: SubmitPayload = await request.json();
    const {
      corporationName,
      score,
      totalMoneyEarned,
      buildingsBuilt,
      researchCompleted,
      contractsCompleted,
      prestigeCount,
      playTimeTicks,
      rankName,
      gameTick,
      gameState,
    } = body;

    // ── Validate required fields ──
    if (typeof score !== 'number' || score < 0) {
      return NextResponse.json(
        { error: 'Invalid score' },
        { status: 400 },
      );
    }

    if (typeof gameTick !== 'number' || gameTick < 0) {
      return NextResponse.json(
        { error: 'Invalid game tick' },
        { status: 400 },
      );
    }

    // ── Server-side score validation ──
    // Recalculate score from game state to prevent client-side manipulation
    const calculatedScore = Math.floor(
      // Phase 2.6: Use server-authoritative values, not client-sent
      Number(serverState.total_money_earned || 0) +
      Number((gameState.buildings as unknown[])?.length || 0) * 100 +
      Number((gameState.completedResearch as string[])?.length || 0) * 200 +
      Number((gameState.stats as Record<string, unknown>)?.contractsCompleted || 0) * 50 +
      Number((gameState.prestigeState as Record<string, unknown>)?.totalPrestiges || 0) * 500
    );

    // Allow 10% tolerance for timing differences (e.g., ticks between submit and calc)
    if (Math.abs(score - calculatedScore) > calculatedScore * 0.1 + 1000) {
      console.warn(`[Leaderboard] Score mismatch for user ${userId}: submitted=${score}, calculated=${calculatedScore}`);

      // Log potential cheat
      logActionAsync({
        userId,
        actionType: 'prestige',
        payload: { submittedScore: score, calculatedScore, mismatch: true },
        // Phase 2.6: Use server-authoritative values, not client-sent
        gameTick: serverState.game_tick,
        moneyAfter: serverState.money,
        isValid: false,
        validationRisk: 'high',
        rejectionReason: 'Score mismatch between submitted and calculated values',
      });

      return NextResponse.json(
        { error: 'Score validation failed', calculatedScore },
        { status: 400 },
      );
    }

    // ── Validate game state integrity ──
    const validation = validateGameState(gameState, undefined, { skipDeltaChecks: true });
    if (validation.riskLevel === 'critical') {
      console.warn(`[Leaderboard] Critical validation failure for user ${userId}:`, validation.violations);

      return NextResponse.json(
        { error: 'Game state validation failed', violations: validation.violations },
        { status: 400 },
      );
    }

    // ── Rate limit: max 1 submission per minute per user ──
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    let recentSubmissions: { id: string; created_at: string }[] = [];
    try {
      recentSubmissions = await getRecentSubmissionsByUser(userId, oneMinuteAgo, 1);
    } catch (rlErr) {
      console.error('[Leaderboard] Rate limit check failed:', rlErr instanceof Error ? rlErr.message : rlErr);
      // Fail open — don't block submissions if we can't check
    }
    if (recentSubmissions.length > 0) {
      return NextResponse.json(
        { error: 'Please wait before submitting another score' },
        { status: 429 },
      );
    }

    // ── Insert leaderboard entry ──
    const newEntry = await submitScore({
      user_id: userId,
      corporation_name: corporationName || user.user_metadata?.full_name || 'Unknown Corp',
      score: calculatedScore, // Use server-calculated score (authoritative)
      // Phase 2.6: Use server-authoritative values, not client-sent
      total_money_earned: serverState.total_money_earned,
      buildings_built: buildingsBuilt,
      research_completed: researchCompleted,
      contracts_completed: contractsCompleted,
      prestige_count: prestigeCount,
      play_time_ticks: playTimeTicks,
      rank_name: rankName || null,
      // Phase 2.6: Use server-authoritative values, not client-sent
      game_tick: serverState.game_tick,
    });

    if (!newEntry) {
      console.error('[Leaderboard] Insert returned no row');
      return NextResponse.json(
        { error: 'Failed to submit score' },
        { status: 500 },
      );
    }

    // ── Get user's rank after submission ──
    const userRank = await getUserRank(userId);

    // ── Audit log ──
    logActionAsync({
      userId,
      actionType: 'prestige',
      payload: {
        leaderboardId: newEntry?.id,
        score: calculatedScore,
        submittedScore: score,
        // Phase 2.6: Use server-authoritative values, not client-sent
        gameTick: serverState.game_tick,
      },
      // Phase 2.6: Use server-authoritative values, not client-sent
      gameTick: serverState.game_tick,
      moneyAfter: serverState.money,
      isValid: true,
      validationRisk: validation.riskLevel,
    });

    return NextResponse.json({
      success: true,
      entry: {
        id: newEntry?.id,
        score: calculatedScore,
        createdAt: newEntry?.created_at,
      },
      rank: userRank ? {
        bestScore: userRank.best_score,
        bestRank: userRank.best_rank,
        totalRuns: userRank.total_runs,
      } : null,
    });
  } catch (err) {
    console.error('[Leaderboard Submit] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
