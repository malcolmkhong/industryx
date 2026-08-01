import { createHmac, timingSafeEqual } from "crypto";

import type { ServerGameData } from "@/lib/game/shared/types/types";
import {
  stripUIFields,
  type ServerStateUIField,
} from "@/lib/db/game/serverGameStatePayload";
import { isValidServerGameData } from "./serverGameDataSchema";

export const PERSISTED_GAME_STATE_SCHEMA_VERSION = 1;

export const PERSISTED_PAYLOAD_LIFECYCLES = [
  "bootstrap_pending",
  "complete",
  "legacy_unverified",
  "recovery_required",
] as const;

export type PersistedPayloadLifecycle =
  (typeof PERSISTED_PAYLOAD_LIFECYCLES)[number];

export interface PersistedPayloadMetadata {
  payload_schema_version: number | null | undefined;
  payload_lifecycle: string | null | undefined;
  payload_checksum: string | null | undefined;
}

export type RawPersistedPayloadClassification =
  | { kind: "bootstrap_pending" }
  | { kind: "complete"; gameState: ServerGameData }
  | { kind: "legacy_unverified"; reason: string }
  | { kind: "recovery_required"; reason: string };

const CHECKSUM_SECRET = process.env.CHECKSUM_SECRET;
if (!CHECKSUM_SECRET) {
  throw new Error(
    "[FATAL] CHECKSUM_SECRET must be set. Persisted gameplay state cannot be authenticated without it.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isExactBootstrapPending(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    value.bootstrap_pending === true
  );
}

/**
 * Canonical JSON is a recursive, key-sorted serialization. Unlike JSON.stringify
 * with a top-level replacer, nested objects are covered by the HMAC too.
 */
export function serializeCanonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Persisted payload contains a non-finite number");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(serializeCanonicalJson).join(",")}]`;
  if (!isRecord(value)) throw new Error(`Persisted payload contains non-JSON value: ${typeof value}`);

  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serializeCanonicalJson(value[key])}`)
    .join(",")}}`;
}

export function generatePersistedPayloadChecksum(
  payload: Record<string, unknown>,
): string {
  if (!CHECKSUM_SECRET) {
    throw new Error(
      "[SECURITY] CHECKSUM_SECRET is required for persisted gameplay state",
    );
  }
  return createHmac("sha256", CHECKSUM_SECRET)
    .update(serializeCanonicalJson(payload))
    .digest("hex");
}

export function verifyPersistedPayloadChecksum(
  payload: Record<string, unknown>,
  checksum: string,
): boolean {
  if (!CHECKSUM_SECRET || !/^[a-f0-9]{64}$/i.test(checksum)) return false;
  const expected = generatePersistedPayloadChecksum(payload);
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(checksum, "hex"),
  );
}

export function prepareCompletePersistedPayload(
  value: Record<string, unknown>,
): {
  gameState: ServerGameData;
  checksum: string;
  removedUiFields: readonly ServerStateUIField[];
} {
  const removedUiFields = Object.keys(value).filter(
    (key): key is ServerStateUIField =>
      (
        [
          "hydrated",
          "activeTab",
          "selectedBuilding",
          "notifications",
          "productionSnapshot",
        ] as const
      ).includes(key as ServerStateUIField),
  );
  const payload = stripUIFields(value);
  if (!isValidServerGameData(payload)) {
    throw new Error(
      "Persisted payload is not a complete ServerGameData v1 snapshot",
    );
  }

  return {
    gameState: payload,
    checksum: generatePersistedPayloadChecksum(payload),
    removedUiFields,
  };
}

/**
 * Classifies the raw JSONB value before any canonical template is merged.
 * It deliberately treats metadata-less historical rows as legacy rather than
 * corruption: this foundation batch must not force existing players into recovery.
 */
export function classifyRawPersistedPayload(
  fullState: unknown,
  metadata: PersistedPayloadMetadata,
): RawPersistedPayloadClassification {
  if (isExactBootstrapPending(fullState)) return { kind: "bootstrap_pending" };

  if (metadata.payload_lifecycle === "complete") {
    if (
      metadata.payload_schema_version !== PERSISTED_GAME_STATE_SCHEMA_VERSION
    ) {
      return {
        kind: "recovery_required",
        reason: "unsupported_payload_schema_version",
      };
    }
    if (!isRecord(fullState) || !isValidServerGameData(fullState)) {
      return { kind: "recovery_required", reason: "invalid_complete_payload" };
    }
    if (
      !metadata.payload_checksum ||
      !verifyPersistedPayloadChecksum(fullState, metadata.payload_checksum)
    ) {
      return { kind: "recovery_required", reason: "payload_checksum_mismatch" };
    }
    return { kind: "complete", gameState: fullState };
  }

  if (metadata.payload_lifecycle === "recovery_required") {
    return { kind: "recovery_required", reason: "persisted_recovery_required" };
  }
  if (metadata.payload_lifecycle === "legacy_unverified") {
    return { kind: "legacy_unverified", reason: "persisted_legacy_unverified" };
  }
  if (metadata.payload_lifecycle === "bootstrap_pending") {
    return {
      kind: "recovery_required",
      reason: "invalid_bootstrap_pending_payload",
    };
  }
  if (
    metadata.payload_lifecycle !== null &&
    metadata.payload_lifecycle !== undefined
  ) {
    return { kind: "recovery_required", reason: "unknown_payload_lifecycle" };
  }
  return { kind: "legacy_unverified", reason: "metadata_not_yet_classified" };
}
