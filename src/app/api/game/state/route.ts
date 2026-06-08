// ============================================
// IndustriaX: Server Game State API
// GET/POST endpoint for authoritative server state
// This is the SOURCE OF TRUTH for logged-in users
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAuthAndOwnership } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import {
  validateGameState,
  logActionAsync,
  extractClientInfo,
  isAccountLocked,
  flagCheatAttempt,
} from '@/lib/auth/gameStateValidator';

// GET /api/game/state?userId=xxx - Load authoritative server game state
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const auth = await verifyAuthAndOwnership(userId);
  if (!auth.success) return auth.response;

  const rateLimitResponse = checkRateLimit(auth.userId, RATE_LIMITS.player, '/api/game/state');
  if (rateLimitResponse) return rateLimitResponse;

  const lockStatus = await isAccountLocked(auth.userId);
  if (lockStatus.locked) {
    return NextResponse.json(
      { error: 'Account is locked', code: 'ACCOUNT_LOCKED', reason: lockStatus.reason },
      { status: 403 },
    );
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('server_game_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ data: null, isNew: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log
  const clientInfo = extractClientInfo(request);
  logActionAsync({
    userId: auth.userId,
    actionType: 'load',
    payload: { source: 'server_game_state' },
    gameTick: data.game_tick || 0,
    moneyBefore: 0,
    moneyAfter: data.money || 0,
    isValid: true,
    ...clientInfo,
  });

  return NextResponse.json({
    data: {
      fullState: data.full_state,
      money: data.money,
      totalMoneyEarned: data.total_money_earned,
      researchPoints: data.research_points,
      buildings: data.buildings,
      buildingsCount: data.buildings_count,
      completedResearch: data.completed_research,
      resources: data.resources,
      workers: data.workers,
      gameTick: data.game_tick,
      gameSpeed: data.game_speed,
      stateHash: data.state_hash,
      stateVersion: data.state_version,
      lastTickAt: data.last_tick_at,
      lastSavedAt: data.last_saved_at,
      cheatFlagCount: data.cheat_flag_count,
    },
    isNew: false,
  });
}

// POST /api/game/state - Sync game state to server (authoritative)
export async function POST(request: Request) {
  let body: {
    userId?: string;
    gameState?: Record<string, unknown>;
    clientChecksum?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, gameState, clientChecksum } = body;

  if (!userId || !gameState) {
    return NextResponse.json({ error: 'userId and gameState are required' }, { status: 400 });
  }

  const auth = await verifyAuthAndOwnership(userId);
  if (!auth.success) return auth.response;

  const rateLimitResponse = checkRateLimit(auth.userId, RATE_LIMITS.player, '/api/game/state');
  if (rateLimitResponse) return rateLimitResponse;

  // Check if account is locked
  const lockStatus = await isAccountLocked(auth.userId);
  if (lockStatus.locked) {
    return NextResponse.json(
      { error: 'Account is locked', code: 'ACCOUNT_LOCKED', reason: lockStatus.reason },
      { status: 403 },
    );
  }

  const supabase = createServiceRoleClient();

  // Fetch current server state for delta validation
  const { data: currentServerState } = await supabase
    .from('server_game_state')
    .select('full_state, state_hash, game_tick, cheat_flag_count')
    .eq('user_id', userId)
    .single();

  const previousState = currentServerState?.full_state as Record<string, unknown> | null;

  // Validate the incoming state
  const validation = validateGameState(gameState, previousState || undefined);

  if (validation.riskLevel === 'critical' || validation.riskLevel === 'high') {
    await flagCheatAttempt(
      auth.userId,
      validation.riskLevel === 'critical' ? 'state_tampering' : 'money_manipulation',
      `Server state sync rejected: ${validation.violations.join('; ')}`,
      validation.riskLevel,
    );

    const clientInfo = extractClientInfo(request);
    logActionAsync({
      userId: auth.userId,
      actionType: 'save',
      payload: { source: 'server_game_state', violations: validation.violations, riskLevel: validation.riskLevel },
      gameTick: Number(gameState.gameTick) || 0,
      moneyBefore: previousState ? Number(previousState.money) || 0 : 0,
      moneyAfter: Number(gameState.money) || 0,
      checksum: validation.checksum,
      isValid: false,
      rejectionReason: `${validation.riskLevel} violation: ${validation.violations.join('; ')}`,
      ...clientInfo,
    });

    return NextResponse.json(
      {
        error: 'Game state validation failed',
        code: 'VALIDATION_FAILED',
        violations: validation.violations,
        riskLevel: validation.riskLevel,
      },
      { status: 400 },
    );
  }

  // Check client checksum
  if (clientChecksum && clientChecksum !== validation.checksum) {
    await flagCheatAttempt(
      auth.userId,
      'state_tampering',
      `Client checksum mismatch on server state sync. Client: ${clientChecksum}, Server: ${validation.checksum}`,
      'high',
    );

    return NextResponse.json(
      { error: 'Checksum mismatch', code: 'CHECKSUM_MISMATCH' },
      { status: 400 },
    );
  }

  const buildingsCount = ((gameState as Record<string, unknown>).buildings as unknown[])?.length || 0;
  const currentVersion = currentServerState ? (currentServerState as Record<string, unknown>).state_version as number || 0 : 0;

  // Upsert to server_game_state
  const { data: upsertData, error: upsertError } = await supabase
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
      state_version: currentVersion + 1,
      last_tick_at: new Date().toISOString(),
      last_saved_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (upsertError) {
    console.error('[GameStateAPI] server_game_state upsert error:', upsertError);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Also sync to player_progress for backwards compatibility
  await supabase
    .from('player_progress')
    .upsert({
      user_id: userId,
      game_state: gameState,
      last_saved_at: new Date().toISOString(),
      total_money_earned: Number(gameState.totalMoneyEarned) || 0,
      game_tick: Number(gameState.gameTick) || 0,
      buildings_count: buildingsCount,
      save_checksum: validation.checksum,
    }, { onConflict: 'user_id' });

  // Audit log
  const clientInfo = extractClientInfo(request);
  logActionAsync({
    userId: auth.userId,
    actionType: 'save',
    payload: {
      source: 'server_game_state',
      buildingsCount,
      riskLevel: validation.riskLevel,
      stateVersion: currentVersion + 1,
    },
    gameTick: Number(gameState.gameTick) || 0,
    moneyBefore: previousState ? Number(previousState.money) || 0 : 0,
    moneyAfter: Number(gameState.money) || 0,
    checksum: validation.checksum,
    isValid: validation.isValid,
    ...clientInfo,
  });

  return NextResponse.json({
    saved: true,
    stateHash: validation.checksum,
    stateVersion: currentVersion + 1,
    validation: {
      isValid: validation.isValid,
      riskLevel: validation.riskLevel,
      ...(validation.violations.length > 0 ? { violations: validation.violations } : {}),
    },
  });
}
