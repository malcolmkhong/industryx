// ============================================
// IndustriaX: Server-Side Game State Validation
// Checksum, cheat detection, and audit logging
// SERVER-AUTHORITATIVE UPGRADE
// ============================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { createHmac } from 'crypto';

// ─── Types ──────────────────────────────────────────────────────────────

interface GameStateValidation {
  isValid: boolean;
  violations: string[];
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  checksum: string;
}

interface AuditLogEntry {
  userId: string;
  actionType: 'build' | 'sell' | 'buy' | 'research' | 'upgrade' | 'transport' | 'save' | 'load' | 'tick' | 'prestige' | 'import' | 'claim_quest' | 'hire_worker' | 'assign_worker' | 'upgrade_worker' | 'start_drone_mission' | 'collect_drone' | 'buy_market' | 'sell_market' | 'toggle_building' | 'set_game_speed' | 'bulk_build' | 'bulk_sell';
  payload: Record<string, unknown>;
  gameTick: number;
  moneyBefore: number;
  moneyAfter: number;
  checksum?: string;
  isValid: boolean;
  rejectionReason?: string;
  clientIp?: string;
  userAgent?: string;
}

// ─── Game State Limits (Server-Authoritative) ───────────────────────────

const GAME_LIMITS = {
  /** Maximum money a player can have (sane upper bound) */
  MAX_MONEY: 1e15,
  /** Maximum total buildings */
  MAX_BUILDINGS: 500,
  /** Maximum building level */
  MAX_BUILDING_LEVEL: 100,
  /** Maximum game tick per real-world second at 10x speed */
  MAX_TICK_RATE_PER_SECOND: 50,
  /** Maximum resources of any single type */
  MAX_RESOURCE_AMOUNT: 1e12,
  /** Maximum research points */
  MAX_RESEARCH_POINTS: 1e9,
  /** Maximum prestige points */
  MAX_PRESTIGE_POINTS: 1000,
  /** Allowed game speeds */
  ALLOWED_GAME_SPEEDS: [1, 2, 5, 10] as const,
  /** Maximum cheat flags before auto-lock */
  MAX_CHEAT_FLAGS: 3,
} as const;

// ─── HMAC Checksum ─────────────────────────────────────────────────────

const HMAC_SECRET = process.env.CHECKSUM_SECRET || 'industriax-server-secret-2024';

/**
 * Generate an HMAC-SHA256 checksum of the game state for integrity verification.
 * This is cryptographically secure — the client cannot forge it without the secret.
 */
export function generateChecksum(gameState: Record<string, unknown>): string {
  const criticalFields = {
    m: gameState.money,
    t: gameState.totalMoneyEarned,
    g: gameState.gameTick,
    b: JSON.stringify(gameState.buildings),
    r: gameState.researchPoints,
    rp: JSON.stringify(gameState.completedResearch),
  };

  const str = JSON.stringify(criticalFields);
  const hmac = createHmac('sha256', HMAC_SECRET);
  hmac.update(str);
  return hmac.digest('hex').substring(0, 16); // 16-char hex for compactness
}

/**
 * Verify a checksum against a game state.
 * Returns true if the checksum matches.
 */
export function verifyChecksum(gameState: Record<string, unknown>, checksum: string): boolean {
  const expected = generateChecksum(gameState);
  return expected === checksum;
}

// ─── Validation ────────────────────────────────────────────────────────

/**
 * Validate a game state for cheating.
 * Now with delta checks, game speed validation, and high-risk rejection.
 * 
 * @param gameState - The game state to validate
 * @param previousState - The PREVIOUS saved state from the server (for delta checks)
 * @param options - Additional validation options
 */
