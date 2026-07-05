// ============================================
// IndustriaX: Server-Side Game State Validation
// Checksum, cheat detection, and audit logging
// SERVER-AUTHORITATIVE — LEAN MVP
// ============================================

import { createHmac } from "crypto";

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  enrichLatestInvestigation,
  incrementCheatFlag,
} from "@/lib/db/cheatInvestigations";
import { BUILDING_DEFS } from "@/lib/game/data";
import type { WorkerType } from "@/lib/game/types";

// ─── Types ──────────────────────────────────────────────────────────────

interface GameStateValidation {
  isValid: boolean;
  violations: string[];
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  checksum: string;
}

interface AuditLogEntry {
  userId: string;
  actionType: string;
  payload: Record<string, unknown>;
  gameTick: number;
  moneyAfter: number;
  checksum?: string;
  isValid?: boolean;
  validationRisk?: string;
  rejectionReason?: string;
}

// ─── HMAC Checksum ─────────────────────────────────────────────────────

// Phase 5.3: Fail-fast if CHECKSUM_SECRET is missing.
// Without this secret, the anti-cheat system cannot generate or verify HMAC
// checksums, making state_hash validation trivially bypassable in production.
const HMAC_SECRET = process.env.CHECKSUM_SECRET;
if (!HMAC_SECRET) {
  throw new Error(
    "[FATAL] CHECKSUM_SECRET must be set in production. " +
      "This protects against state tampering via state_hash validation.",
  );
}

const GAME_LIMITS = {
  /** Maximum money a player can have (sane upper bound) */
  MAX_MONEY: 1e12, // 1 trillion — realistic 24h max for 500 lvl-100 buildings producing best resource
  /** Maximum total buildings */
  MAX_BUILDINGS: 500,
  /** Maximum building level */
  MAX_BUILDING_LEVEL: 100,
  /** Maximum game tick per real-world second at 10x speed */
  MAX_TICK_RATE_PER_SECOND: 50,
  /** Maximum resources of any single type */
  MAX_RESOURCE_AMOUNT: 1e9, // 1 billion — realistic 24h max for any single resource type
  /** Maximum research points */
  MAX_RESEARCH_POINTS: 1e9,
  /** Maximum prestige points */
  MAX_PRESTIGE_POINTS: 1000,
  /** Allowed game speeds */
  ALLOWED_GAME_SPEEDS: [1, 2, 5, 10] as const,
  /** Maximum cheat flags before auto-lock */
  MAX_CHEAT_FLAGS: 3,
} as const;

/**
 * Generate an HMAC-SHA256 checksum of the game state.
 * Used for tamper detection on cloud saves.
 */
export function generateChecksum(gameState: Record<string, unknown>): string {
  if (!HMAC_SECRET) {
    throw new Error(
      "[SECURITY] Cannot generate checksum: CHECKSUM_SECRET is not set. Refusing to generate forgeable checksum.",
    );
  }
  const normalized = JSON.stringify(gameState, Object.keys(gameState).sort());
  return createHmac("sha256", HMAC_SECRET)
    .update(normalized)
    .digest("hex");
}

/**
 * Verify a game state's checksum matches its claimed hash.
 */
export function verifyChecksum(
  gameState: Record<string, unknown>,
  claimedHash: string,
): boolean {
  if (!HMAC_SECRET) {
    console.error(
      "[SECURITY] Cannot verify checksum: CHECKSUM_SECRET is not set. Rejecting by default.",
    );
    return false;
  }
  const computed = generateChecksum(gameState);
  // Use a constant-time comparison to prevent timing attacks
  if (computed.length !== claimedHash.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ claimedHash.charCodeAt(i);
  }
  return result === 0;
}

// ─── Main Validation ───────────────────────────────────────────────────

