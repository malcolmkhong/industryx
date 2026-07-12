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
// P2 refactor: Read BUILDING_DEFS from configCache (Supabase-backed live bindings)
// rather than hardcoded data.ts defaults. Imports previously from `@/lib/game/data`.
import { BUILDING_DEFS } from "@/lib/game/config/configCache";
import {
  getGameLimits,
  VALID_RESOURCE_KEYS,
} from "@/lib/game/config/balance/balanceConfig";
import { ensureConfigLoaded } from "@/lib/game/config/server/configLoader.server";

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

// VALID_RESOURCE_KEYS lives in balanceConfig.ts (single tuning surface).
// Re-exported here so existing imports keep working.
//
// NOTE: GAME_LIMITS was previously re-exported here. It has been removed
// in favor of `getGameLimits()` from balanceConfig (DB-backed).
export { VALID_RESOURCE_KEYS } from "@/lib/game/config/balance/balanceConfig";

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
  return createHmac("sha256", HMAC_SECRET).update(normalized).digest("hex");
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
 * P2 refactor: now async — must await ensureConfigLoaded() so the BUILDING_DEFS
 * whitelist reflects Supabase game definitions, not stale data.ts defaults.
 * If config cannot be loaded, returns a CRITICAL violation (fail-closed).
 *
 * @param gameState     The incoming state from the client
 * @param previousState The last known server state (optional, enables delta checks)
 * @param options.allowHighRisk When true, high-risk violations are accepted
 *                             (used for tests or admin overrides)
 */