export function validateGameState(
  gameState: Record<string, unknown>,
  previousState?: Record<string, unknown>,
  options?: { skipDeltaChecks?: boolean; allowHighRisk?: boolean },
): GameStateValidation {
  const violations: string[] = [];
  let riskLevel: GameStateValidation['riskLevel'] = 'none';

  // ── Check money ──
  const money = Number(gameState.money) || 0;
  if (money < 0) {
    violations.push(`Negative money: ${money}`);
    riskLevel = 'critical'; // Was 'high', now critical — reject
  }
  if (money > GAME_LIMITS.MAX_MONEY) {
    violations.push(`Money exceeds maximum: ${money} > ${GAME_LIMITS.MAX_MONEY}`);
    riskLevel = 'critical';
  }

  // ── Check total money earned ──
  const totalMoney = Number(gameState.totalMoneyEarned) || 0;
  if (totalMoney < 0) {
    violations.push(`Negative totalMoneyEarned: ${totalMoney}`);
    riskLevel = 'critical'; // Was 'high', now critical — reject
  }
  if (money > totalMoney && totalMoney > 0) {
    violations.push(`Current money (${money}) > totalMoneyEarned (${totalMoney}) — impossible without selling/negative income`);
    if (riskLevel === 'none') riskLevel = 'low';
  }

  // ── Check buildings ──
  const buildings = gameState.buildings as unknown[];
  if (buildings) {
    if (buildings.length > GAME_LIMITS.MAX_BUILDINGS) {
      violations.push(`Too many buildings: ${buildings.length} > ${GAME_LIMITS.MAX_BUILDINGS}`);
      riskLevel = 'critical';
    }

    for (const b of buildings) {
      const building = b as Record<string, unknown>;
      const level = Number(building.level) || 1;
      if (level > GAME_LIMITS.MAX_BUILDING_LEVEL) {
        violations.push(`Building ${building.type} has level ${level} > max ${GAME_LIMITS.MAX_BUILDING_LEVEL}`);
        riskLevel = 'critical'; // Was 'high', now critical — reject
      }
      if (level < 1) {
        violations.push(`Building ${building.type} has invalid level ${level}`);
        riskLevel = 'critical'; // Was 'medium', now critical — reject
      }
    }
  }

  // ── Check research points ──
  const rp = Number(gameState.researchPoints) || 0;
  if (rp < 0) {
    violations.push(`Negative research points: ${rp}`);
    riskLevel = 'critical'; // Was 'high', now critical — reject
  }
  if (rp > GAME_LIMITS.MAX_RESEARCH_POINTS) {
    violations.push(`Research points exceeds maximum: ${rp}`);
    riskLevel = 'critical'; // Was 'high', now critical — reject
  }

  // ── Check resources ──
  const resources = gameState.resources as Record<string, number>;
  if (resources) {
    for (const [key, value] of Object.entries(resources)) {
      if (typeof value === 'number' && value > GAME_LIMITS.MAX_RESOURCE_AMOUNT) {
        violations.push(`Resource ${key} exceeds maximum: ${value}`);
        if (riskLevel === 'none') riskLevel = 'medium';
      }
      if (typeof value === 'number' && value < 0) {
        violations.push(`Negative resource ${key}: ${value}`);
        riskLevel = 'critical'; // Was 'high', now critical — reject
      }
    }
  }

  // ── Validate game speed ──
  const gameSpeed = Number(gameState.gameSpeed) || 1;
  if (!GAME_LIMITS.ALLOWED_GAME_SPEEDS.includes(gameSpeed as 1 | 2 | 5 | 10)) {
    violations.push(`Invalid game speed: ${gameSpeed}. Allowed: ${GAME_LIMITS.ALLOWED_GAME_SPEEDS.join(', ')}`);
    riskLevel = 'critical';
  }

  // ── Delta checks (if previous state available) ──
  if (previousState && !options?.skipDeltaChecks) {
    const prevTick = Number(previousState.gameTick) || 0;
    const currTick = Number(gameState.gameTick) || 0;

    // Game tick should only go forward
    if (currTick < prevTick) {
      violations.push(`Game tick went backwards: ${currTick} < ${prevTick}`);
      riskLevel = 'critical'; // Was 'high', now critical
    }

    // Check for impossibly fast tick progression
    const prevTime = Number(previousState.lastOnlineTimestamp) || 0;
    const currTime = Number(gameState.lastOnlineTimestamp) || 0;
    if (prevTime > 0 && currTime > prevTime) {
      const elapsedSeconds = (currTime - prevTime) / 1000;
      const tickDelta = currTick - prevTick;
      if (elapsedSeconds > 0) {
        const tickRate = tickDelta / elapsedSeconds;
        if (tickRate > GAME_LIMITS.MAX_TICK_RATE_PER_SECOND) {
          violations.push(`Tick rate too high: ${tickRate.toFixed(1)}/s (max: ${GAME_LIMITS.MAX_TICK_RATE_PER_SECOND}/s)`);
          riskLevel = 'critical'; // Was 'high', now critical
        }
      }
    }

    // Check for impossibly large money jump
    const prevMoney = Number(previousState.money) || 0;
    const prevTotalEarned = Number(previousState.totalMoneyEarned) || 0;
    const moneyDelta = money - prevMoney;
    const earnedDelta = totalMoney - prevTotalEarned;
    if (moneyDelta > 0 && earnedDelta >= 0 && moneyDelta > earnedDelta * 1.5 + 100000) {
      violations.push(`Money jump too large: +${moneyDelta.toFixed(0)} but only earned +${earnedDelta.toFixed(0)}`);
      // Escalate from medium to high
      if (riskLevel === 'none' || riskLevel === 'low' || riskLevel === 'medium') {
        riskLevel = 'high';
      }
    }

    // Check that completed research didn't grow impossibly
    const prevResearch = (previousState.completedResearch as string[]) || [];
    const currResearch = (gameState.completedResearch as string[]) || [];
    if (currResearch.length > prevResearch.length + 5) {
      // More than 5 new research items in one save is suspicious
      violations.push(`Too many new research items: ${currResearch.length - prevResearch.length} new items in one save`);
      if (riskLevel === 'none' || riskLevel === 'low') riskLevel = 'medium';
    }

    // Check building count didn't jump impossibly
    const prevBuildings = (previousState.buildings as unknown[]) || [];
    const currBuildings = (gameState.buildings as unknown[]) || [];
    if (currBuildings.length > prevBuildings.length + 20) {
      // More than 20 new buildings in one save is suspicious
      violations.push(`Too many new buildings: ${currBuildings.length - prevBuildings.length} new buildings in one save`);
      if (riskLevel === 'none' || riskLevel === 'low') riskLevel = 'medium';
    }
  }

  const checksum = generateChecksum(gameState);

  // ── Risk level policy: high-risk is now rejected too ──
  // Unless explicitly allowed (for backwards compatibility during migration)
  if (!options?.allowHighRisk && riskLevel === 'high') {
    // Treat high-risk as critical — reject the save
    riskLevel = 'critical';
  }

  return {
    isValid: violations.length === 0,
    violations,
    riskLevel,
    checksum,
  };
}