/**
 * Validate a complete game state against bounds, deltas, and anti-cheat rules.
 *
 * @param gameState     The incoming state from the client
 * @param previousState The last known server state (optional, enables delta checks)
 * @param options.allowHighRisk When true, high-risk violations are accepted
 *                             (used for tests or admin overrides)
 */
export function validateGameState(
  gameState: Record<string, unknown>,
  previousState?: Record<string, unknown>,
  options?: { skipDeltaChecks?: boolean; allowHighRisk?: boolean },
): GameStateValidation {
  const violations: string[] = [];
  let riskLevel: GameStateValidation["riskLevel"] = "none";

  // ── Check money ──
  const money = Number(gameState.money) || 0;
  if (money < 0) {
    violations.push(`Negative money: ${money}`);
    riskLevel = "critical";
  }
  if (money > GAME_LIMITS.MAX_MONEY) {
    violations.push(`Money exceeds maximum: ${money} > ${GAME_LIMITS.MAX_MONEY}`);
    riskLevel = "critical";
  }

  // ── Check total money earned ──
  const totalMoney = Number(gameState.totalMoneyEarned) || 0;
  if (totalMoney < 0) {
    violations.push(`Negative totalMoneyEarned: ${totalMoney}`);
    riskLevel = "critical";
  }
  if (money > totalMoney && totalMoney > 0) {
    violations.push(
      `Current money (${money}) > totalMoneyEarned (${totalMoney}) — impossible without selling/negative income`,
    );
    if (riskLevel === "none") riskLevel = "low";
  }

  // ── Check buildings ──
  const buildings = gameState.buildings as unknown[];
  if (buildings) {
    if (buildings.length > GAME_LIMITS.MAX_BUILDINGS) {
      violations.push(
        `Too many buildings: ${buildings.length} > ${GAME_LIMITS.MAX_BUILDINGS}`,
      );
      riskLevel = "critical";
    }

    for (const b of buildings) {
      const building = b as Record<string, unknown>;
      const level = Number(building.level) || 1;
      if (level > GAME_LIMITS.MAX_BUILDING_LEVEL) {
        violations.push(
          `Building ${building.type} has level ${level} > max ${GAME_LIMITS.MAX_BUILDING_LEVEL}`,
        );
        riskLevel = "critical";
      }
      if (level < 1) {
        violations.push(`Building ${building.type} has invalid level ${level}`);
        riskLevel = "critical";
      }
      // Whitelist building type against BUILDING_DEFS (server-authoritative
      // source). Unknown types (typos, exploit-injected, or removed-from-game
      // entries) are rejected. Critical because the cost / production / power
      // tables are keyed by type and a bogus type bypasses every per-building
      // check downstream.
      const bType = typeof building.type === "string" ? building.type : "";
      if (!bType || !(bType in BUILDING_DEFS)) {
        violations.push(`Building has unknown type: "${bType}"`);
        riskLevel = "critical";
      }
    }
  }

  // ── Check research points ──
  const rp = Number(gameState.researchPoints) || 0;
  if (rp < 0) {
    violations.push(`Negative research points: ${rp}`);
    riskLevel = "critical";
  }
  if (rp > GAME_LIMITS.MAX_RESEARCH_POINTS) {
    violations.push(`Research points exceeds maximum: ${rp}`);
    riskLevel = "critical";
  }

  // ── Check resources ──
  const resources = gameState.resources as Record<string, number>;
  if (resources) {
    for (const [key, value] of Object.entries(resources)) {
      // Whitelist resource key first. Unknown keys are critical —
      // an attacker could otherwise inject `{INVENTORY_HACK: 999}` and
      // pass value-only checks, then have client code attempt to
      // display / use a non-existent resource, breaking the UI or
      // bypassing per-resource logic (e.g., production formulas).
      if (!VALID_RESOURCE_KEYS.has(key)) {
        violations.push(`Unknown resource key: "${key}"`);
        riskLevel = "critical";
      }
      if (
        typeof value === "number" &&
        value > GAME_LIMITS.MAX_RESOURCE_AMOUNT
      ) {
        violations.push(`Resource ${key} exceeds maximum: ${value}`);
        if (riskLevel === "none") riskLevel = "medium";
      }
      if (typeof value === "number" && value < 0) {
        violations.push(`Negative resource ${key}: ${value}`);
        riskLevel = "critical";
      }
    }
  }

  // ── Validate game speed ──
  const gameSpeed = Number(gameState.gameSpeed) || 1;
  if (!GAME_LIMITS.ALLOWED_GAME_SPEEDS.includes(gameSpeed as 1 | 2 | 5 | 10)) {
    violations.push(
      `Invalid game speed: ${gameSpeed}. Allowed: ${GAME_LIMITS.ALLOWED_GAME_SPEEDS.join(", ")}`,
    );
    riskLevel = "critical";
  }

  // ── Delta checks (if previous state available) ──
  if (previousState && !options?.skipDeltaChecks) {
    const prevTick = Number(previousState.gameTick) || 0;
    const currTick = Number(gameState.gameTick) || 0;

    // Game tick should only go forward
    if (currTick < prevTick) {
      violations.push(`Game tick went backwards: ${currTick} < ${prevTick}`);
      riskLevel = "critical";
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
          violations.push(
            `Tick rate too high: ${tickRate.toFixed(1)}/s (max: ${GAME_LIMITS.MAX_TICK_RATE_PER_SECOND}/s)`,
          );
          riskLevel = "critical";
        }
      }
    }

    // Check for impossibly large money jump
    const prevMoney = Number(previousState.money) || 0;
    const prevTotalEarned = Number(previousState.totalMoneyEarned) || 0;
    const moneyDelta = money - prevMoney;
    const earnedDelta = totalMoney - prevTotalEarned;
    // Phase 7.4: Tighter per-save delta check threshold.
    // Reduced from 1.5x to 1.1x to catch gradual inflation attempts while still
    // allowing a 10% buffer for market price fluctuations. The fixed offset was
    // also lowered from 100k to 50k to tighten the absolute floor.
    // NOTE: This may increase false positives — test before rolling out.
    // Reference: Phase 7.4 of IMPLEMENTATION_PLAN.md
    if (
      moneyDelta > 0 &&
      earnedDelta >= 0 &&
      moneyDelta > earnedDelta * 1.1 + 50000
    ) {
      violations.push(
        `Money jump too large: +${moneyDelta.toFixed(0)} but only earned +${earnedDelta.toFixed(0)}`,
      );
      if (riskLevel === "none" || riskLevel === "low") {
        riskLevel = "medium";
      }
    }

    // Check that completed research didn't grow impossibly
    const prevResearch = (previousState.completedResearch as string[]) || [];
    const currResearch = (gameState.completedResearch as string[]) || [];
    if (currResearch.length > prevResearch.length + 5) {
      violations.push(
        `Too many new research items: ${currResearch.length - prevResearch.length} new items in one save`,
      );
      if (riskLevel === "none" || riskLevel === "low") riskLevel = "medium";
    }

    // Check building count didn't jump impossibly
    const prevBuildings = (previousState.buildings as unknown[]) || [];
    const currBuildings = (gameState.buildings as unknown[]) || [];
    if (currBuildings.length > prevBuildings.length + 20) {
      violations.push(
        `Too many new buildings: ${currBuildings.length - prevBuildings.length} new buildings in one save`,
      );
      if (riskLevel === "none" || riskLevel === "low") riskLevel = "medium";
    }
  }

  const checksum = generateChecksum(gameState);

  // ── Risk level policy: high-risk is now rejected too ──
  // Unless explicitly allowed (for backwards compatibility during migration).
  // Phase 7.4: Money-jump violations now produce 'medium' risk (was 'high').
  // The high-risk escalation remains for future validators that may
  // re-introduce 'high' severity (e.g., tick-rate violations).
  if (
    !options?.allowHighRisk &&
    (riskLevel as "none" | "low" | "medium" | "high" | "critical") === "high"
  ) {
    // Treat high-risk as critical — reject the save
    riskLevel = "critical";
  }

  return {
    isValid: riskLevel === "none" || riskLevel === "low",
    violations,
    riskLevel,
    checksum,
  };
}

