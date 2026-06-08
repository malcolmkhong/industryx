// ============================================
// IndustriaX: Offline Progress API
// GET endpoint that computes how many ticks
// the player should have earned while offline
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

  // Get player's last save
  const { data: player, error: playerError } = await supabase
    .from('player_progress')
    .select('game_state, last_saved_at, server_game_tick')
    .eq('user_id', auth.userId)
    .single();

  if (playerError || !player) {
    return NextResponse.json({
      offlineTicks: 0,
      message: 'No previous save found',
    });
  }

  const gameState = player.game_state as Record<string, unknown> | null;
  if (!gameState) {
    return NextResponse.json({
      offlineTicks: 0,
      message: 'No game state found',
    });
  }

  // Calculate time elapsed since last save
  const lastSavedAt = new Date(player.last_saved_at).getTime();
  const now = Date.now();
  const elapsedMs = Math.max(0, now - lastSavedAt);

  // Calculate offline ticks based on elapsed time
  // Account for game speed from saved state
  const gameSpeed = Number(gameState.gameSpeed) || 1;
  const offlineTicks = Math.min(
    MAX_OFFLINE_TICKS,
    Math.floor((elapsedMs / TICK_INTERVAL_MS) * gameSpeed),
  );

  // Current tick from save
  const lastGameTick = Number(gameState.gameTick) || 0;
  const expectedTick = lastGameTick + offlineTicks;

  return NextResponse.json({
    offlineTicks,
    lastSavedAt: player.last_saved_at,
    elapsedMs,
    expectedTick,
    serverGameTick: player.server_game_tick || 0,
    maxOfflineTicks: MAX_OFFLINE_TICKS,
    // Client should use /api/game/compute to actually run the ticks
    computeUrl: '/api/game/compute',
  });
}