export async function validateGameState(
  gameState: Record<string, unknown>,
  previousState?: Record<string, unknown>,
  options?: { skipDeltaChecks?: boolean; allowHighRisk?: boolean },
): Promise<GameStateValidation> {
  const violations: string[] = [];
  let riskLevel: GameStateValidation["riskLevel"] = "none";

  // ── Ensure Supabase config is loaded (fail-closed) ──
  const configLoad = await ensureConfigLoaded();
  if (!configLoad.ok) {
    violations.push(
      `[validateGameState] Config unavailable — refusing to validate. ` +
        `Reason: ${configLoad.error ?? "unknown"}. ` +
        `Whitelist cannot run against stale defaults.`,
    );
    riskLevel = "critical";
    return {
      isValid: false,
      violations,
      riskLevel,
      checksum: "",
    };
  }

  // ── Check money ──
  const money = Number(gameState.money) || 0;
  const limits = getGameLimits(); // DB-backed anti-cheat ceilings
  if (money < 0) {
    violations.push(`Negative money: ${money}`);
    riskLevel = "critical";
  }
  if (money > limits.maxMoney) {
    violations.push(
      `Money exceeds maximum: ${money} > ${limits.maxMoney}`,
    );
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
    if (buildings.length > limits.maxBuildings) {
      violations.push(
        `Too many buildings: ${buildings.length} > ${limits.maxBuildings}`,
      );
      riskLevel = "critical";
    }

    for (const b of buildings) {
      const building = b as Record<string, unknown>;
      const level = Number(building.level) || 1;
      if (level > limits.maxBuildingLevel) {
        violations.push(
          `Building ${building.type} has level ${level} > max ${limits.maxBuildingLevel}`,
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
  if (rp > limits.maxResearchPoints) {
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
        value > limits.maxResourceAmount
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
  if (!limits.allowedGameSpeeds.includes(gameSpeed)) {
    violations.push(
      `Invalid game speed: ${gameSpeed}. Allowed: ${limits.allowedGameSpeeds.join(", ")}`,
    );
    riskLevel = "critical";
  }

  // ── Delta checks (if previous state available) ──
  if (previousState && !options?.skipDeltaChecks) {
    const prevTick = Number(previousState.gameTick) || 0;
    const currTick = Number(gameState.gameTick) || 0;

    // Game tick should only go forward.
    // Tiered severity: small drift (< TICK_BACKWARDS_TOLERANCE) is most often a
    // legitimate stale-cache save retry or 409 retry after offline-tick advance.
    // We surface it as 'low' so a single stale-save event doesn't cascade into
    // auto-lock. Genuine rollback attacks (drift >= tolerance) still escalate to
    // 'critical' and accumulate cheat flags.
    const TICK_BACKWARDS_TOLERANCE = 100;
    if (currTick < prevTick) {
      const drift = prevTick - currTick;
      violations.push(
        `Game tick went backwards: ${currTick} < ${prevTick} (drift=${drift})`,
      );
      if (drift >= TICK_BACKWARDS_TOLERANCE) {
        riskLevel = "critical";
      } else if (riskLevel === "none" || riskLevel === "low") {
        riskLevel = "low";
      }
    }

    // Check for impossibly fast tick progression
    const prevTime = Number(previousState.lastOnlineTimestamp) || 0;
    const currTime = Number(gameState.lastOnlineTimestamp) || 0;
    if (prevTime > 0 && currTime > prevTime) {
      const elapsedSeconds = (currTime - prevTime) / 1000;
      const tickDelta = currTick - prevTick;
      if (elapsedSeconds > 0) {
        const tickRate = tickDelta / elapsedSeconds;
        if (tickRate > limits.maxTickRatePerSecond) {
          violations.push(
            `Tick rate too high: ${tickRate.toFixed(1)}/s (max: ${limits.maxTickRatePerSecond}/s)`,
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
 * Extract and validate the DB-writeable numeric fields from a game state.
 * Fails closed per RULES.md [SEC-011]: throws on missing/invalid fields
 * rather than silently substituting defaults (e.g., `|| 0`) that would
 * mask data corruption.
 *
 * Use this AFTER validateGameState() passes — it is defense-in-depth for
 * the DB write path, not a substitute for validation.
 *
 * The DB columns have CHECK constraints (e.g., money >= 0, buildings_count
 * 0..500, game_speed ∈ {1,2,5,10}). This function mirrors those bounds
 * in code so a corrupt-but-not-rejected value cannot reach the write.
 */
export interface ValidatedSaveFields {
  money: number;
  totalMoneyEarned: number;
  researchPoints: number;
  buildingsCount: number;
  gameTick: number;
  gameSpeed: number;
}

export function extractValidatedSaveFields(
  gameState: Record<string, unknown>,
): ValidatedSaveFields {
  const money = Number(gameState.money);
  if (!Number.isFinite(money) || money < 0) {
    throw new Error(
      `[extractValidatedSaveFields] money invalid: ${String(gameState.money)}`,
    );
  }

  const totalMoneyEarned = Number(gameState.totalMoneyEarned);
  if (!Number.isFinite(totalMoneyEarned) || totalMoneyEarned < 0) {
    throw new Error(
      `[extractValidatedSaveFields] totalMoneyEarned invalid: ${String(gameState.totalMoneyEarned)}`,
    );
  }

  const researchPoints = Number(gameState.researchPoints);
  if (!Number.isFinite(researchPoints) || researchPoints < 0) {
    throw new Error(
      `[extractValidatedSaveFields] researchPoints invalid: ${String(gameState.researchPoints)}`,
    );
  }

  const gameTick = Number(gameState.gameTick);
  if (!Number.isInteger(gameTick) || gameTick < 0) {
    throw new Error(
      `[extractValidatedSaveFields] gameTick invalid: ${String(gameState.gameTick)}`,
    );
  }

  const gameSpeed = Number(gameState.gameSpeed);
  if (![1, 2, 5, 10].includes(gameSpeed)) {
    throw new Error(
      `[extractValidatedSaveFields] gameSpeed invalid: ${String(gameState.gameSpeed)}`,
    );
  }

  // buildings must be an array per game state schema (may be empty for new users).
  const buildings = (gameState as Record<string, unknown>).buildings;
  if (!Array.isArray(buildings)) {
    throw new Error(
      `[extractValidatedSaveFields] buildings is not an array: ${String(buildings)}`,
    );
  }
  const buildingsCount = buildings.length;
  if (buildingsCount > 500) {
    throw new Error(
      `[extractValidatedSaveFields] buildingsCount exceeds DB CHECK (500): ${buildingsCount}`,
    );
  }

  return {
    money,
    totalMoneyEarned,
    researchPoints,
    buildingsCount,
    gameTick,
    gameSpeed,
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
      if (!getGameLimits().allowedGameSpeeds.includes(speed)) {
        return { valid: false, error: `Invalid game speed: ${speed}` };
      }
      return { valid: true };
    }
    case "hire_worker":
    case "assign_worker":
    case "upgrade_worker": {
      // Detailed validation lives in src/lib/game/serverEngine.ts
      // (validateHireWorkerAction / validateAssignWorkerAction /
      // validateUpgradeWorkerAction). Here we only ensure the payload is
      // structurally shaped (string ids present). Money/effect bounds are
      // server-side authoritative.
      if (actionType === "hire_worker" && typeof payload.workerType !== "string") {
        return { valid: false, error: "Missing workerType" };
      }
      if (
        (actionType === "assign_worker" || actionType === "upgrade_worker") &&
        typeof payload.workerId !== "string"
      ) {
        return { valid: false, error: "Missing workerId" };
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
 * Used by /api/game/state/sync POST handler when the request body matches
 * the import-save shape (explicit `import: true` flag).
 */
export async function validateImportSaveOnServer(
  saveData: Record<string, unknown>,
): Promise<{ valid: boolean; violations?: string[]; error?: string }> {
  // Apply the same bounds checks as a live save
  const validation = await validateGameState(saveData, undefined, {
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

// ─── Audit Logging ──────────────────────────────────────────────

/**
 * Log a player action to the audit table.
 * This runs asynchronously and does NOT block the response.
 *
 * Per RULES.md [SEC-011] / [ARC-011]: validate required entries at the
 * trust boundary and fail closed if missing/invalid. Postgres BIGINT
 * and NUMERIC columns reject NaN/Infinity anyway, but we want to log
 * a warning rather than silently substitute `0` for `|| 0` style
 * fallbacks at call sites that would mask corruption.
 */
export function logActionAsync(entry: AuditLogEntry): void {
  // Trust-boundary validation per RULES.md [SEC-011].
  // player_actions.game_tick is BIGINT (rejects NaN/Infinity/non-integers);
  // money_after is NUMERIC (rejects NaN/Infinity). We mirror the DB
  // constraints in code so corrupt-but-not-rejected values cannot reach
  // the insert path silently.
  if (
    !Number.isFinite(entry.gameTick) ||
    !Number.isInteger(entry.gameTick)
  ) {
    console.warn(
      `[AuditLog] Skipping action=${entry.actionType} for user=${entry.userId}: invalid gameTick=${entry.gameTick}`,
    );
    return;
  }
  if (!Number.isFinite(entry.moneyAfter)) {
    console.warn(
      `[AuditLog] Skipping action=${entry.actionType} for user=${entry.userId}: invalid moneyAfter=${entry.moneyAfter}`,
    );
    return;
  }

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

// ============================================
// Whitelist sets for game state key validation.
// Built once at module load from the static type unions in
// src/lib/game/types.ts and the data definitions in data.ts. Any
// key NOT in these sets is rejected as a critical violation —
// cheaters must not be able to inject unknown building / resource
// / worker IDs that bypass balance checks.
//
// Source of truth: src/lib/game/types.ts (ResourceType, BuildingType,
// WorkerType unions) and Supabase game_config_buildings / game_config_workers
// (loaded via configLoader.server.ts → configCache BUILDING_DEFS / WORKER_DEFS).
// ============================================

/**
 * Allowlist of valid resource keys. Derived from the `ResourceType`
 * union plus the cost-pseudo-resources (`money`, `researchPoints`,
 * `corporationPoints`) that may also appear in resource maps.
 */

/**
 * Allowlist of valid worker keys. Derived from the `WorkerType` union.
 */