/**
 * Validate a single action payload (build, research, etc.) without full state.
 * Lighter than validateGameState — used for action validation.
 */
export function validateAction(
  actionType: string,
  payload: Record<string, unknown>,
  currentMoney: number,
): { valid: boolean; error?: string } {
  switch (actionType) {
    case "build":
    case "upgrade": {
      const cost = Number(payload.cost) || 0;
      if (cost > currentMoney) {
        return { valid: false, error: "Insufficient money for build/upgrade" };
      }
      return { valid: true };
    }
    case "research": {
      const cost = Number(payload.cost) || 0;
      if (cost > currentMoney) {
        return { valid: false, error: "Insufficient money for research" };
      }
      return { valid: true };
    }
    case "buy_market":
    case "sell_market": {
      const amount = Number(payload.amount) || 0;
      if (amount <= 0) {
        return { valid: false, error: "Trade amount must be positive" };
      }
      return { valid: true };
    }
    case "set_game_speed": {
      const speed = Number(payload.speed);
      if (!GAME_LIMITS.ALLOWED_GAME_SPEEDS.includes(speed as 1 | 2 | 5 | 10)) {
        return { valid: false, error: `Invalid game speed: ${speed}` };
      }
      return { valid: true };
    }
    case "transport": {
      // Transport doesn't affect money directly
      return { valid: true };
    }
    default:
      return { valid: true };
  }
}

