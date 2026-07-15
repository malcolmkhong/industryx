// ============================================
// IndustriaX: Server Action Validation
// Client-side wrapper that validates game actions
// through the server before applying them locally.
// ============================================

"use client";

import type { ServerGameData } from "@/lib/game/shared/types/types";
import { actionEndpoint } from "./endpoints";
import {
  networkErrorToResult,
  statusToError,
  unknownStatusToError,
} from "./errorMapper";
import { buildActionRequestBody } from "./requestBuilder";
import { parseActionResponse } from "./responseParser";
import {
  getCurrentUserId,
  isServerValidationActive,
} from "./validationState";

export {
  disableServerValidation,
  initServerValidation,
  isServerValidationActive,
} from "./validationState";

export async function submitActionToServer(
  actionType: string,
  payload: Record<string, unknown>,
  requestId?: string,
): Promise<{
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
}> {
  const currentUserId = getCurrentUserId();
  if (!isServerValidationActive() || !currentUserId) {
    // Not logged in - all actions are local-only.
    return { valid: true };
  }

  try {
    const res = await fetch(actionEndpoint(actionType), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildActionRequestBody(currentUserId, actionType, payload, requestId),
      ),
    });

    const mappedStatus = statusToError(res.status);
    if (mappedStatus) return mappedStatus;

    if (!res.ok) {
      return unknownStatusToError(res);
    }

    return parseActionResponse(
      (await res.json()) as {
        valid: boolean;
        error?: string;
        correctedState?: unknown;
      },
    );
  } catch (err) {
    return networkErrorToResult(err);
  }
}

/**
 * Validate a game speed change through the server.
 * This is the most commonly abused action.
 */
export function validateGameSpeed(
  speed: number,
  requestId?: string,
): Promise<{ valid: boolean; error?: string }> {
  // Client-side pre-check.
  if (![1, 2, 5, 10].includes(speed)) {
    return Promise.resolve({
      valid: false,
      error: `Invalid game speed: ${speed}`,
    });
  }

  return submitActionToServer("set_game_speed", { speed }, requestId);
}

/**
 * Validate a build action through the server.
 */
export function validateBuildAction(
  buildingType: string,
  requestId?: string,
): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer("build", { buildingType }, requestId);
}

/**
 * Validate a research action through the server.
 */
export function validateResearchAction(
  researchId: string,
  requestId?: string,
): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer("research", { researchId }, requestId);
}

/**
 * Validate a sell action through the server.
 */
export function validateSellAction(
  resource: string,
  amount: number,
  requestId?: string,
): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer("sell_market", { resource, amount }, requestId);
}

/**
 * Validate a buy action through the server.
 */
export function validateBuyAction(
  resource: string,
  amount: number,
  requestId?: string,
): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer("buy_market", { resource, amount }, requestId);
}

/**
 * Validate an upgrade action through the server.
 */
export function validateUpgradeAction(
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
  const currentUserId = getCurrentUserId();
  if (!isServerValidationActive() || !currentUserId) {
    return { valid: true }; // Local-only play.
  }

  try {
    // We validate the import by attempting to save it to the server.
    const res = await fetch("/api/game/state/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUserId,
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

    // Server returned a non-OK status that was not already handled above
    // (e.g. 403 ACCOUNT_LOCKED, 409 STATE_VERSION_CONFLICT, 500).
    // Fail-closed: do NOT certify the import. Caller surfaces the error.
    let errBody: { error?: string } = {};
    try {
      errBody = (await res.json()) as { error?: string };
    } catch {
      /* non-JSON body - keep generic message */
    }
    return {
      valid: false,
      error: errBody.error || `Server rejected import (HTTP ${res.status})`,
    };
  } catch (err) {
    // Network error - fail-closed. Imports that cannot be validated
    // server-side MUST NOT be applied. Same principle as submitActionToServer.
    console.warn("[ServerAction] Import network error, blocking import:", err);
    return {
      valid: false,
      error: "Network error - import blocked (server unreachable)",
    };
  }
}
