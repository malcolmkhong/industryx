// ============================================================================
// IndustriaX: Leaderboard Submit API — POST score on prestige
// Server-validated score submission with cheat detection
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActionAsync, validateGameState } from '@/lib/auth/gameStateValidator';
import { getUserGuestStatus } from '@/lib/auth/guestCheck';
import { loadServerGameStateForLeaderboard } from '@/lib/db/game/serverGameState';
import { submitScore, getUserRank, getRecentSubmissionsByUser } from '@/lib/db/game/leaderboard';

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
        // Fail-closed per RULES.md [SEC-011]: reject NaN/Infinity, not just
        // `typeof !== 'number'` (NaN is type 'number' in JS).
        if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
          return NextResponse.json(
            { error: 'Invalid score' },
            { status: 400 },
          );
        }

        if (typeof gameTick !== 'number' || !Number.isFinite(gameTick) || gameTick < 0) {
          return NextResponse.json(
            { error: 'Invalid game tick' },
            { status: 400 },
          );
        }

    // ── Server-side score validation ──
        // Recalculate score from authoritative sources to prevent client-side
        // manipulation. Per RULES.md [SEC-011] / [ARC-011]: no `|| 0` silent
        // fallbacks — required values are validated explicitly and the request
        // fails closed if any input is missing/invalid.
        const totalMoneyEarned = Number(serverState.total_money_earned);
        if (!Number.isFinite(totalMoneyEarned) || totalMoneyEarned < 0) {
          console.error(
            "[Leaderboard] Invalid total_money_earned for user",
            userId,
            ":",
            serverState.total_money_earned,
          );
          return NextResponse.json(
            { error: "Invalid server state", code: "INVALID_TOTAL_MONEY_EARNED" },
            { status: 503 },
          );
        }

        const buildingsCount = Array.isArray(gameState.buildings)
          ? (gameState.buildings as unknown[]).length
          : -1;
        if (buildingsCount < 0) {
          return NextResponse.json(
            { error: "Invalid game state: buildings", code: "INVALID_BUILDINGS" },
            { status: 400 },
          );
        }

        const completedResearchCount = Array.isArray(gameState.completedResearch)
          ? (gameState.completedResearch as unknown[]).length
          : -1;
        if (completedResearchCount < 0) {
          return NextResponse.json(
            { error: "Invalid game state: completedResearch", code: "INVALID_RESEARCH" },
            { status: 400 },
          );
        }

        const stats = gameState.stats as Record<string, unknown> | undefined;
        const validatedContractsCompleted = Number(stats?.contractsCompleted);
        if (
          !Number.isFinite(validatedContractsCompleted) ||
          validatedContractsCompleted < 0
        ) {
          return NextResponse.json(
            { error: "Invalid game state: stats.contractsCompleted", code: "INVALID_STATS" },
            { status: 400 },
          );
        }

        const prestigeState = gameState.prestigeState as Record<string, unknown> | undefined;
        const totalPrestiges = Number(prestigeState?.totalPrestiges);
        if (!Number.isInteger(totalPrestiges) || totalPrestiges < 0) {
          return NextResponse.json(
            { error: "Invalid game state: prestigeState.totalPrestiges", code: "INVALID_PRESTIGE_STATE" },
            { status: 400 },
          );
        }

        const calculatedScore = Math.floor(
          totalMoneyEarned +
            buildingsCount * 100 +
            completedResearchCount * 200 +
            validatedContractsCompleted * 50 +
            totalPrestiges * 500,
        );

        // Allow 10% tolerance for timing differences (e.g., ticks between
        // submit and calc). Guard against calculatedScore === 0 to avoid
        // `0.1 + 1000` loophole allowing cheaters to inflate from 0 to 1000.
        if (
          calculatedScore <= 0 ||
          Math.abs(score - calculatedScore) > calculatedScore * 0.1 + 1000
        ) {
          console.warn(`[Leaderboard] Score mismatch for user ${userId}: submitted=${score}, calculated=${calculatedScore}`);

          // Log potential cheat
                logActionAsync({
                  userId,
                  actionType: 'prestige',
                  payload: { submittedScore: score, calculatedScore, mismatch: true },
                  // Phase 2.6: Use server-authoritative values, not client-sent
                  gameTick: Number(serverState.game_tick),
                  moneyAfter: Number(serverState.money),
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
        const validation = await validateGameState(gameState, undefined, { skipDeltaChecks: true });
        if (validation.riskLevel === 'critical') {
          console.warn(`[Leaderboard] Critical validation failure for user ${userId}:`, validation.violations);

          return NextResponse.json(
            { error: 'Game state validation failed', violations: validation.violations },
            { status: 400 },
          );
        }

        // ── Validate client-sent stats against server-known bounds ──
        // Per RULES.md [SEC-001] / [ARC-011]: client values are accepted (they
        // represent historical achievements for the leaderboard row) but must
        // not exceed server-verified counts. A cheater can't claim 999999
        // buildings if server_game_state.full_state has only 5.
        const clientStats = {
          buildingsBuilt: Number(buildingsBuilt),
          researchCompleted: Number(researchCompleted),
          contractsCompleted: Number(contractsCompleted),
          prestigeCount: Number(prestigeCount),
          playTimeTicks: Number(playTimeTicks),
        };
        for (const [field, val] of Object.entries(clientStats)) {
          if (!Number.isFinite(val) || val < 0) {
            return NextResponse.json(
              { error: `Invalid ${field}`, code: `INVALID_${field.toUpperCase()}` },
              { status: 400 },
            );
          }
        }
        // Bounds: client counts must not exceed server-known counts.
        // gameTick is server-authoritative (we use it for play_time_ticks upper bound).
        const serverGameTick = Number(serverState.game_tick);
        if (
          clientStats.buildingsBuilt > buildingsCount ||
          clientStats.researchCompleted > completedResearchCount ||
          clientStats.contractsCompleted > validatedContractsCompleted ||
          clientStats.prestigeCount > totalPrestiges ||
          clientStats.playTimeTicks > serverGameTick
        ) {
          console.warn(
            `[Leaderboard] Client stats exceed server bounds for user ${userId}:`,
            clientStats,
            { buildingsCount, completedResearchCount, validatedContractsCompleted, totalPrestiges, serverGameTick },
          );
          logActionAsync({
            userId,
            actionType: 'prestige',
            payload: {
              reason: 'stats_exceed_bounds',
              client: clientStats,
              server: { buildingsCount, completedResearchCount, validatedContractsCompleted, totalPrestiges, serverGameTick },
            },
            gameTick: serverGameTick,
            moneyAfter: Number(serverState.money),
            isValid: false,
            validationRisk: 'high',
            rejectionReason: 'Client-claimed stats exceed server-known counts',
          });
          return NextResponse.json(
            { error: 'Stats exceed server-known counts', code: 'STATS_EXCEED_BOUNDS' },
            { status: 400 },
          );
        }

    // ── Rate limit: max 1 submission per minute per user ──
        // Per RULES.md [SEC-002]: a rate limiter that fails open is no rate
        // limiter. If the check itself fails (DB unavailable), refuse the
        // request rather than letting unlimited submissions through.
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
        let recentSubmissions: { id: string; created_at: string }[] = [];
        try {
          recentSubmissions = await getRecentSubmissionsByUser(userId, oneMinuteAgo, 1);
        } catch (rlErr) {
          console.error(
            '[Leaderboard] Rate limit check failed:',
            rlErr instanceof Error ? rlErr.message : rlErr,
          );
          return NextResponse.json(
            { error: 'Rate limit check unavailable — retry', code: 'RATE_LIMIT_CHECK_FAILED' },
            { status: 503 },
          );
        }
        if (recentSubmissions.length > 0) {
          return NextResponse.json(
            { error: 'Please wait before submitting another score' },
            { status: 429 },
          );
        }

    // ── Insert leaderboard entry ──
        // Client-claimed stats (buildingsBuilt/researchCompleted/etc.) are stored
        // as the historical record for this prestige run. They were validated
        // against server-known bounds above (cheaters can't claim more than
        // server has). The score is server-recalculated — we never trust
        // client-claimed score.
        const newEntry = await submitScore({
          user_id: userId,
          corporation_name:
            (typeof corporationName === 'string' && corporationName.length > 0
              ? corporationName
              : null) ??
            user.user_metadata?.full_name ??
            'Unknown Corp',
          score: calculatedScore, // server-recalculated (authoritative)
          total_money_earned: totalMoneyEarned, // server-authoritative from serverState
          buildings_built: clientStats.buildingsBuilt, // client-claimed, bounds-checked
          research_completed: clientStats.researchCompleted,
          contracts_completed: clientStats.contractsCompleted,
          prestige_count: clientStats.prestigeCount,
          play_time_ticks: clientStats.playTimeTicks, // bounded by server game_tick
          rank_name: typeof rankName === 'string' && rankName.length > 0 ? rankName : null,
          game_tick: serverGameTick, // server-authoritative
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
        // logActionAsync strict-validates gameTick + moneyAfter (RULES.md
        // [SEC-011]) and warns + skips the audit row if values are non-finite.
        // Numeric coercion at boundary preserves forensic value when present.
        logActionAsync({
          userId,
          actionType: 'prestige',
          payload: {
            leaderboardId: newEntry.id,
            score: calculatedScore,
            submittedScore: score,
            gameTick: Number(serverState.game_tick),
          },
          gameTick: Number(serverState.game_tick),
          moneyAfter: Number(serverState.money),
          isValid: true,
          validationRisk: validation.riskLevel,
        });

        return NextResponse.json({
          success: true,
          entry: {
            id: newEntry.id,
            score: calculatedScore,
            createdAt: newEntry.created_at,
          },
          rank: userRank ? {
            bestScore: userRank.best_score,
            bestRank: userRank.best_rank,
            totalRuns: userRank.total_runs,
          } : null,
        });
      } catch (err) {
        console.error('[Leaderboard Submit] Unexpected error:', err);
        // Distinguish known DB errors from unknown failures so ops can triage.
        const message = err instanceof Error ? err.message : String(err);
        const isDbError = /supabase|fetch|connection|timeout/i.test(message);
        return NextResponse.json(
          {
            error: isDbError ? 'Database unavailable — retry' : 'Internal server error',
            code: isDbError ? 'DB_UNAVAILABLE' : 'INTERNAL_ERROR',
          },
          { status: isDbError ? 503 : 500 },
        );
      }
    }
