// ============================================
// IndustriaX: Server Action Validation
// Client-side wrapper that validates game actions
// through the server before applying them locally.
// ============================================

"use client";

import { useGameStore } from "./store";

// Track whether server validation is enabled and working
let serverValidationEnabled = false;
let userId: string | null = null;

/**
 * Initialize server action validation for a logged-in user.
 */
export function initServerValidation(uid: string) {
  userId = uid;
  serverValidationEnabled = true;
}

/**
 * Disable server action validation (on logout).
 */
export function disableServerValidation() {
  userId = null;
  serverValidationEnabled = false;
}

/**
 * Check if server validation is active.
 */
export function isServerValidationActive(): boolean {
  return serverValidationEnabled && !!userId;
}

/**
 * Submit a game action to the server for validation.
 * Returns { valid: true } if the action is approved,
 * or { valid: false, error: string } if rejected.
 *
 * Phase 2.3: `requestId` is REQUIRED for replay protection. Server stores
 * the last 100 requestIds and rejects duplicates with HTTP 409.
 *
 * For non-logged-in users, always returns { valid: true } (local-only play).
 */
export async function submitActionToServer(
  actionType: string,
  payload: Record<string, unknown>,
  requestId?: string,
): Promise<{
  valid: boolean;
  error?: string;
  correctedState?: Record<string, unknown>;
}> {
  if (!serverValidationEnabled || !userId) {
    // Not logged in — all actions are local-only
    return { valid: true };
  }

  try {
    const state = useGameStore.getState();

    const res = await fetch("/api/game/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        actionType,
        payload,
        requestId, // Phase 2.3: forward nonce for server replay detection
        gameState: {
          money: state.money,
          totalMoneyEarned: state.totalMoneyEarned,
          gameTick: state.gameTick,
          buildings: state.buildings,
          resources: state.resources,
          researchPoints: state.researchPoints,
          completedResearch: state.completedResearch,
          workers: state.workers,
          gameSpeed: state.gameSpeed,
        },
      }),
    });

    if (res.status === 401) {
      // Session expired — disable validation, allow local play
      serverValidationEnabled = false;
      return { valid: true }; // Don't block gameplay on auth issues
    }

    if (res.status === 429) {
      // Rate limited — allow the action but log warning
      console.warn("[ServerAction] Rate limited, allowing action locally");
      return { valid: true };
    }

    const data = await res.json();

    if (data.valid) {
      // Server may return a server-authoritative post-action `correctedState`.
      // Surface it to callers so they can apply exactly what the server
      // persisted, instead of computing cost/deductions locally.
      const serverCorrected =
        typeof data.correctedState === "object" && data.correctedState !== null
          ? (data.correctedState as Record<string, unknown>)
          : undefined;
      return {
        valid: true,
        correctedState: serverCorrected as
          | {
              money?: number;
              buildings?: unknown[];
              resources?: Record<string, number>;
              resourceCapacity?: Record<string, number>;
              storageUpgradeLevels?: Record<string, number>;
              workers?: unknown[];
              totalMoneyEarned?: number;
              pendingPayout?: number;
              researchPoints?: number;
              quests?: unknown[];
              prestigeState?: { corporationPoints?: number } & Record<
                string,
                unknown
              >;
              contracts?: unknown[];
              lastDailyClaim?: number;
              loginStreak?: unknown;
            }
          | undefined,
      };
    }

    // Action rejected by server
    return { valid: false, error: data.error || "Action rejected by server" };
  } catch (err) {
    // Network error — BLOCK the action. Fail-closed: cheaters must not
    // be able to disconnect from the network to bypass server validation.
    // The client may keep playing locally via the offline-tolerance path
    // in the Zustand store, but the server-validated path refuses to
    // certify the action. UI surfaces this as a soft warning.
    console.warn("[ServerAction] Network error, blocking action:", err);
    return {
      valid: false,
      error: "Network error — action blocked (server unreachable)",
    };
  }
}

/**
 * Validate a game speed change through the server.
 * This is the most commonly abused action.
 */
export async function validateGameSpeed(
  speed: number,
  requestId?: string,
): Promise<{ valid: boolean; error?: string }> {
  // Client-side pre-check
  if (![1, 2, 5, 10].includes(speed)) {
    return { valid: false, error: `Invalid game speed: ${speed}` };
  }

  return submitActionToServer("set_game_speed", { speed }, requestId);
}

/**
 * Validate a build action through the server.
 */
export async function validateBuildAction(
  buildingType: string,
  requestId?: string,
): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer("build", { buildingType }, requestId);
}

/**
 * Validate a research action through the server.
 */
export async function validateResearchAction(
  researchId: string,
  requestId?: string,
): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer("research", { researchId }, requestId);
}

/**
 * Validate a sell action through the server.
 */
export async function validateSellAction(
  resource: string,
  amount: number,
  requestId?: string,
): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer("sell_market", { resource, amount }, requestId);
}

/**
 * Validate a buy action through the server.
 */
export async function validateBuyAction(
  resource: string,
  amount: number,
  requestId?: string,
): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer("buy_market", { resource, amount }, requestId);
}

/**
 * Validate an upgrade action through the server.
 */
export async function validateUpgradeAction(
  buildingId: string,
  requestId?: string,
): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer("upgrade", { buildingId }, requestId);
}

/**
 * Validate an import save through the server.
 * Returns validated state or rejection.
 */
export async function validateImportSave(
  saveData: Record<string, unknown>,
): Promise<{ valid: boolean; error?: string; violations?: string[] }> {
  if (!serverValidationEnabled || !userId) {
    return { valid: true }; // Local-only play
  }

  try {
    // We validate the import by attempting to save it to the server
    const res = await fetch("/api/game/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        gameState: saveData,
      }),
    });

    if (res.status === 400) {
      const data = (await res.json()) as {
        error?: string;
        violations?: string[];
      };
      return {
        valid: false,
        error: data.error || "Import validation failed",
        violations: data.violations,
      };
    }

    if (res.ok) {
      return { valid: true };
    }

    // Server returned a non-OK status that wasn't already handled above
    // (e.g., 403 ACCOUNT_LOCKED, 409 STATE_VERSION_CONFLICT, 500).
    // Fail-closed: do NOT certify the import. Caller surfaces the error.
    let errBody: { error?: string } = {};
    try {
      errBody = (await res.json()) as { error?: string };
    } catch {
      /* non-JSON body — keep generic message */
    }
    return {
      valid: false,
      error: errBody.error || `Server rejected import (HTTP ${res.status})`,
    };
  } catch (err) {
    // Network error — fail-closed. Imports that can't be validated
    // server-side MUST NOT be applied. Same principle as submitActionToServer.
    console.warn("[ServerAction] Import network error, blocking import:", err);
    return {
      valid: false,
      error: "Network error — import blocked (server unreachable)",
    };
  }
}