// ─── Import Save Validation ────────────────────────────────────────────

/**
 * Validate an imported save blob. Returns { valid: false } on any
 * server-side error. Never returns { valid: true } on errors.
 *
 * Used by /api/game/state POST handler when the request body matches
 * the import-save shape (explicit `import: true` flag).
 */
export async function validateImportSaveOnServer(
  saveData: Record<string, unknown>,
): Promise<{ valid: boolean; violations?: string[]; error?: string }> {
  // Apply the same bounds checks as a live save
  const validation = validateGameState(saveData, undefined, {
    skipDeltaChecks: true,
  });
  if (validation.riskLevel === "critical" || validation.riskLevel === "high") {
    return {
      valid: false,
      violations: validation.violations,
      error: "Imported save failed bounds validation",
    };
  }
  return { valid: true };
}

// ─── Server State Fetching ─────────────────────────────────────────────

/**
 * Fetch the previous server-side game state for delta validation.
 * Returns the full_state from server_game_state if it exists,
 * otherwise falls back to player_progress.game_state.
 */
export async function fetchPreviousServerState(
  userId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      throw new Error("Supabase service role not configured");
    }

    // Try server_game_state first (authoritative)
    const { data: sgs } = await supabase
      .from("server_game_state")
      .select("full_state, money, game_tick, game_speed")
      .eq("user_id", userId)
      .maybeSingle();

    if (sgs?.full_state) {
      return sgs.full_state as Record<string, unknown>;
    }

    // Fallback to player_progress (backwards compat — only game_state remains)
    const { data: pp } = await supabase
      .from("player_progress")
      .select("game_state")
      .eq("user_id", userId)
      .single();

    if (pp?.game_state) {
      return pp.game_state as Record<string, unknown>;
    }

    return null;
  } catch (err) {
    console.error("[Validator] Failed to fetch previous server state:", err);
    return null;
  }
}

// ─── Account Lock Check ────────────────────────────────────────────────

