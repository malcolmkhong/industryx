// ============================================
// IndustriaX: Player Progress API
// GET/POST endpoint for cloud save
// SERVER-AUTHORITATIVE — LEAN MVP
// - player_progress is now a thin backwards-compat table
//   (user_id, display_name, game_state only)
// - server_game_state is the source of truth
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAuthAndOwnership } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import {
  validateGameState,
  logActionAsync,
  fetchPreviousServerState,
  isAccountLocked,
  flagCheatAttempt,
} from '@/lib/auth/gameStateValidator';

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

  // ✅ Check if account is locked
  const lockStatus = await isAccountLocked(auth.userId);
  if (lockStatus.locked) {
    return NextResponse.json(
      { error: 'Account is locked', code: 'ACCOUNT_LOCKED', reason: lockStatus.reason },
      { status: 403 },
    );
  }

  const supabase = createServiceRoleClient();

  // Try server_game_state first (authoritative), then fall back to player_progress
  const { data: sgs, error: sgsError } = await supabase
    .from('server_game_state')
    .select('full_state, money, game_tick, game_speed, state_hash, last_saved_at, state_version')
    .eq('user_id', userId)
    .single();

  if (sgs?.full_state) {
    // Audit log the load
    logActionAsync({
      userId: auth.userId,
      actionType: 'load',
      payload: { source: 'server_game_state' },
      gameTick: sgs.game_tick || 0,
      moneyAfter: sgs.money || 0,
      isValid: true,
      validationRisk: 'none',
    });

    return NextResponse.json({
      data: {
        game_state: sgs.full_state,
        game_tick: sgs.game_tick,
        money: sgs.money,
        last_saved_at: sgs.last_saved_at,
        state_hash: sgs.state_hash,
      },
      source: 'server_game_state',
      isNew: false,
    });
  }

  // Fallback to player_progress (backwards compat — only game_state available)
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

  // Extract values from game_state JSONB (columns no longer exist as separate fields)
  const gameState = data.game_state as Record<string, unknown> | null;

  // Audit log the load
  logActionAsync({
    userId: auth.userId,
    actionType: 'load',
    payload: { source: 'player_progress' },
    gameTick: Number(gameState?.gameTick) || 0,
    moneyAfter: Number(gameState?.money) || 0,
    isValid: true,
    validationRisk: 'none',
  });

  return NextResponse.json({ data, source: 'player_progress', isNew: false });
}

