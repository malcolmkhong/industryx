// ============================================
// IndustriaX: Game Heartbeat API
// POST endpoint for session tracking and
// server-side tick verification
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

  // Upsert session
  const { error: sessionError } = await supabase
    .from('player_sessions')
    .upsert({
      user_id: auth.userId,
      is_online: true,
      last_heartbeat_at: now,
      disconnected_at: null,
      client_ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      user_agent: request.headers.get('user-agent') || null,
    }, { onConflict: 'user_id' });

  if (sessionError) {
    console.warn('[Heartbeat] Session upsert failed:', sessionError.message);
  }

  // Update server-side tick tracking in player_progress
  const { error: progressError } = await supabase
    .from('player_progress')
    .update({
      last_server_tick_at: now,
      server_game_tick: gameTick || 0,
    })
    .eq('user_id', auth.userId);

  if (progressError) {
    console.warn('[Heartbeat] Progress update failed:', progressError.message);
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
