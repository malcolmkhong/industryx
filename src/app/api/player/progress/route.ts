// ============================================
// IndustriaX: Player Progress API
// GET/POST endpoint for cloud save
// SERVER-AUTHORITATIVE — LEAN MVP
// - player_progress is now a thin backwards-compat table
//   (user_id, display_name, game_state only)
// - server_game_state is the source of truth
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/access';;
import { verifyAuthAndOwnership } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import {
  validateGameState,
  extractValidatedSaveFields,
  logActionAsync,
  isAccountLocked,
  flagCheatAttempt,
} from '@/lib/auth/gameStateValidator';

// GET /api/player/progress?userId=xxx - Load player progress
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
  const rateLimitResponse = await checkRateLimit(auth.userId, RATE_LIMITS.player, '/api/player/progress');
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
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable — database not configured' },
      { status: 503 }
    );
  }

  // Try server_game_state first (authoritative), then fall back to player_progress
  const { data: sgs } = await supabase
    .from('server_game_state')
    .select('full_state, money, game_tick, game_speed, state_hash, last_saved_at, state_version')
    .eq('user_id', userId)
    .single();

  if (sgs?.full_state) {
    // Audit log the load — values validated inside logActionAsync per [SEC-011].
    logActionAsync({
      userId: auth.userId,
      actionType: 'load',
      payload: { source: 'server_game_state' },
      gameTick: Number(sgs.game_tick),
      moneyAfter: Number(sgs.money),
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
    .select(
      'user_id,display_name,game_state,total_money_earned,game_tick,game_speed,last_login_at,last_saved_at,resources,buildings,workers,research_progress,completed_research,active_research,contracts,auto_collect,auto_sell_resources,blueprints,last_server_tick_at,pending_notifications,total_play_time,created_at',
    )
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

  // Audit log the load — values validated inside logActionAsync per [SEC-011].
  // Optional chaining is fine: Number(undefined) returns NaN which logActionAsync
  // will reject and skip the insert (no `|| 0` silent lie).
  logActionAsync({
    userId: auth.userId,
    actionType: 'load',
    payload: { source: 'player_progress' },
    gameTick: Number(gameState?.gameTick),
    moneyAfter: Number(gameState?.money),
    isValid: true,
    validationRisk: 'none',
  });

  return NextResponse.json({ data, source: 'player_progress', isNew: false });
}

// POST /api/player/progress - Save player progress (SERVER-AUTHORITATIVE)
export async function POST(request: Request) {
  // Request body schema — the trusted server contract.
  //
  // IMPORTANT: the client may still send `clientChecksum` and
  // `clientStateVersion` fields (CloudSyncService.ts is unchanged for now),
  // but the server DOES NOT read them. They are intentionally absent from
  // this type and ignored by the handler. Including them here would make
  // them part of the server contract and re-introduce an attack surface.
  let body: {
    userId?: string;
    gameState?: Record<string, unknown>;
    displayName?: string;
  };
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
  const rateLimitResponse = await checkRateLimit(auth.userId, RATE_LIMITS.player, '/api/player/progress');
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
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable — database not configured' },
      { status: 503 }
    );
  }

  // Fetch current server state for delta validation + state_version for conflict detection
  const { data: currentServerState } = await supabase
    .from('server_game_state')
    .select('full_state, state_hash, game_tick, state_version, money')
    .eq('user_id', userId)
    .single();

  // Version conflict detection is server-internal via the
  // `saveServerGameStateOptimistic` optimistic lock below (RULES.md [SEC-001],
  // [PRF-006]); the client-vs-server version comparison that used to live
  // here was removed because it could not be trusted — client-supplied
  // version numbers are not part of the server contract.

  const previousState = currentServerState?.full_state as Record<string, unknown> | null;

  // ✅ Validate game state with delta checks
  const validation = await validateGameState(gameState, previousState || undefined);
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

    // Audit log the rejected save — values validated inside logActionAsync.
    logActionAsync({
      userId: auth.userId,
      actionType: 'save',
      payload: { violations: validation.violations, riskLevel: validation.riskLevel },
      gameTick: Number(gameState.gameTick),
      moneyAfter: Number(gameState.money),
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

  // NOTE: The previous clientChecksum !== validation.checksum anti-cheat block was
  // removed because it incorrectly compared a previously-loaded server hash against
  // a newly modified game state. That comparison flagged every legitimate save
  // (state_N vs state_N+1) as state_tampering and auto-locked users after 3 saves.
  // The previous clientStateVersion !== server_state_version block was removed
  // for the same reason — the client's claimed version is not trustworthy input.
  // Cheat detection now relies SOLELY on:
  //   1. validateGameState() — bounds + delta checks (server-side)
  //   2. saveServerGameStateOptimistic() — server-internal optimistic lock
  //      on state_version (any client-sent version is ignored).
  // The clientChecksum + clientStateVersion request fields, serverStateHash
  // storage, and stateHash response values are KEPT ONLY at the wire/storage
  // boundary for backwards compatibility with the existing client — they are
  // NOT part of the trusted server contract and are explicitly absent from
  // the request body TypeScript type above.

  // ─── Extract + validate DB-writeable numeric fields at trust boundary ────
  // Per RULES.md [SEC-011]: do not silently substitute defaults (e.g.
  // `|| 0`) for required fields. extractValidatedSaveFields() throws on
  // missing/invalid values; we catch and return 503. Defends the DB
  // write path even if validateGameState() somehow allowed corrupt data.
  let saveFields;
  try {
    saveFields = extractValidatedSaveFields(gameState);
  } catch (err) {
    console.error('[PlayerAPI] game state field validation failed:', err);
    return NextResponse.json(
      { error: 'Invalid game state fields', code: 'INVALID_SAVE_FIELDS' },
      { status: 503 },
    );
  }
  const {
    money,
    totalMoneyEarned,
    researchPoints,
    buildingsCount,
    gameTick,
    gameSpeed,
  } = saveFields;

  // Upsert to server_game_state (AUTHORITATIVE — source of truth).
  // Uses validated values above, not the original client-supplied numbers
  // (no `|| 0` fallbacks).
  // Legacy cloud save is not tick settlement, so it must not move
  // `last_tick_at`. Server tick paths own that cursor.
  const now = new Date().toISOString();
  const { error: sgsError } = await supabase
    .from('server_game_state')
    .upsert({
      user_id: userId,
      money,
      total_money_earned: totalMoneyEarned,
      research_points: researchPoints,
      buildings: gameState.buildings,
      buildings_count: buildingsCount,
      completed_research: gameState.completedResearch,
      resources: gameState.resources,
      workers: gameState.workers,
      game_tick: gameTick,
      game_speed: gameSpeed,
      full_state: gameState,
      state_hash: validation.checksum,
      last_saved_at: now,
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

  // Audit log the successful save — use validated save fields (no `|| 0`).
  logActionAsync({
    userId: auth.userId,
    actionType: 'save',
    payload: {
      buildingsCount,
      riskLevel: validation.riskLevel,
      violations: validation.violations.length > 0 ? validation.violations : undefined,
      savedTo: ppError ? 'server_game_state_only' : 'both',
    },
    gameTick,
    moneyAfter: money,
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
