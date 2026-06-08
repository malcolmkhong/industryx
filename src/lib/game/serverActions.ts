// ============================================
// IndustriaX: Server Action Validation
// Client-side wrapper that validates game actions
// through the server before applying them locally.
// ============================================

'use client';

import { useGameStore } from './store';

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
 * For non-logged-in users, always returns { valid: true } (local-only play).
 */
export async function submitActionToServer(
  actionType: string,
  payload: Record<string, unknown>,
): Promise<{ valid: boolean; error?: string; correctedState?: Record<string, unknown> }> {
  if (!serverValidationEnabled || !userId) {
    // Not logged in — all actions are local-only
    return { valid: true };
  }

  try {
    const state = useGameStore.getState();
    
    const res = await fetch('/api/game/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        actionType,
        payload,
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
      console.warn('[ServerAction] Rate limited, allowing action locally');
      return { valid: true };
    }

    const data = await res.json();

    if (data.valid) {
      return { valid: true, correctedState: data.correctedState };
    }

    // Action rejected by server
    return { valid: false, error: data.error || 'Action rejected by server' };
  } catch (err) {
    // Network error — allow the action locally (offline tolerance)
    console.warn('[ServerAction] Network error, allowing action locally:', err);
    return { valid: true };
  }
}

/**
 * Validate a game speed change through the server.
 * This is the most commonly abused action.
 */
export async function validateGameSpeed(speed: number): Promise<{ valid: boolean; error?: string }> {
  // Client-side pre-check
  if (![1, 2, 5, 10].includes(speed)) {
    return { valid: false, error: `Invalid game speed: ${speed}` };
  }

  return submitActionToServer('set_game_speed', { speed });
}

/**
 * Validate a build action through the server.
 */
export async function validateBuildAction(buildingType: string): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer('build', { buildingType });
}

/**
 * Validate a research action through the server.
 */
export async function validateResearchAction(researchId: string): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer('research', { researchId });
}

/**
 * Validate a sell action through the server.
 */
export async function validateSellAction(resource: string, amount: number): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer('sell_market', { resource, amount });
}

/**
 * Validate a buy action through the server.
 */
export async function validateBuyAction(resource: string, amount: number): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer('buy_market', { resource, amount });
}

/**
 * Validate an upgrade action through the server.
 */
export async function validateUpgradeAction(buildingId: string): Promise<{ valid: boolean; error?: string }> {
  return submitActionToServer('upgrade', { buildingId });
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
    const res = await fetch('/api/game/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        gameState: saveData,
      }),
    });

    if (res.status === 400) {
      const data = await res.json();
      return {
        valid: false,
        error: data.error || 'Import validation failed',
        violations: data.violations,
      };
    }

    if (res.ok) {
      return { valid: true };
    }

    return { valid: true }; // Allow on server errors
  } catch {
    return { valid: true }; // Allow on network errors
  }
}
