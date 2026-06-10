// ============================================
// IndustriaX: Game Heartbeat API
// POST endpoint for session tracking
// LEAN MVP — no PII, no player_progress update
// (server_game_state is the source of truth for ticks)
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';

interface HeartbeatRequest {
  gameTick: number;
  money: number;
  paused: boolean;
  gameSpeed: number;
}

// ─── Main POST Handler ──────────────────────────────────────────────────

export async function POST(request: Request) {
  // ✅ Auth check
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  // ✅ Rate limit (heartbeats can be frequent — 60/min)
  const rateLimitResponse = checkRateLimit(auth.userId, RATE_LIMITS.general, '/api/game/heartbeat');
  if (rateLimitResponse) return rateLimitResponse;

  let body: HeartbeatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { gameTick, money, paused, gameSpeed } = body;
  const now = new Date().toISOString();

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable — database not configured' },
      { status: 503 }
    );
  }

  // Upsert session (lean: no session_token, no client_ip, no user_agent)
  const { error: sessionError } = await supabase
    .from('player_sessions')
    .upsert({
      user_id: auth.userId,
      is_online: true,
      last_heartbeat_at: now,
      disconnected_at: null,
    }, { onConflict: 'user_id' });

  if (sessionError) {
    console.warn('[Heartbeat] Session upsert failed:', sessionError.message);
  }

  // Update server_game_state tick tracking (source of truth)
  // Only update last_tick_at — game_tick/money are updated on full saves
  const { error: sgsError } = await supabase
    .from('server_game_state')
    .update({
      last_tick_at: now,
    })
    .eq('user_id', auth.userId);

  if (sgsError) {
    // Don't fail the heartbeat — server_game_state might not exist yet for new users
    console.warn('[Heartbeat] server_game_state update failed:', sgsError.message);
  }

  // Return server time for client sync
  return NextResponse.json({
    ok: true,
    serverTime: now,
    serverGameTick: gameTick || 0,
    // Server can override client speed if needed
    allowedSpeed: gameSpeed,
  });
}

// ─── DELETE Handler — Disconnect ────────────────────────────────────────

export async function DELETE(request: Request) {
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable — database not configured' },
      { status: 503 }
    );
  }

  // Mark session as offline
  await supabase
    .from('player_sessions')
    .update({
      is_online: false,
      disconnected_at: new Date().toISOString(),
    })
    .eq('user_id', auth.userId)
    .eq('is_online', true);

  return NextResponse.json({ ok: true, disconnected: true });
}