/**
 * Check if an account is currently locked (cheat-flagged).
 *
 * CRITICAL: This function is called in the auth path of EVERY game API
 * route. It MUST fail closed — if we can't verify lock status, the user
 * is treated as locked, not unlocked. Otherwise cheaters could DDoS the
 * database to bypass account locks.
 *
 * Iterations:
 *   1. Original: returned { locked: false } on DB error (FAIL-OPEN — bug)
 *   2. Iteration 5: added catch for service-role client missing
 *   3. Iteration 6 (current): both error paths return { locked: true }
 */
export async function isAccountLocked(
  userId: string,
): Promise<{ locked: boolean; reason?: string }> {
  try {
    const supabase = createServiceRoleClient();

    if (!supabase) {
      throw new Error("Supabase service role not configured");
    }

    const { data: sgs, error } = await supabase
      .from("server_game_state")
      .select("is_locked, lock_reason")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      // CRITICAL: Fail CLOSED on any DB error
      console.error(
        `[isAccountLocked] DB error for ${userId}: ${error.message}. Treating as locked.`,
      );
      return {
        locked: true,
        reason:
          "Unable to verify account status — access restricted for security",
      };
    }

    if (!sgs) {
      // No server_game_state row exists for this user
      // (brand-new user, never saved). Not locked, but no data either.
      return {
        locked: false,
      };
    }

    if (sgs.is_locked) {
      return {
        locked: true,
        reason: sgs.lock_reason || "Account locked",
      };
    }

    return {
      locked: false,
    };
  } catch (err) {
    // CRITICAL: Fail CLOSED on any unexpected error
    console.error(`[isAccountLocked] Exception for ${userId}:`, err);
    return {
      locked: true,
      reason:
        "Unable to verify account status — access restricted for security",
    };
  }
}

// ─── Cheat Investigation ───────────────────────────────────────────────

/**
 * Interface for cheat flagging options. Phase 1 enrichment fields.
 */
export interface FlagCheatAttemptOptions {
  /**
   * Client-computed fingerprint hash (correlation only, never used for
   * bans or locks). Optional. Pass `null` or `undefined` if unknown.
   */
  fingerprintHash?: string | null;
  /**
   * Client-supplied device id (the existing localStorage UUID). Optional.
   */
  deviceId?: string | null;
}

export async function flagCheatAttempt(
  userId: string,
  detectionType: string,
  description: string,
  severity: "low" | "medium" | "high" | "critical",
  options: FlagCheatAttemptOptions = {},
): Promise<void> {
  try {
    // Phase 4.1: Atomic RPC eliminates TOCTOU race present in the old
    // read-then-write pattern. increment_cheat_flag handles the increment
    // on both player_progress and server_game_state, the investigations
    // insert, and auto-lock if threshold reached — all in one transaction.
    // Delegated to db/cheatInvestigations.ts (Iteration 10).
    const ok = await incrementCheatFlag({
      userId,
      flagType: detectionType,
      description,
      severity,
    });

    if (!ok) {
      console.error(
        "[AntiCheat] Failed to flag cheat attempt: increment_cheat_flag RPC failed",
      );
      return;
    }

    // Phase 1 enrichment: denormalize fingerprint_hash and device_id onto the
    // most recent cheat_investigations row for this user. Best-effort (correlation
    // only); delegated to db/cheatInvestigations.ts#enrichLatestInvestigation.
    const { fingerprintHash, deviceId } = options;
    if (fingerprintHash || deviceId) {
      await enrichLatestInvestigation(
        userId,
        fingerprintHash ?? null,
        deviceId ?? null,
      );
    }

    console.warn(
      `[AntiCheat] User ${userId} flagged: ${detectionType} (${severity}).`,
    );
  } catch (err) {
    console.error("[AntiCheat] Failed to flag cheat attempt:", err);
  }
}

// ─── Audit Logging ─────────────────────────────────────────────────────

/**
 * Log a player action to the audit table.
 * This runs asynchronously and does NOT block the response.
 */
