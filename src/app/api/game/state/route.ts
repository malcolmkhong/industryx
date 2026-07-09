// ============================================
// IndustriaX: Server Game State API
// GET/POST endpoint for authoritative server state
// This is the SOURCE OF TRUTH for logged-in users
// LEAN MVP — slim player_progress sync
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAuthAndOwnership } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import {
  validateGameState,
  logActionAsync,
  isAccountLocked,
  flagCheatAttempt,
} from '@/lib/auth/gameStateValidator';
import { isAdminUserId } from '@/lib/auth/admin';
import {
  loadServerGameStateLite,
  loadServerGameStateForDeltaCheck,
  upsertServerGameState,
  syncPlayerProgressGameState,
  isServerGameStateAvailable,
} from '@/lib/db/serverGameState';
import { asFullState, stripUIFields } from '@/lib/db/serverGameStatePayload';

// GET /api/game/state?userId=xxx - Load authoritative server game state
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const auth = await verifyAuthAndOwnership(userId);
  if (!auth.success) return auth.response;

  const rateLimitResponse = await checkRateLimit(auth.userId, RATE_LIMITS.sync, '/api/game/state');
  if (rateLimitResponse) return rateLimitResponse;

  const lockStatus = await isAccountLocked(auth.userId);
  if (lockStatus.locked && !isAdminUserId(auth.userId)) {
    return NextResponse.json(
      { error: 'Account is locked', code: 'ACCOUNT_LOCKED', reason: lockStatus.reason },
      { status: 403 },
    );
  }

  // Admin override: if admin is locked (e.g., by cheat detection), allow access but log
  if (lockStatus.locked && isAdminUserId(auth.userId)) {
    console.warn(`[GameStateAPI] Admin ${auth.userId} bypassing account lock for GET`);
  }

  if (!isServerGameStateAvailable()) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable — database not configured' },
      { status: 503 },
    );
  }

  const data = await loadServerGameStateLite(userId);
  if (!data) {
    // No row found (PGRST116) — treat as new user.
    return NextResponse.json({ data: null, isNew: true });
  }

  // Audit log
  logActionAsync({
    userId: auth.userId,
    actionType: 'load',
    payload: { source: 'server_game_state' },
    gameTick: data.game_tick || 0,
    moneyAfter: data.money || 0,
    isValid: true,
    validationRisk: 'none',
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
    clientStateVersion?: number;
    // Phase 1: optional fingerprint/device_id from client (correlation only)
    fingerprintHash?: string;
    deviceId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, gameState, clientChecksum, clientStateVersion } = body;

  if (!userId || !gameState) {
    return NextResponse.json({ error: 'userId and gameState are required' }, { status: 400 });
  }

  const auth = await verifyAuthAndOwnership(userId);
  if (!auth.success) return auth.response;

  const rateLimitResponse = await checkRateLimit(auth.userId, RATE_LIMITS.sync, '/api/game/state');
  if (rateLimitResponse) return rateLimitResponse;

  // Check if account is locked (admins bypass lock — they can self-unlock via admin panel)
  const lockStatus = await isAccountLocked(auth.userId);
  if (lockStatus.locked && !isAdminUserId(auth.userId)) {
    return NextResponse.json(
      { error: 'Account is locked', code: 'ACCOUNT_LOCKED', reason: lockStatus.reason },
      { status: 403 },
    );
  }

  // Admin override: if admin is locked (e.g., by cheat detection), allow save but log
  if (lockStatus.locked && isAdminUserId(auth.userId)) {
    console.warn(`[GameStateAPI] Admin ${auth.userId} bypassing account lock for POST`);
  }

  const isUserAdmin = isAdminUserId(auth.userId);

  // Phase 4.4: Fetch server timestamp from DB (immune to client clock manipulation)
  // Uses now_iso() RPC defined in supabase/migrations/024_now_iso_function.sql
  let serverTimestamp: string;
  try {
    const supabase = createServiceRoleClient();
    if (supabase) {
      const { data: serverTimeData } = await supabase.rpc('now_iso');
      serverTimestamp = serverTimeData ?? new Date().toISOString();
    } else {
      serverTimestamp = new Date().toISOString();
    }
  } catch {
    // Fallback to server local clock if RPC is not yet applied
    serverTimestamp = new Date().toISOString();
  }

  // Fetch current server state for delta validation + version conflict check
  const currentServerState = await loadServerGameStateForDeltaCheck(userId);

  // 02.3: State version conflict detection — if client provides clientStateVersion
  // and DB has a newer version, return 409 with current server state so client
  // can merge instead of overwriting.
  if (clientStateVersion !== undefined && currentServerState) {
    const dbStateVersion = (currentServerState.state_version as number) ?? 0;
    if (dbStateVersion > clientStateVersion) {
      console.warn(
        `[GameStateAPI] STATE_VERSION_CONFLICT for ${auth.userId}: client=${clientStateVersion}, server=${dbStateVersion}`,
      );
      logActionAsync({
        userId: auth.userId,
        actionType: 'save',
        payload: {
          source: 'server_game_state',
          clientStateVersion,
          serverStateVersion: dbStateVersion,
          reason: 'state_version_conflict',
        },
        gameTick: Number(gameState.gameTick) || 0,
        moneyAfter: Number(gameState.money) || 0,
        isValid: true,
        validationRisk: 'none',
        rejectionReason: `State version conflict: client=${clientStateVersion}, server=${dbStateVersion}`,
      });
      return NextResponse.json(
        {
          error: 'Server state is newer than client. Reload to merge.',
          code: 'STATE_VERSION_CONFLICT',
          serverState: {
            stateVersion: dbStateVersion,
            stateHash: currentServerState.state_hash,
            money: currentServerState.money,
            researchPoints: currentServerState.research_points,
            resources: currentServerState.resources,
            buildings: currentServerState.buildings,
            gameTick: currentServerState.game_tick,
            fullState: currentServerState.full_state,
          },
          clientStateVersion,
        },
        { status: 409 },
      );
    }
  }

  const previousState = currentServerState?.full_state as Record<string, unknown> | null;

  // Validate the incoming state
  const validation = await validateGameState(gameState, previousState || undefined);

  if (validation.riskLevel === 'critical' || validation.riskLevel === 'high') {
    // Admin bypass: skip cheat flagging and allow save even with violations
    if (isUserAdmin) {
      console.warn(`[GameStateAPI] Admin ${auth.userId} bypassing cheat detection: ${validation.violations.join('; ')}`);
      logActionAsync({
        userId: auth.userId,
        actionType: 'save',
        payload: { source: 'server_game_state', violations: validation.violations, riskLevel: validation.riskLevel, adminBypass: true },
        gameTick: Number(gameState.gameTick) || 0,
        moneyAfter: Number(gameState.money) || 0,
        checksum: validation.checksum,
        isValid: false,
        validationRisk: validation.riskLevel,
        rejectionReason: `Admin bypass: ${validation.riskLevel} violation: ${validation.violations.join('; ')}`,
      });
      // Continue to save — don't reject
    } else {
      await flagCheatAttempt(
        auth.userId,
        validation.riskLevel === 'critical' ? 'state_tampering' : 'money_manipulation',
        `Server state sync rejected: ${validation.violations.join('; ')}`,
        validation.riskLevel,
        { fingerprintHash: body.fingerprintHash, deviceId: body.deviceId },
      );

      logActionAsync({
        userId: auth.userId,
        actionType: 'save',
        payload: { source: 'server_game_state', violations: validation.violations, riskLevel: validation.riskLevel },
        gameTick: Number(gameState.gameTick) || 0,
        moneyAfter: Number(gameState.money) || 0,
        checksum: validation.checksum,
        isValid: false,
        validationRisk: validation.riskLevel,
        rejectionReason: `${validation.riskLevel} violation: ${validation.violations.join('; ')}`,
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
  }

  // NOTE: The previous clientChecksum !== validation.checksum anti-cheat block was
  // removed because it incorrectly compared a previously-loaded server hash against
  // a newly modified game state. That comparison flagged every legitimate save
  // (state_N vs state_N+1) as state_tampering and auto-locked users after 3 saves.
  // Cheat detection now relies solely on validateGameState()'s bounds + delta checks
  // and the state_version conflict detection above. The clientChecksum request
  // field, serverStateHash storage, and stateHash response values are preserved
  // for backwards compatibility with the existing client contract.

  const buildingsCount = ((gameState as Record<string, unknown>).buildings as unknown[])?.length || 0;
  const currentVersion = (currentServerState?.state_version as number) || 0;

  // Phase 13 (2026-07-10, Option C) — defense-in-depth filter via the
  // shared helper. Strips client-side UI fields (hydrated, activeTab,
  // selectedBuilding, notifications, productionSnapshot) so a stale
  // client cannot smuggle UI into the full_state JSONB blob.
  const sanitizedFullState = stripUIFields(
    gameState as Record<string, unknown>,
  );

  // Upsert to server_game_state (SOURCE OF TRUTH)
  const upsertData = await upsertServerGameState({
    user_id: userId,
    money: Number(gameState.money) || 0,
    total_money_earned: Number(gameState.totalMoneyEarned) || 0,
    research_points: Number(gameState.researchPoints) || 0,
    buildings: asFullState(gameState.buildings),
    buildings_count: buildingsCount,
    completed_research: asFullState(gameState.completedResearch),
    resources: asFullState(gameState.resources),
    workers: asFullState(gameState.workers),
    game_tick: Number(gameState.gameTick) || 0,
    game_speed: Number(gameState.gameSpeed) || 1,
    full_state: asFullState(sanitizedFullState),
    state_hash: validation.checksum,
    state_version: currentVersion + 1,
    last_tick_at: serverTimestamp,
    last_saved_at: serverTimestamp,
  });

  if (!upsertData) {
    return NextResponse.json(
      { error: 'Failed to persist game state' },
      { status: 500 }
    );
  }

  // Sync to player_progress for backwards compatibility (thin: user_id + game_state only).
    // Uses sanitizedFullState (UI fields stripped) so the legacy column matches the
    // server_game_state.full_state column and stale clients cannot smuggle UI in either place.
    await syncPlayerProgressGameState(userId, sanitizedFullState);

  // Audit log
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
    moneyAfter: Number(gameState.money) || 0,
    checksum: validation.checksum,
    isValid: validation.isValid,
    validationRisk: validation.riskLevel,
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
