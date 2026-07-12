// ============================================
// Guest-to-Auth Migration Endpoint
// POST /api/auth/guest/migrate
//
// Validates guest save data before allowing
// migration to an authenticated Google account.
//
// Flow:
// 1. Guest plays locally (localStorage)
// 2. Guest clicks "Sign in with Google"
// 3. After Google OAuth, client sends local state here
// 4. Server validates the state against game rules
// 5. If valid → save as initial cloud state, return success
// 6. If invalid → reject/flag, return failure with reasons
// 7. After migration → cloud is authoritative for all future saves
//
// Iteration 9c of DB centralization migration:
//   - server_game_state existence check routed through db/serverGameState#getGameTick
//   - server_game_state upserts (reject + accept branches) routed through
//     db/serverGameState#upsertServerGameState
//   - player_progress upserts routed through db/playerProgress#upsertPlayerProgress
//   - 6 inline .from() calls replaced
//   - Validation, audit logging, and cheat flagging remain inline — those are
//     auth policy concerns, not CRUD patterns.
// ============================================

import { NextResponse, type NextRequest } from "next/server";
import { validateGuestMigration } from '@/lib/auth/guestMigrationValidator';
import {
  validateGameState,
  generateChecksum,
  flagCheatAttempt,
  logActionAsync,
  extractValidatedSaveFields,
} from '@/lib/auth/gameStateValidator';
import { verifyAuthAndOwnership } from '@/lib/auth/verifyAuth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rateLimiter';
import {
  upsertServerGameState,
  getGameTick,
} from '@/lib/db/serverGameState';
import { fetchCanonicalInitialState } from '@/lib/db/initialState.server';
import { upsertPlayerProgress } from '@/lib/db/playerProgress';
import { asFullState, stripUIFields } from '@/lib/db/serverGameStatePayload';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, gameState, displayName } = body as {
      userId?: string;
      gameState?: Record<string, unknown>;
      displayName?: string;
    };

    // ── Validate required fields ──
    if (!userId || !gameState) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, gameState' },
        { status: 400 }
      );
    }

    // ── Verify authentication and ownership ──
    const auth = await verifyAuthAndOwnership(userId);
    if (!auth.success) return auth.response;

    // ── Rate limit (H9: prevent brute-force migration attempts) ──
    const rateLimitResponse = await checkRateLimit(userId, RATE_LIMITS.action, '/api/auth/guest/migrate');
    if (rateLimitResponse) return rateLimitResponse;

    // ── Sanitize displayName (M9: strip control chars, angle brackets, cap length) ──
    const safeDisplayName = String(displayName || auth.email?.split('@')[0] || 'Commander')
      .split('')
      .filter((char) => {
        const code = char.charCodeAt(0);
        return !((code >= 0 && code <= 31) || (code >= 127 && code <= 159));
      })
      .join('')
      .replace(/[<>]/g, '')
      .slice(0, 32);

    // ── Check if user already has cloud state ──
    const existingTick = await getGameTick(userId);

    if (existingTick !== null) {
      // User already has cloud state — this is NOT a first-time migration.
      // Cloud is authoritative. Don't overwrite.
      return NextResponse.json({
        migrated: false,
        reason: 'Cloud state already exists — cloud is authoritative',
        action: 'use_cloud',
        cloudTick: existingTick,
      });
    }

    // ── Run the guest migration validator ──
    const migrationResult = await validateGuestMigration(gameState);

    // ── Also run the standard game state validator (static bounds) ──
    const standardValidation = await validateGameState(gameState, undefined, {
      skipDeltaChecks: true, // No previous state for delta checks
      allowHighRisk: false,
    });

    // Combine violations
    const allViolations = [
      ...migrationResult.violations,
      ...standardValidation.violations,
    ];

    // ── Log the migration attempt ──
    // Audit log values use validated fields (no `|| 0`). logActionAsync
    // strictly validates gameTick + moneyAfter (RULES.md [SEC-011]) and
    // warns + skips the insert if values are non-finite. Nested payload
    // fields are informational only (`Record<string, unknown>` payload)
    // and are passed through as-is for forensic value.
    let migrationFields;
    try {
      migrationFields = extractValidatedSaveFields(gameState);
    } catch (err) {
      console.error('[MigrateGuest] game state field validation failed:', err);
      return NextResponse.json(
        { error: 'Invalid game state fields', code: 'INVALID_SAVE_FIELDS' },
        { status: 503 },
      );
    }

    logActionAsync({
      userId,
      actionType: 'save',
      payload: {
        type: 'guest_migration',
        riskLevel: migrationResult.riskLevel,
        action: migrationResult.action,
        violationCount: allViolations.length,
        gameTick: migrationFields.gameTick,
        totalMoneyEarned: migrationFields.totalMoneyEarned,
        buildingCount: migrationFields.buildingsCount,
        researchCount: Array.isArray(gameState.completedResearch)
          ? gameState.completedResearch.length
          : 0,
      },
      gameTick: migrationFields.gameTick,
      moneyAfter: migrationFields.money,
      isValid: migrationResult.isValid,
      validationRisk: migrationResult.riskLevel,
      rejectionReason: migrationResult.action === 'reject' ? migrationResult.summary : undefined,
    });

    // ── Handle based on validation result ──
    if (migrationResult.action === 'reject') {
      // ── REJECT: State is clearly manipulated ──

      // Flag the cheat attempt
      await flagCheatAttempt(
        userId,
        'guest_migration_rejected',
        migrationResult.summary,
        migrationResult.riskLevel === 'none' ? 'low' : migrationResult.riskLevel,
      );

      // Reset to server-authoritative canonical initial state (Phase 12).
      // Previously seeded a partial full_state with total_money_earned=1000
      // which violated the spend/income invariant.
      let canonical;
      try {
        canonical = await fetchCanonicalInitialState();
      } catch (err) {
        console.error('[MigrateGuest] canonical initial state unavailable:', err);
        return NextResponse.json(
          { error: 'Initial state unavailable' },
          { status: 503 },
        );
      }
      const checksum = generateChecksum(canonical as unknown as Record<string, unknown>);
      await upsertServerGameState({
        user_id: userId,
        money: canonical.money,
        total_money_earned: 0,
        research_points: canonical.researchPoints,
        buildings: asFullState(canonical.buildings),
        buildings_count: 0,
        completed_research: asFullState(canonical.completedResearch),
        resources: asFullState(canonical.resources),
        workers: asFullState(canonical.workers),
        game_tick: canonical.gameTick,
        game_speed: canonical.gameSpeed,
        full_state: asFullState(canonical),
        state_hash: checksum,
        state_version: 1,
        is_locked: false,
        cheat_flag_count: 1, // Already flagged once
      });

      // Also update player_progress for backwards compat.
            // canonical is ServerGameData (no UI fields), safe to write directly.
            await upsertPlayerProgress(userId, {
              display_name: safeDisplayName,
              game_state: canonical as unknown as Record<string, unknown>,
            });

      return NextResponse.json({
        migrated: false,
        reason: 'Guest save data failed validation — migration rejected',
        action: 'reset',
        violations: allViolations,
        riskLevel: migrationResult.riskLevel,
        checks: migrationResult.checks.map(c => ({
          name: c.name,
          passed: c.passed,
          detail: c.detail,
        })),
        // Client should reset to canonical starting state
        resetState: canonical,
      }, { status: 200 }); // 200 because the request itself succeeded, even if migration was rejected
    }

    if (migrationResult.action === 'accept_with_flag') {
      // ── ACCEPT WITH FLAG: State is suspicious but not clearly hacked ──
      // Accept the migration but flag for admin review

      await flagCheatAttempt(
        userId,
        'guest_migration_flagged',
        migrationResult.summary,
        migrationResult.riskLevel === 'none' ? 'low' : migrationResult.riskLevel,
      );

      // Proceed with saving the state (same as accept below)
    }

    // ── ACCEPT: State is valid (or accepted with flag) ──
    // Save the guest state as the initial cloud state

    const buildings = (gameState.buildings as Array<Record<string, unknown>>) || [];
    const completedResearch = (gameState.completedResearch as string[]) || [];
    const resources = (gameState.resources as Record<string, number>) || {};
    const workers = (gameState.workers as Array<Record<string, unknown>>) || [];
    const checksum = generateChecksum(gameState);

    // Phase 13 (2026-07-10, Option C) — strip UI fields (hydrated,
    // activeTab, selectedBuilding, notifications, productionSnapshot)
    // before persisting via the shared helper.
    const sanitizedFullState = stripUIFields(
      gameState as Record<string, unknown>,
    );

    // Use the same validated save fields for the DB write (no `|| 0`
    // silent fallbacks — if any required field is missing/invalid, the
    // earlier `extractValidatedSaveFields` call above would have already
    // thrown and we'd have returned 503. By the time we reach here,
    // fields are guaranteed finite numbers per RULES.md [SEC-011].
    const initialState = await upsertServerGameState({
      user_id: userId,
      money: migrationFields.money,
      total_money_earned: migrationFields.totalMoneyEarned,
      research_points: migrationFields.researchPoints,
      buildings: asFullState(buildings.map(b => ({
        type: b.type,
        level: b.level,
        active: b.active,
        efficiency: b.efficiency,
      }))),
      buildings_count: migrationFields.buildingsCount,
      completed_research: asFullState(completedResearch),
      resources: asFullState(resources),
      workers: asFullState(workers.map(w => ({
        type: w.type,
        level: w.level,
        assignedTo: w.assignedTo,
      }))),
      game_tick: migrationFields.gameTick,
      game_speed: migrationFields.gameSpeed,
      full_state: asFullState(sanitizedFullState),
      state_hash: checksum,
      state_version: 1,
      is_locked: false,
      cheat_flag_count: migrationResult.action === 'accept_with_flag' ? 1 : 0,
    });

    if (!initialState) {
      console.error('[MigrateGuest] Failed to save initial cloud state');
      return NextResponse.json(
        { error: 'Failed to save cloud state' },
        { status: 500 }
      );
    }

    // Also save to player_progress for backwards compatibility.
        // Uses sanitizedFullState (UI fields stripped) so the legacy column
        // matches server_game_state.full_state — defense-in-depth.
        await upsertPlayerProgress(userId, {
          display_name: safeDisplayName,
          game_state: sanitizedFullState,
        });

    return NextResponse.json({
      migrated: true,
      action: migrationResult.action,
      violations: migrationResult.action === 'accept_with_flag' ? allViolations : [],
      riskLevel: migrationResult.riskLevel,
      checks: migrationResult.checks.map(c => ({
        name: c.name,
        passed: c.passed,
        detail: c.detail,
      })),
      stateHash: checksum,
      message: migrationResult.action === 'accept_with_flag'
        ? 'Migration accepted but flagged for review'
        : 'Guest progress migrated to cloud successfully',
    });

  } catch (error) {
    console.error('[MigrateGuest] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error during migration' },
      { status: 500 }
    );
  }
}
