/**
 * Runtime trust boundary for POST /api/auth/bootstrap.
 *
 * The route returns JSON, so TypeScript response types alone cannot prove that
 * a ready response contains a complete, usable server-authoritative state.
 */

import { isValidServerGameData } from "@/lib/game/state/persistence/serverGameDataSchema";
import type { BootstrapResponseBody, BootstrapSource } from "./types";

export { isValidServerGameData } from "@/lib/game/state/persistence/serverGameDataSchema";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || isNullableString(value);
}

function isBootstrapSource(value: unknown): value is BootstrapSource {
  return value === "deviceId" || value === "auth" || value === "fresh" || value === "sign_out_to_guest";
}

function validMetadata(value: UnknownRecord): { message?: string; retryable?: boolean } | null {
  if (value.message !== undefined && typeof value.message !== "string") return null;
  if (value.retryable !== undefined && typeof value.retryable !== "boolean") return null;
  return {
    ...(typeof value.message === "string" ? { message: value.message } : {}),
    ...(typeof value.retryable === "boolean" ? { retryable: value.retryable } : {}),
  };
}

/** The canonical route status paired with each discriminated response code. */
export function expectedBootstrapHttpStatus(
  body: BootstrapResponseBody,
): number {
  switch (body.code) {
    case "BOOTSTRAP_READY":
      return 200;
    case "INVALID_BOOTSTRAP_REQUEST":
      return 400;
    case "INVALID_SESSION":
      return 401;
    case "ACCOUNT_PROGRESS_CONFLICT":
    case "DEVICE_BOUND_TO_OTHER_USER":
      return 409;
    case "STATE_RECOVERY_REQUIRED":
      return 422;
    case "BOOTSTRAP_RATE_LIMITED":
      return 429;
    case "BOOTSTRAP_UNAVAILABLE":
      return 503;
    case "INTERNAL_BOOTSTRAP_ERROR":
      return 500;
    default: {
      const exhaustive: never = body;
      void exhaustive;
      return 500;
    }
  }
}

/** Parses untrusted bootstrap JSON. Invalid responses intentionally become null. */
export function parseBootstrapResponse(value: unknown): BootstrapResponseBody | null {
  if (!isRecord(value) || typeof value.code !== "string") return null;
  const metadata = validMetadata(value);
  if (!metadata) return null;

  switch (value.code) {
    case "BOOTSTRAP_READY":
      if (typeof value.userId !== "string" || value.userId.length === 0
        || typeof value.isGuest !== "boolean" || typeof value.isNewUser !== "boolean"
        || !isBootstrapSource(value.source) || value.hasGameState !== true
        || value.needsStateLoad !== false || !isValidServerGameData(value.gameState)
        || !isOptionalNullableString(value.archiveReceiptId) || !isOptionalNullableString(value.archivedGuestId)) return null;
      return { ...metadata, code: value.code, userId: value.userId, isGuest: value.isGuest,
        isNewUser: value.isNewUser, source: value.source, hasGameState: true,
        needsStateLoad: false, gameState: value.gameState as unknown as Record<string, unknown>,
        archiveReceiptId: value.archiveReceiptId ?? null, archivedGuestId: value.archivedGuestId ?? null };
    case "ACCOUNT_PROGRESS_CONFLICT":
    case "DEVICE_BOUND_TO_OTHER_USER":
      if (typeof value.conflictReason !== "string" || !isNullableString(value.survivingUserId)
        || !isNullableString(value.archivedGuestId)) return null;
      return { ...metadata, code: value.code, conflictReason: value.conflictReason,
        survivingUserId: value.survivingUserId, archivedGuestId: value.archivedGuestId };
    case "STATE_RECOVERY_REQUIRED":
      return { ...metadata, code: value.code };
    case "BOOTSTRAP_RATE_LIMITED":
    case "BOOTSTRAP_UNAVAILABLE":
    case "INTERNAL_BOOTSTRAP_ERROR":
    case "INVALID_BOOTSTRAP_REQUEST":
    case "INVALID_SESSION":
      return { ...metadata, code: value.code };
    default:
      return null;
  }
}

/**
 * Parses an HTTP response from the canonical bootstrap producer. The body and
 * HTTP status must agree; a proxy or compatibility wrapper cannot make a
 * success payload look valid behind the wrong status code.
 */
export function parseBootstrapHttpResponse(
  status: number,
  value: unknown,
): BootstrapResponseBody | null {
  const parsed = parseBootstrapResponse(value);
  return parsed && expectedBootstrapHttpStatus(parsed) === status ? parsed : null;
}

/**
 * Parses the canonical envelope returned by a compatibility wrapper. The
 * wrapper's own legacy fields are intentionally ignored at this trust
 * boundary; gameplay may use only the validated canonical result.
 */
export function parseBootstrapCompatibilityEnvelope(
  status: number,
  value: unknown,
): BootstrapResponseBody | null {
  if (!isRecord(value)) return null;
  return parseBootstrapHttpResponse(status, value.bootstrap);
}
