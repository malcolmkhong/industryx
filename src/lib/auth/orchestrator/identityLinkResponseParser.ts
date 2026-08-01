/**
 * Runtime parser for the link-only identity routes.
 *
 * These endpoints never produce gameplay bootstrap state. A successful
 * confirmation only instructs the caller to invoke the canonical bootstrap
 * owner afterwards.
 */

type UnknownRecord = Record<string, unknown>;

export interface IdentityLinkPreviewPlayer {
  user_id: string;
  display_name: string;
  money: number;
  total_money_earned: number;
  game_tick: number;
  buildings_count: number;
  is_guest: boolean;
}

export interface IdentityLinkPreview {
  guest: IdentityLinkPreviewPlayer;
  google: IdentityLinkPreviewPlayer;
}

export type IdentityLinkResponse =
  | { kind: "no_guest_to_link" }
  | {
      kind: "confirmation_required";
      operationId: string;
      preview: IdentityLinkPreview;
      riskScore: number;
      expiresAt: string;
    }
  | {
      kind: "confirmed";
      status: "OK_EXISTING" | "OK_CREATED" | "OK_ARCHIVED_GUEST";
      receiptId: string | null;
      survivingUserId: string | null;
      archivedUserId: string | null;
    }
  | {
      kind: "failure";
      code: string;
      error: string;
      retryable: boolean;
      survivingUserId: string | null;
      archivedUserId: string | null;
    };

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOptionalNullableString(
  value: unknown,
): value is string | null | undefined {
  return value === undefined || isNullableString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPreviewPlayer(value: unknown): value is IdentityLinkPreviewPlayer {
  if (!isRecord(value)) return false;
  return (
    typeof value.user_id === "string" &&
    typeof value.display_name === "string" &&
    isFiniteNumber(value.money) &&
    isFiniteNumber(value.total_money_earned) &&
    isFiniteNumber(value.game_tick) &&
    isFiniteNumber(value.buildings_count) &&
    typeof value.is_guest === "boolean"
  );
}

function isPreview(value: unknown): value is IdentityLinkPreview {
  return (
    isRecord(value) &&
    isPreviewPlayer(value.guest) &&
    isPreviewPlayer(value.google)
  );
}

/** Parses untrusted JSON returned by identity link endpoints. */
export function parseIdentityLinkResponse(
  value: unknown,
): IdentityLinkResponse | null {
  if (!isRecord(value) || typeof value.code !== "string") return null;

  if (
    value.code === "LINK_NO_GUEST_TO_LINK" &&
    value.linked === true &&
    value.reason === "no_guest_to_link" &&
    value.bootstrapRequired === false
  ) {
    return { kind: "no_guest_to_link" };
  }

  if (
    value.code === "LINK_CONFIRMATION_REQUIRED" &&
    value.conflict === true &&
    typeof value.operationId === "string" &&
    value.operationId.length > 0 &&
    isPreview(value.preview) &&
    isFiniteNumber(value.riskScore) &&
    typeof value.expiresAt === "string" &&
    value.expiresAt.length > 0 &&
    value.bootstrapRequired === false
  ) {
    return {
      kind: "confirmation_required",
      operationId: value.operationId,
      preview: value.preview,
      riskScore: value.riskScore,
      expiresAt: value.expiresAt,
    };
  }

  if (
    (value.code === "OK_EXISTING" ||
      value.code === "OK_CREATED" ||
      value.code === "OK_ARCHIVED_GUEST") &&
    value.success === true &&
    value.bootstrapRequired === true &&
    isNullableString(value.receiptId) &&
    isOptionalNullableString(value.survivingUserId) &&
    isOptionalNullableString(value.archivedUserId)
  ) {
    return {
      kind: "confirmed",
      status: value.code,
      receiptId: value.receiptId,
      survivingUserId: value.survivingUserId ?? null,
      archivedUserId: value.archivedUserId ?? null,
    };
  }

  if (
    typeof value.error === "string" &&
    typeof value.retryable === "boolean" &&
    value.bootstrapRequired === false &&
    isOptionalNullableString(value.survivingUserId) &&
    isOptionalNullableString(value.archivedUserId)
  ) {
    return {
      kind: "failure",
      code: value.code,
      error: value.error,
      retryable: value.retryable,
      survivingUserId: value.survivingUserId ?? null,
      archivedUserId: value.archivedUserId ?? null,
    };
  }

  return null;
}

/**
 * Applies the HTTP-status half of the link-only response contract. A proxy or
 * stale compatibility handler cannot relabel a typed conflict or recovery as
 * a successful link response.
 */
export function parseIdentityLinkHttpResponse(
  status: number,
  value: unknown,
): IdentityLinkResponse | null {
  const parsed = parseIdentityLinkResponse(value);
  if (!parsed) return null;

  if (
    parsed.kind === "no_guest_to_link" ||
    parsed.kind === "confirmation_required" ||
    parsed.kind === "confirmed"
  ) {
    return status === 200 ? parsed : null;
  }

  const expectedStatusByCode: Record<string, number> = {
    INVALID_BOOTSTRAP_REQUEST: 400,
    LINK_OPERATION_EXPIRED: 400,
    INVALID_SESSION: 401,
    ACCOUNT_LOCKED: 403,
    ACCOUNT_PROGRESS_CONFLICT: 409,
    DEVICE_BOUND_TO_OTHER_USER: 409,
    LINK_OPERATION_NOT_PENDING: 409,
    STATE_RECOVERY_REQUIRED: 422,
    BOOTSTRAP_RATE_LIMITED: 429,
    LINK_OPERATION_NOT_FOUND: 404,
    BOOTSTRAP_UNAVAILABLE: 503,
    INTERNAL_BOOTSTRAP_ERROR: 500,
  };
  return expectedStatusByCode[parsed.code] === status ? parsed : null;
}
