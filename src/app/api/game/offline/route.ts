// ============================================
// IndustriaX: Offline Progress API
// GET endpoint that computes how many ticks
// the player should have earned while offline
// LEAN MVP — uses server_game_state (source of truth)
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';

// Game tick interval: 1 tick per second at 1x speed
const TICK_INTERVAL_MS = 1000;

// Maximum offline ticks to compute (cap at ~24 hours)
const MAX_OFFLINE_TICKS = 86400;

// ─── Main GET Handler ──────────────────────────────────────────────────

export async function GET(request: Request) {
  // ✅ Auth check
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  // ✅ Rate limit
  const rateLimitResponse = checkRateLimit(auth.userId, RATE_LIMITS.compute, '/api/game/offline');
  if (rateLimitResponse) return rateLimitResponse;

  const supabase = createServiceRoleClient();

  // Get player's last save from server_game_state (source of truth)
  const { data: sgs, error: sgsError } = await supabase
    .from('server_game_state')
    .select('full_state, last_saved_at, game_tick, game_speed')
    .eq('user_id', auth.userId)
    .single();

  if (sgsError || !sgs) {
    // Fallback to player_progress (backwards compat)
    const { data: pp, error: ppError } = await supabase
      .from('player_progress')
      .select('game_state')
      .eq('user_id', auth.userId)
      .single();

    if (ppError || !pp?.game_state) {
      return NextResponse.json({
        offlineTicks: 0,
        message: 'No previous save found',
      });
    }

    const gameState = pp.game_state as Record<string, unknown>;
    const gameSpeed = Number(gameState.gameSpeed) || 1;
    const lastGameTick = Number(gameState.gameTick) || 0;

    return NextResponse.json({
      offlineTicks: 0,
      lastSavedAt: null,
      elapsedMs: 0,
      expectedTick: lastGameTick,
      serverGameTick: 0,
      maxOfflineTicks: MAX_OFFLINE_TICKS,
      computeUrl: '/api/game/compute',
    });
  }

  const gameState = sgs.full_state as Record<string, unknown> | null;
  if (!gameState) {
    return NextResponse.json({
      offlineTicks: 0,
      message: 'No game state found',
    });
  }

  // Calculate time elapsed since last save
  const lastSavedAt = new Date(sgs.last_saved_at).getTime();
  const now = Date.now();
  const elapsedMs = Math.max(0, now - lastSavedAt);

  // Calculate offline ticks based on elapsed time
  // Account for game speed from saved state
  const gameSpeed = sgs.game_speed || Number(gameState.gameSpeed) || 1;
  const offlineTicks = Math.min(
    MAX_OFFLINE_TICKS,
    Math.floor((elapsedMs / TICK_INTERVAL_MS) * gameSpeed),
  );

  // Current tick from save
  const lastGameTick = sgs.game_tick || Number(gameState.gameTick) || 0;
  const expectedTick = lastGameTick + offlineTicks;

  return NextResponse.json({
    offlineTicks,
    lastSavedAt: sgs.last_saved_at,
    elapsedMs,
    expectedTick,
    serverGameTick: sgs.game_tick || 0,
    maxOfflineTicks: MAX_OFFLINE_TICKS,
    // Client should use /api/game/compute to actually run the ticks
    computeUrl: '/api/game/compute',
  });
}
