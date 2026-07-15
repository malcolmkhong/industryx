// Map fetch errors and HTTP status codes to fail-closed error messages
// for the client action submission path.

"use client";

import { disableServerValidation } from "./validationState";

/**
 * Map an HTTP status to a user-facing error message. Returns `null` when
 * the caller should fall through to the response body for the real error.
 */
export function statusToError(
  status: number,
): { valid: false; error: string } | null {
  if (status === 401) {
    // Session expired — fail closed. Do not allow local economy mutation
    // when the authenticated server path cannot validate the action.
    disableServerValidation();
    return {
      valid: false,
      error: "Session expired — sign in again to continue gameplay actions",
    };
  }
  if (status === 429) {
    return {
      valid: false,
      error: "Server is busy — please retry in a moment",
    };
  }
  return null;
}

/**
 * Map a network-level fetch failure (offline, DNS, etc.) to a fail-closed
 * error. Economy mutations must NOT be applied locally when the server
 * cannot certify them.
 */
export function networkErrorToResult(
  err: unknown,
): { valid: false; error: string } {
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

/**
 * Map a non-2xx fetch response that wasn't already handled by
 * `statusToError` (e.g., 403 ACCOUNT_LOCKED, 409 STATE_VERSION_CONFLICT,
 * 500). Reads the JSON body for `error`/`violations` if available.
 */
export async function unknownStatusToError(res: Response): Promise<{
  valid: false;
  error: string;
  violations?: string[];
}> {
  let errBody: { error?: string; violations?: string[] } = {};
  try {
    errBody = (await res.json()) as {
      error?: string;
      violations?: string[];
    };
  } catch {
    /* non-JSON body — keep generic message */
  }
  return {
    valid: false,
    error: errBody.error || `Server rejected request (HTTP ${res.status})`,
    ...(errBody.violations ? { violations: errBody.violations } : {}),
  };
}