// POST /api/player - Save player progress (SERVER-AUTHORITATIVE)
export async function POST(request: Request) {
  let body: { userId?: string; gameState?: Record<string, unknown>; displayName?: string; clientChecksum?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, gameState, displayName, clientChecksum } = body;

  if (!userId || !gameState) {
    return NextResponse.json({ error: 'userId and gameState are required' }, { status: 400 });
  }

  // ✅ Auth check: Verify the requesting user owns this data
  const auth = await verifyAuthAndOwnership(userId);
  if (!auth.success) return auth.response;

  // ✅ Rate limit check
  const rateLimitResponse = checkRateLimit(auth.userId, RATE_LIMITS.player, '/api/player');
  if (rateLimitResponse) return rateLimitResponse;

  // ✅ Check if account is locked
  const lockStatus = await isAccountLocked(auth.userId);
  if (lockStatus.locked) {
    return NextResponse.json(
      { error: 'Account is locked', code: 'ACCOUNT_LOCKED', reason: lockStatus.reason },
      { status: 403 },
    );
  }

  // ✅ Fetch previous server state for delta validation
  const previousState = await fetchPreviousServerState(auth.userId);

  // ✅ Validate game state with delta checks
  const validation = validateGameState(gameState, previousState || undefined);
  if (!validation.isValid) {
    console.warn(`[PlayerAPI] Game state validation FAILED for ${auth.userId}:`, validation.violations);
  }

  // For critical OR high-risk violations, reject the save
  if (validation.riskLevel === 'critical' || validation.riskLevel === 'high') {
    // Flag the cheat attempt
    await flagCheatAttempt(
      auth.userId,
      validation.riskLevel === 'critical' ? 'state_tampering' : 'money_manipulation',
      `Save rejected: ${validation.violations.join('; ')}`,
      validation.riskLevel,
    );

    // Audit log the rejected save
    logActionAsync({
      userId: auth.userId,
      actionType: 'save',
      payload: { violations: validation.violations, riskLevel: validation.riskLevel },
      gameTick: Number(gameState.gameTick) || 0,
      moneyAfter: Number(gameState.money) || 0,
      checksum: validation.checksum,
      isValid: false,
      validationRisk: validation.riskLevel,
      rejectionReason: `${validation.riskLevel} violation: ${validation.violations.join('; ')}`,
    });

    return NextResponse.json(
      {
        error: 'Game state validation failed — save rejected',
        code: 'VALIDATION_FAILED',
        violations: validation.violations,
        riskLevel: validation.riskLevel,
      },
      { status: 400 },
    );
  }

  // Check client checksum against server-generated checksum
  if (clientChecksum && clientChecksum !== validation.checksum) {
    await flagCheatAttempt(
      auth.userId,
      'state_tampering',
      `Client checksum mismatch. Client: ${clientChecksum}, Server: ${validation.checksum}`,
      'high',
    );

    return NextResponse.json(
      { error: 'Checksum mismatch — possible state tampering', code: 'CHECKSUM_MISMATCH' },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();

  // Upsert to server_game_state (AUTHORITATIVE — source of truth)
  const buildingsCount = ((gameState as Record<string, unknown>).buildings as unknown[])?.length || 0;
  const { data: sgsData, error: sgsError } = await supabase
    .from('server_game_state')
    .upsert({
      user_id: userId,
      money: Number(gameState.money) || 0,
      total_money_earned: Number(gameState.totalMoneyEarned) || 0,
      research_points: Number(gameState.researchPoints) || 0,
      buildings: gameState.buildings,
      buildings_count: buildingsCount,
      completed_research: gameState.completedResearch,
      resources: gameState.resources,
      workers: gameState.workers,
      game_tick: Number(gameState.gameTick) || 0,
      game_speed: Number(gameState.gameSpeed) || 1,
      full_state: gameState,
      state_hash: validation.checksum,
      last_tick_at: new Date().toISOString(),
      last_saved_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (sgsError) {
    console.error('[PlayerAPI] server_game_state upsert error:', sgsError);
    return NextResponse.json({ error: 'Failed to save game state' }, { status: 500 });
  }

  // Sync to player_progress (backwards compat — thin: user_id, display_name, game_state only)
  const { data: ppData, error: ppError } = await supabase
    .from('player_progress')
    .upsert({
      user_id: userId,
      display_name: displayName || 'Commander',
      game_state: gameState,
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (ppError) {
    console.error('[PlayerAPI] player_progress upsert error:', ppError);
    // Don't fail the whole request — server_game_state is the source of truth
  }

  // Audit log the successful save
  logActionAsync({
    userId: auth.userId,
    actionType: 'save',
    payload: {
      buildingsCount,
      riskLevel: validation.riskLevel,
      violations: validation.violations.length > 0 ? validation.violations : undefined,
      savedTo: ppError ? 'server_game_state_only' : 'both',
    },
    gameTick: Number(gameState.gameTick) || 0,
    moneyAfter: Number(gameState.money) || 0,
    checksum: validation.checksum,
    isValid: validation.isValid,
    validationRisk: validation.riskLevel,
  });

  return NextResponse.json({
    data: ppData,
    saved: true,
    serverStateSaved: !sgsError,
    validation: {
      isValid: validation.isValid,
      riskLevel: validation.riskLevel,
      checksum: validation.checksum,
      ...(validation.violations.length > 0 ? { violations: validation.violations } : {}),
    },
  });
}
