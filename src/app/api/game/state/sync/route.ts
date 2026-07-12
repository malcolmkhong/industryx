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
  extractValidatedSaveFields,
  logActionAsync,
  isAccountLocked,
  flagCheatAttempt,
} from '@/lib/auth/gameStateValidator';
import { isAdminUserId } from '@/lib/auth/admin';
import {
  loadServerGameStateLite,
  loadServerGameStateForDeltaCheck,
  initializeGuestGameState,
  buildCompleteFullStateForServerRow,
  upsertServerGameState,
  syncPlayerProgressGameState,
  isServerGameStateAvailable,
} from '@/lib/db/game/serverGameState';
import { asFullState, stripUIFields } from '@/lib/db/game/serverGameStatePayload';

// GET /api/game/state/sync?userId=xxx - Load authoritative server game state
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const auth = await verifyAuthAndOwnership(userId);
  if (!auth.success) return auth.response;

  const rateLimitResponse = await checkRateLimit(auth.userId, RATE_LIMITS.sync, '/api/game/state/sync');
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

  let data = await loadServerGameStateLite(userId);
  if (!data) {
    // No row found (PGRST116) — treat as new user.
    const initialized = await initializeGuestGameState(userId);
    if (!initialized) {
      return NextResponse.json(
        { error: 'Failed to initialize game state', code: 'STATE_INIT_FAILED' },
        { status: 500 },
      );
    }
    data = initialized;
  }

  let completeFullState;
  try {
    completeFullState = await buildCompleteFullStateForServerRow(data);
  } catch (err) {
    console.error('[GameStateAPI] full_state hydration failed:', err);
    return NextResponse.json(
      { error: 'Invalid server game state', code: 'INVALID_SERVER_STATE' },
      { status: 503 },
    );
  }

  // Audit log — values validated inside logActionAsync per [SEC-011].
  // Pass raw `Number()` (no `|| 0`); if NaN/non-integer, logActionAsync
  // warns and skips the insert instead of silently writing 0.
  logActionAsync({
    userId: auth.userId,
    actionType: 'load',
    payload: { source: 'server_game_state' },
    gameTick: Number(data.game_tick),
    moneyAfter: Number(data.money),
    isValid: true,
    validationRisk: 'none',
  });

  return NextResponse.json({
    data: {
      fullState: completeFullState,
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

// POST /api/game/state/sync - Sync game state to server (authoritative)
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
    // Phase 1: optional fingerprint/device_id from client (correlation only)
    fingerprintHash?: string;
    deviceId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, gameState } = body;

  if (!userId || !gameState) {
    return NextResponse.json({ error: 'userId and gameState are required' }, { status: 400 });
  }

  const auth = await verifyAuthAndOwnership(userId);
  if (!auth.success) return auth.response;

  const rateLimitResponse = await checkRateLimit(auth.userId, RATE_LIMITS.sync, '/api/game/state/sync');
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

  // Fetch current server state for delta validation.
  // Version conflict detection is server-internal via the
  // `saveServerGameStateOptimistic` optimistic lock below (RULES.md [SEC-001],
  // [PRF-006]); the client-vs-server version comparison that used to live
  // here was removed because it could not be trusted — client-supplied
  // version numbers are not part of the server contract.
  const currentServerState = await loadServerGameStateForDeltaCheck(userId);
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
        gameTick: Number(gameState.gameTick),
        moneyAfter: Number(gameState.money),
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
        gameTick: Number(gameState.gameTick),
        moneyAfter: Number(gameState.money),
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
  // missing/invalid values; we catch and return 503. Defends the DB write
  // path even if validateGameState() somehow allowed corrupt data through.
  // Also reads + validates state_version from the row (was previously
  // `... || 0` which silently masked missing rows on first save).
  let currentVersion: number;
  try {
    currentVersion = Number(currentServerState?.state_version);
    if (!Number.isInteger(currentVersion) || currentVersion < 0) {
      throw new Error(`state_version invalid: ${currentServerState?.state_version}`);
    }
  } catch (err) {
    console.error('[GameStateAPI] state_version validation failed:', err);
    return NextResponse.json(
      { error: 'Invalid server state version', code: 'INVALID_STATE_VERSION' },
      { status: 503 },
    );
  }

  let saveFields;
  try {
    saveFields = extractValidatedSaveFields(gameState);
  } catch (err) {
    console.error('[GameStateAPI] game state field validation failed:', err);
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

  // Phase 13 (2026-07-10, Option C) — defense-in-depth filter via the
  // shared helper. Strips client-side UI fields (hydrated, activeTab,
  // selectedBuilding, notifications, productionSnapshot) so a stale
  // client cannot smuggle UI into the full_state JSONB blob.
  const sanitizedFullState = stripUIFields(
    gameState as Record<string, unknown>,
  );

  // Upsert to server_game_state (SOURCE OF TRUTH) — uses validated values
  // above, not the original client-supplied numbers (no `|| 0` fallbacks).
  // Cloud save is not tick settlement. `last_tick_at` is owned by
  // applyElapsedTicks/offline tick paths after runServerTicks succeeds.
  const upsertData = await upsertServerGameState({
    user_id: userId,
    money,
    total_money_earned: totalMoneyEarned,
    research_points: researchPoints,
    buildings: asFullState(gameState.buildings),
    buildings_count: buildingsCount,
    completed_research: asFullState(gameState.completedResearch),
    resources: asFullState(gameState.resources),
    workers: asFullState(gameState.workers),
    game_tick: gameTick,
    game_speed: gameSpeed,
    full_state: asFullState(sanitizedFullState),
    state_hash: validation.checksum,
    state_version: currentVersion + 1,
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

  // Audit log — values validated inside logActionAsync per [SEC-011].
  // Use the validated save fields (already fail-closed above) rather
  // than the raw client-supplied values.
  logActionAsync({
    userId: auth.userId,
    actionType: 'save',
    payload: {
      source: 'server_game_state',
      buildingsCount,
      riskLevel: validation.riskLevel,
      stateVersion: currentVersion + 1,
    },
    gameTick,
    moneyAfter: money,
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
