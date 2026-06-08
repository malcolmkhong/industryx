// ============================================
// IndustriaX: Player Progress API
// GET/POST endpoint for cloud save
// WITH AUTHENTICATION + RATE LIMITING + VALIDATION + AUDIT
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAuthAndOwnership } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import { validateGameState, logActionAsync, extractClientInfo } from '@/lib/auth/gameStateValidator';

// GET /api/player?userId=xxx - Load player progress
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  // ✅ Auth check: Verify the requesting user owns this data
  const auth = await verifyAuthAndOwnership(userId);
  if (!auth.success) return auth.response;

  // ✅ Rate limit check
  const rateLimitResponse = checkRateLimit(auth.userId, RATE_LIMITS.player, '/api/player');
  if (rateLimitResponse) return rateLimitResponse;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('player_progress')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found - new player
      return NextResponse.json({ data: null, isNew: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ✅ Audit log the load
  const clientInfo = extractClientInfo(request);
  logActionAsync({
    userId: auth.userId,
    actionType: 'load',
    payload: { source: 'cloud' },
    gameTick: data.game_tick || 0,
    moneyBefore: 0,
    moneyAfter: data.money || 0,
    isValid: true,
    ...clientInfo,
  });

  return NextResponse.json({ data, isNew: false });
}

// POST /api/player - Save player progress
export async function POST(request: Request) {
  let body: { userId?: string; gameState?: Record<string, unknown>; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, gameState, displayName } = body;

  if (!userId || !gameState) {
    return NextResponse.json({ error: 'userId and gameState are required' }, { status: 400 });
  }

  // ✅ Auth check: Verify the requesting user owns this data
  const auth = await verifyAuthAndOwnership(userId);
  if (!auth.success) return auth.response;

  // ✅ Rate limit check
  const rateLimitResponse = checkRateLimit(auth.userId, RATE_LIMITS.player, '/api/player');
  if (rateLimitResponse) return rateLimitResponse;

  // ✅ Validate game state (cheat detection)
  const validation = validateGameState(gameState);
  if (!validation.isValid) {
    console.warn(`[PlayerAPI] Game state validation FAILED for ${auth.userId}:`, validation.violations);
  }

  // For critical violations, reject the save
  if (validation.riskLevel === 'critical') {
    // ✅ Audit log the rejected save
    const clientInfo = extractClientInfo(request);
    logActionAsync({
      userId: auth.userId,
      actionType: 'save',
      payload: { violations: validation.violations, riskLevel: validation.riskLevel },
      gameTick: Number(gameState.gameTick) || 0,
      moneyBefore: 0,
      moneyAfter: Number(gameState.money) || 0,
      checksum: validation.checksum,
      isValid: false,
      rejectionReason: `Critical violation: ${validation.violations.join('; ')}`,
      ...clientInfo,
    });

    return NextResponse.json(
      {
        error: 'Game state validation failed — save rejected',
        code: 'VALIDATION_FAILED',
        violations: validation.violations,
      },
      { status: 400 },
    );
  }

  // For high-risk violations, still save but flag it
  if (validation.riskLevel === 'high') {
    console.warn(`[PlayerAPI] HIGH RISK save from ${auth.userId}: ${validation.violations.join('; ')}`);
    // Save continues but will be logged with the flag
  }

  const supabase = createServiceRoleClient();

  // Upsert: insert if not exists, update if exists
  const { data, error } = await supabase
    .from('player_progress')
    .upsert({
      user_id: userId,
      display_name: displayName || 'Commander',
      game_state: gameState,
      last_saved_at: new Date().toISOString(),
      total_money_earned: (gameState as Record<string, unknown>).totalMoneyEarned as number || 0,
      game_tick: (gameState as Record<string, unknown>).gameTick as number || 0,
      buildings_count: ((gameState as Record<string, unknown>).buildings as unknown[])?.length || 0,
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ✅ Audit log the save
  const clientInfo = extractClientInfo(request);
  logActionAsync({
    userId: auth.userId,
    actionType: 'save',
    payload: {
      buildingsCount: ((gameState as Record<string, unknown>).buildings as unknown[])?.length || 0,
      riskLevel: validation.riskLevel,
      violations: validation.violations.length > 0 ? validation.violations : undefined,
    },
    gameTick: Number(gameState.gameTick) || 0,
    moneyBefore: 0,
    moneyAfter: Number(gameState.money) || 0,
    checksum: validation.checksum,
    isValid: validation.isValid,
    rejectionReason: validation.isValid ? undefined : `Violations: ${validation.violations.join('; ')}`,
    ...clientInfo,
  });

  return NextResponse.json({
    data,
    saved: true,
    validation: {
      isValid: validation.isValid,
      riskLevel: validation.riskLevel,
      checksum: validation.checksum,
      ...(validation.violations.length > 0 ? { violations: validation.violations } : {}),
    },
  });
}