// ─── Server State Fetching ──────────────────────────────────────────────

/**
 * Fetch the previous server-side game state for delta validation.
 * Returns the game_state from server_game_state if it exists,
 * otherwise falls back to player_progress.
 */
export async function fetchPreviousServerState(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const supabase = createServiceRoleClient();

    // Try server_game_state first (authoritative)
    const { data: sgs } = await supabase
      .from('server_game_state')
      .select('full_state, money, game_tick, game_speed')
      .eq('user_id', userId)
      .single();

    if (sgs?.full_state) {
      return sgs.full_state as Record<string, unknown>;
    }

    // Fallback to player_progress
    const { data: pp } = await supabase
      .from('player_progress')
      .select('game_state')
      .eq('user_id', userId)
      .single();

    if (pp?.game_state) {
      return pp.game_state as Record<string, unknown>;
    }

    return null;
  } catch (err) {
    console.error('[Validator] Failed to fetch previous server state:', err);
    return null;
  }
}

/**
 * Check if a user account is locked for cheating.
 */
export async function isAccountLocked(userId: string): Promise<{ locked: boolean; reason?: string }> {
  try {
    const supabase = createServiceRoleClient();

    // Check server_game_state first
    const { data: sgs } = await supabase
      .from('server_game_state')
      .select('is_locked, lock_reason')
      .eq('user_id', userId)
      .single();

    if (sgs?.is_locked) {
      return { locked: true, reason: sgs.lock_reason || 'Account locked' };
    }

    // Also check player_progress
    const { data: pp } = await supabase
      .from('player_progress')
      .select('is_locked, lock_reason')
      .eq('user_id', userId)
      .single();

    if (pp?.is_locked) {
      return { locked: true, reason: pp.lock_reason || 'Account locked' };
    }

    return { locked: false };
  } catch {
    return { locked: false };
  }
}