export function logActionAsync(entry: AuditLogEntry): void {
  // Fire and forget — don't block the API response
  // M2 FIX: Use queueMicrotask instead of setImmediate (not available in Edge runtimes)
  queueMicrotask(async () => {
    try {
      const supabase = createServiceRoleClient();
      if (!supabase) {
        throw new Error("Supabase service role not configured");
      }
      const { error } = await supabase.from("player_actions").insert({
        user_id: entry.userId,
        action_type: entry.actionType,
        payload: entry.payload,
        game_tick: entry.gameTick,
        money_after: entry.moneyAfter,
        checksum: entry.checksum,
        is_valid: entry.isValid,
        validation_risk: entry.validationRisk || "none",
        rejection_reason: entry.rejectionReason,
      });

      if (error) {
        console.error("[AuditLog] Failed to log action:", error.message);
      }
    } catch (err) {
      console.error("[AuditLog] Unexpected error:", err);
    }
  });
}

// Export limits for use in other modules
export { GAME_LIMITS };

// ============================================
// Whitelist sets for game state key validation.
// Built once at module load from the static type unions in
// src/lib/game/types.ts and the data definitions in data.ts. Any
// key NOT in these sets is rejected as a critical violation —
// cheaters must not be able to inject unknown building / resource
// / worker IDs that bypass balance checks.
//
// Source of truth: src/lib/game/types.ts (ResourceType, BuildingType,
// WorkerType unions) and src/lib/game/data.ts (BUILDING_DEFS, WORKER_DEFS).
// ============================================

/**
 * Allowlist of valid resource keys. Derived from the `ResourceType`
 * union plus the cost-pseudo-resources (`money`, `researchPoints`,
 * `corporationPoints`) that may also appear in resource maps.
 */
const VALID_RESOURCE_KEYS: ReadonlySet<string> = new Set<string>([
  // Raw + tiered (ResourceType union — keys from types.ts)
  "iron",
  "copper",
  "coal",
  "oil",
  "sand",
  "lithium",
  "water",
  "rareEarth",
  "clay",
  "limestone",
  "gravel",
  "bauxite",
  "wolframite",
  "silver",
  "gold",
  "ironPlate",
  "copperWire",
  "plastic",
  "glass",
  "carbon",
  "bricks",
  "concrete",
  "fertilizer",
  "steel",
  "fossilFuel",
  "circuit",
  "engine",
  "battery",
  "gear",
  "silicon",
  "aluminium",
  "insecticide",
  "copperIngot",
  "titanium",
  "coolant",
  "fiberOptics",
  "solarCell",
  "powerCell",
  "reinforcedConcrete",
  "refinedSilver",
  "refinedGold",
  "aiChip",
  "robotics",
  "quantumPart",
  "advancedAlloy",
  "nanoMaterial",
  "electronics",
  "medicalTech",
  "jewellery",
  "tungsten",
  "weapons",
  "scanDrone",
  "artifactDetector",
  "neuralNetwork",
  "carbonComposite",
  "structuralFrame",
  "fusionCell",
  "solarPanel",
  "creditChip",
  "singularityCore",
  "darkMatterCell",
  "warpDrive",
  "antimatter",
  "chronoPart",
  "plasmaCore",
  "megaStructure",
  "voidCrystal",
  "arcologyModule",
  "habitatModule",
  "stellarEnergy",
  "luxuryGoods",
  "tradeContract",
  "teleporterNode",
  "researchMatrix",
  "worldCore",
  "shieldMatrix",
  "stellarForge",
  "voidEnergy",
  "marketDominance",
  "corpCapital",
  "dimensionalGate",
  "armadaFleet",
  // Cost-pseudo-resources (allowed in resource maps for pricing UX)
  "money",
  "researchPoints",
  "corporationPoints",
]);

/**
 * Allowlist of valid worker keys. Derived from the `WorkerType` union.
 */
const VALID_WORKER_KEYS: ReadonlySet<string> = new Set<WorkerType>([
  "engineer",
  "mechanic",
  "transportManager",
  "aiSupervisor",
]);
