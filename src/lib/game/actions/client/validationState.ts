// Server validation state (shared by serverActions.ts and errorMapper.ts).
// Kept in its own module to avoid circular imports between the action
// orchestrator and the error mapper.

"use client";

let serverValidationEnabled = false;
let userId: string | null = null;
let deviceId: string | null = null;

/**
 * Initialize server action validation for a logged-in user.
 */
export function initServerValidation(uid: string, did?: string | null) {
  userId = uid;
  deviceId = did ?? null;
  serverValidationEnabled = true;
}

/**
 * Disable server action validation (on logout or session expiry).
 */
export function disableServerValidation() {
  userId = null;
  deviceId = null;
  serverValidationEnabled = false;
}

/**
 * Check if server validation is active.
 */
export function isServerValidationActive(): boolean {
  return serverValidationEnabled && !!userId;
}

/**
 * Get the current userId (or null when no user is bound).
 * Used by the action request builder.
 */
export function getCurrentUserId(): string | null {
  return userId;
}

export function getCurrentDeviceId(): string | null {
  return deviceId;
}
