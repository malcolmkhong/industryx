/**
 * Server gameplay-state persistence boundary.
 *
 * This service owns preparation of complete payloads: UI stripping, runtime
 * schema validation, deterministic HMAC generation, and metadata writes.
 * The database module remains responsible for SQL/CAS execution.
 */

import { requireDbClient } from "@/lib/db/access";
import type { Database } from "@/lib/db/types";
import {
  initializeGuestGameState,
  saveServerGameStateOptimistic,
  upsertServerGameState,
} from "@/lib/db/game/serverGameState";
import { asFullState, stripUIFields } from "@/lib/db/game/serverGameStatePayload";
import {
  PERSISTED_GAME_STATE_SCHEMA_VERSION,
  prepareCompletePersistedPayload,
} from "./persistedGameStateContract.server";

type ServerGameStateInsert = Database["public"]["Tables"]["server_game_state"]["Insert"];
type ServerGameStateUpdate = Database["public"]["Tables"]["server_game_state"]["Update"];

export interface PersistGameStateOptions {
  /**
   * Only use when the caller has proven it is creating or materializing a
   * complete server-owned payload. Existing metadata-null rows deliberately
   * remain legacy-compatible in this foundation rollout.
   */
  markPayloadComplete?: boolean;
}

export interface LegacyPlayerProgressProjection {
  userId: string;
  displayName?: string;
  gameState: Record<string, unknown>;
}

export interface LegacyPlayerProgressProjectionResult {
  ok: boolean;
  data: unknown | null;
}

/**
 * Write the non-authoritative player_progress compatibility projection from
 * the same sanitized payload boundary as server_game_state. Projection loss
 * must never roll back a successful authoritative state write.
 */
export async function syncLegacyPlayerProgressProjection(
  projection: LegacyPlayerProgressProjection,
): Promise<LegacyPlayerProgressProjectionResult> {
  try {
    const db = requireDbClient();
    const { data, error } = await db
      .from("player_progress")
      .upsert(
        {
          user_id: projection.userId,
          ...(projection.displayName
            ? { display_name: projection.displayName }
            : {}),
          game_state: asFullState(stripUIFields(projection.gameState)),
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    return { ok: !error, data: data ?? null };
  } catch (error) {
    console.warn(
      "[serverGameStatePersistence] legacy player_progress projection failed:",
      error,
    );
    return { ok: false, data: null };
  }
}

/** Known-canonical first-state insert used by the full-state sync route. */
export function initializeCompleteServerGameState(userId: string) {
  return initializeGuestGameState(userId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function preparePersistencePatch(
  patch: ServerGameStateUpdate,
  options: PersistGameStateOptions,
): ServerGameStateUpdate {
  if (patch.full_state === undefined) return patch;
  if (!isRecord(patch.full_state)) {
    throw new Error("Full gameplay state must be a JSON object");
  }

  const prepared = prepareCompletePersistedPayload(patch.full_state);
  return {
    ...patch,
    full_state: asFullState(prepared.gameState),
    state_hash: prepared.checksum,
    // Refresh the v1 checksum for already-complete rows. For legacy rows the
    // lifecycle remains null, so this value is deliberately not treated as a
    // classification or an implicit historical migration.
    payload_checksum: prepared.checksum,
    ...(options.markPayloadComplete
      ? {
          payload_schema_version: PERSISTED_GAME_STATE_SCHEMA_VERSION,
          payload_lifecycle: "complete",
          payload_checksum: prepared.checksum,
        }
      : {}),
  };
}

/**
 * CAS persistence for normal gameplay updates. The expected state version is
 * passed through unchanged; payload schema version never participates in CAS.
 */
export function persistServerGameStateOptimistic(
  userId: string,
  expectedStateVersion: number,
  patch: ServerGameStateUpdate,
  options: PersistGameStateOptions = {},
) {
  return saveServerGameStateOptimistic(
    userId,
    expectedStateVersion,
    preparePersistencePatch(patch, options),
  );
}

/** Creates a known-complete state (canonical initialization or verified import). */
export function upsertCompleteServerGameState(
  values: ServerGameStateInsert,
) {
  if (!isRecord(values.full_state)) {
    throw new Error("Known-complete state requires an object full_state payload");
  }
  const prepared = prepareCompletePersistedPayload(values.full_state);
  return upsertServerGameState({
    ...values,
    full_state: asFullState(prepared.gameState),
    state_hash: prepared.checksum,
    payload_schema_version: PERSISTED_GAME_STATE_SCHEMA_VERSION,
    payload_lifecycle: "complete",
    payload_checksum: prepared.checksum,
  });
}
