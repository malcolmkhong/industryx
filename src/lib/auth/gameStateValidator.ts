// ============================================
// IndustriaX: Server-Side Game State Validation
// Checksum, cheat detection, and audit logging
// ============================================

import { createServiceRoleClient } from '@/lib/supabase/server';

// ─── Types ──────────────────────────────────────────────────────────────

interface GameStateValidation {
  isValid: boolean;
  violations: string[];
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  checksum: string;
}

interface AuditLogEntry {
  userId: string;
  actionType: 'build' | 'sell' | 'buy' | 'research' | 'upgrade' | 'transport' | 'save' | 'load' | 'tick';
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
} as const;

// ─── Checksum ──────────────────────────────────────────────────────────

/**
 * Generate a simple checksum of the game state for integrity verification.
 * This is NOT cryptographic — it's a quick sanity check.
 * For real anti-cheat, use HMAC-SHA256 with a server secret.
 */
export function generateChecksum(gameState: Record<string, unknown>): string {
  // Include key fields in checksum
  const criticalFields = {
    m: gameState.money,
    t: gameState.totalMoneyEarned,
    g: gameState.gameTick,
    b: JSON.stringify(gameState.buildings),
    r: gameState.researchPoints,
    rp: JSON.stringify(gameState.completedResearch),
  };

  const str = JSON.stringify(criticalFields);
  // Simple hash (djb2 algorithm)
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ─── Validation ────────────────────────────────────────────────────────

/**
 * Validate a game state for obvious cheating.
 * Returns validation result with violations and risk level.
 */
export function validateGameState(
  gameState: Record<string, unknown>,
  previousState?: Record<string, unknown>,
): GameStateValidation {
  const violations: string[] = [];
  let riskLevel: GameStateValidation['riskLevel'] = 'none';

  // Check money
  const money = Number(gameState.money) || 0;
  if (money < 0) {
    violations.push(`Negative money: ${money}`);
    riskLevel = 'high';
  }
  if (money > GAME_LIMITS.MAX_MONEY) {
    violations.push(`Money exceeds maximum: ${money} > ${GAME_LIMITS.MAX_MONEY}`);
    riskLevel = 'critical';
  }

  // Check total money earned
  const totalMoney = Number(gameState.totalMoneyEarned) || 0;
  if (totalMoney < 0) {
    violations.push(`Negative totalMoneyEarned: ${totalMoney}`);
    riskLevel = 'high';
  }
  if (money > totalMoney && totalMoney > 0) {
    violations.push(`Current money (${money}) > totalMoneyEarned (${totalMoney}) — impossible without selling/negative income`);
    // This can happen legitimately, so lower risk
    if (riskLevel === 'none') riskLevel = 'low';
  }

  // Check buildings
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
        riskLevel = 'high';
      }
      if (level < 1) {
        violations.push(`Building ${building.type} has invalid level ${level}`);
        riskLevel = 'medium';
      }
    }
  }

  // Check research points
  const rp = Number(gameState.researchPoints) || 0;
  if (rp < 0) {
    violations.push(`Negative research points: ${rp}`);
    riskLevel = 'high';
  }
  if (rp > GAME_LIMITS.MAX_RESEARCH_POINTS) {
    violations.push(`Research points exceeds maximum: ${rp}`);
    riskLevel = 'high';
  }

  // Check resources
  const resources = gameState.resources as Record<string, number>;
  if (resources) {
    for (const [key, value] of Object.entries(resources)) {
      if (typeof value === 'number' && value > GAME_LIMITS.MAX_RESOURCE_AMOUNT) {
        violations.push(`Resource ${key} exceeds maximum: ${value}`);
        if (riskLevel === 'none') riskLevel = 'medium';
      }
      if (typeof value === 'number' && value < 0) {
        violations.push(`Negative resource ${key}: ${value}`);
        riskLevel = 'high';
      }
    }
  }

  // Check game tick progression (if we have previous state)
  if (previousState) {
    const prevTick = Number(previousState.gameTick) || 0;
    const currTick = Number(gameState.gameTick) || 0;

    // Game tick should only go forward
    if (currTick < prevTick) {
      violations.push(`Game tick went backwards: ${currTick} < ${prevTick}`);
      riskLevel = 'high';
    }

    // Check for impossibly fast tick progression
    // If previous state has timestamp, we can check rate
    const prevTime = Number(previousState.lastOnlineTimestamp) || 0;
    const currTime = Number(gameState.lastOnlineTimestamp) || 0;
    if (prevTime > 0 && currTime > prevTime) {
      const elapsedSeconds = (currTime - prevTime) / 1000;
      const tickDelta = currTick - prevTick;
      if (elapsedSeconds > 0) {
        const tickRate = tickDelta / elapsedSeconds;
        if (tickRate > GAME_LIMITS.MAX_TICK_RATE_PER_SECOND) {
          violations.push(`Tick rate too high: ${tickRate.toFixed(1)}/s (max: ${GAME_LIMITS.MAX_TICK_RATE_PER_SECOND}/s)`);
          riskLevel = 'high';
        }
      }
    }

    // Check for impossibly large money jump
    const prevMoney = Number(previousState.money) || 0;
    const prevTotalEarned = Number(previousState.totalMoneyEarned) || 0;
    const moneyDelta = money - prevMoney;
    // Money can only increase by totalEarned delta + selling, so it should be reasonable
    const earnedDelta = totalMoney - prevTotalEarned;
    if (moneyDelta > 0 && earnedDelta >= 0 && moneyDelta > earnedDelta * 1.5 + 100000) {
      // Allow some margin for market sales
      violations.push(`Money jump too large: +${moneyDelta.toFixed(0)} but only earned +${earnedDelta.toFixed(0)}`);
      if (riskLevel === 'none') riskLevel = 'medium';
    }
  }

  const checksum = generateChecksum(gameState);

  return {
    isValid: violations.length === 0,
    violations,
    riskLevel,
    checksum,
  };
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
