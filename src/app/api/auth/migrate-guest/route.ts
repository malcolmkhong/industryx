// ============================================
// Guest-to-Auth Migration Endpoint
// POST /api/auth/migrate-guest
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
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { validateGuestMigration } from '@/lib/auth/guestMigrationValidator';
import { validateGameState, generateChecksum, flagCheatAttempt, logActionAsync } from '@/lib/auth/gameStateValidator';
import { createServiceRoleClient } from '@/lib/supabase/server';

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

    // ── Verify user is authenticated ──
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server not configured for authentication' },
        { status: 500 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid user ID or user not authenticated' },
        { status: 401 }
      );
    }

    // ── Check if user already has cloud state ──
    const { data: existingState } = await supabase
      .from('server_game_state')
      .select('user_id, game_tick')
      .eq('user_id', userId)
      .single();

    if (existingState) {
      // User already has cloud state — this is NOT a first-time migration.
      // Cloud is authoritative. Don't overwrite.
      return NextResponse.json({
        migrated: false,
        reason: 'Cloud state already exists — cloud is authoritative',
        action: 'use_cloud',
        cloudTick: existingState.game_tick,
      });
    }

    // ── Run the guest migration validator ──
    const migrationResult = validateGuestMigration(gameState);

    // ── Also run the standard game state validator (static bounds) ──
    const standardValidation = validateGameState(gameState, undefined, {
      skipDeltaChecks: true, // No previous state for delta checks
      allowHighRisk: false,
    });

    // Combine violations
    const allViolations = [
      ...migrationResult.violations,
      ...standardValidation.violations,
    ];

    // ── Log the migration attempt ──
    logActionAsync({
      userId,
      actionType: 'save',
      payload: {
        type: 'guest_migration',
        riskLevel: migrationResult.riskLevel,
        action: migrationResult.action,
        violationCount: allViolations.length,
        gameTick: Number(gameState.gameTick) || 0,
        totalMoneyEarned: Number(gameState.totalMoneyEarned) || 0,
        buildingCount: (gameState.buildings as unknown[])?.length || 0,
        researchCount: (gameState.completedResearch as string[])?.length || 0,
      },
      gameTick: Number(gameState.gameTick) || 0,
      moneyAfter: Number(gameState.money) || 0,
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

      // Create a fresh server state entry (marked as flagged)
      const checksum = generateChecksum(gameState);
      await supabase
        .from('server_game_state')
        .upsert({
          user_id: userId,
          money: 1000, // Reset to starting money
          total_money_earned: 1000,
          research_points: 0,
          buildings: [],
          buildings_count: 0,
          completed_research: [],
          resources: {},
          workers: [],
          game_tick: 0,
          game_speed: 1,
          full_state: {
            money: 1000,
            totalMoneyEarned: 1000,
            gameTick: 0,
            gameSpeed: 1,
            buildings: [],
            resources: {},
            completedResearch: [],
            researchPoints: 0,
          },
          state_hash: checksum,
          state_version: 1,
          is_locked: false,
          cheat_flag_count: 1, // Already flagged once
        }, { onConflict: 'user_id' });

      // Also update player_progress for backwards compat
      await supabase
        .from('player_progress')
        .upsert({
          user_id: userId,
          display_name: displayName || user.email?.split('@')[0] || 'Commander',
          game_state: {
            money: 1000,
            totalMoneyEarned: 1000,
            gameTick: 0,
            gameSpeed: 1,
            buildings: [],
            resources: {},
            completedResearch: [],
            researchPoints: 0,
          },
        }, { onConflict: 'user_id' });

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
        // Client should reset to starting state
        resetState: {
          money: 1000,
          totalMoneyEarned: 1000,
          gameTick: 0,
          gameSpeed: 1,
        },
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

    const { error: upsertError } = await supabase
      .from('server_game_state')
      .upsert({
        user_id: userId,
        money: Number(gameState.money) || 0,
        total_money_earned: Number(gameState.totalMoneyEarned) || 0,
        research_points: Number(gameState.researchPoints) || 0,
        buildings: buildings.map(b => ({
          type: b.type,
          level: b.level,
          active: b.active,
          efficiency: b.efficiency,
        })),
        buildings_count: buildings.length,
        completed_research: completedResearch,
        resources,
        workers: workers.map(w => ({
          type: w.type,
          level: w.level,
          assignedTo: w.assignedTo,
        })),
        game_tick: Number(gameState.gameTick) || 0,
        game_speed: Number(gameState.gameSpeed) || 1,
        full_state: gameState,
        state_hash: checksum,
        state_version: 1,
        is_locked: false,
        cheat_flag_count: migrationResult.action === 'accept_with_flag' ? 1 : 0,
      }, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('[MigrateGuest] Failed to save initial cloud state:', upsertError.message);
      return NextResponse.json(
        { error: 'Failed to save cloud state' },
        { status: 500 }
      );
    }

    // Also save to player_progress for backwards compatibility
    await supabase
      .from('player_progress')
      .upsert({
        user_id: userId,
        display_name: displayName || user.email?.split('@')[0] || 'Commander',
        game_state: gameState,
      }, { onConflict: 'user_id' });

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