/**
 * Increment the cheat flag counter and auto-lock if threshold reached.
 */
export async function flagCheatAttempt(
  userId: string,
  detectionType: string,
  description: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();

    // Increment cheat_flag_count on player_progress
    const { data: pp } = await supabase
      .from('player_progress')
      .select('cheat_flag_count')
      .eq('user_id', userId)
      .single();

    const newFlagCount = (pp?.cheat_flag_count || 0) + 1;

    // Update player_progress
    await supabase
      .from('player_progress')
      .update({
        cheat_flag_count: newFlagCount,
        ...(newFlagCount >= GAME_LIMITS.MAX_CHEAT_FLAGS ? {
          is_locked: true,
          lock_reason: `Auto-locked after ${newFlagCount} cheat flags. Last: ${description}`,
        } : {}),
      })
      .eq('user_id', userId);

    // Update server_game_state if it exists
    const { data: sgs } = await supabase
      .from('server_game_state')
      .select('cheat_flag_count')
      .eq('user_id', userId)
      .single();

    if (sgs) {
      const sgsFlagCount = (sgs.cheat_flag_count || 0) + 1;
      await supabase
        .from('server_game_state')
        .update({
          cheat_flag_count: sgsFlagCount,
          ...(sgsFlagCount >= GAME_LIMITS.MAX_CHEAT_FLAGS ? {
            is_locked: true,
            lock_reason: `Auto-locked after ${sgsFlagCount} cheat flags. Last: ${description}`,
          } : {}),
        })
        .eq('user_id', userId);
    }

    // Log to cheat_investigations
    await supabase
      .from('cheat_investigations')
      .insert({
        user_id: userId,
        detection_type: detectionType,
        severity,
        description,
        evidence: { flagCount: newFlagCount },
      });

    console.warn(`[AntiCheat] User ${userId} flagged: ${detectionType} (${severity}). Flag count: ${newFlagCount}`);
  } catch (err) {
    console.error('[AntiCheat] Failed to flag cheat attempt:', err);
  }
}

// ─── Audit Logging ─────────────────────────────────────────────────────

/**
 * Log a player action to the audit table.
 * This runs asynchronously and does NOT block the response.
 */
export function logActionAsync(entry: AuditLogEntry): void {
  // Fire and forget — don't block the API response
  setImmediate(async () => {
    try {
      const supabase = createServiceRoleClient();
      const { error } = await supabase
        .from('player_actions')
        .insert({
          user_id: entry.userId,
          action_type: entry.actionType,
          payload: entry.payload,
          game_tick: entry.gameTick,
          money_before: entry.moneyBefore,
          money_after: entry.moneyAfter,
          checksum: entry.checksum,
          is_valid: entry.isValid,
          rejection_reason: entry.rejectionReason,
          client_ip: entry.clientIp,
          user_agent: entry.userAgent,
        });

      if (error) {
        console.error('[AuditLog] Failed to log action:', error.message);
      }
    } catch (err) {
      console.error('[AuditLog] Unexpected error:', err);
    }
  });
}

/**
 * Extract client info from request headers.
 */
export function extractClientInfo(request: Request): { clientIp?: string; userAgent?: string } {
  return {
    clientIp: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  };
}

// Export limits for use in other modules
export { GAME_LIMITS };
