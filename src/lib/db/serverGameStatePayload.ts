// ============================================
// serverGameStatePayload — typed DB payload helpers.
// ============================================
//
// Phase 13 (2026-07-10, Option C): the `full_state` JSONB column in
// `server_game_state` is now known to contain PURE ServerGameData.
// UI fields (hydrated, activeTab, selectedBuilding, notifications,
// productionSnapshot) are STRIPPED before persistence and never appear.
//
// This module provides typed helpers that:
//   1. Convert ServerGameData (or sanitized Record<string, unknown>)
//      to the JSONB-typed DB payload
//   2. Parse DB row snapshots back to ServerGameData safely
//   3. Strip UI fields defensively, defense-in-depth
//
// The `as never` pattern was previously used everywhere. That's gone.
// ============================================

import type { ServerGameData } from "@/lib/game/shared/types/types";
import type { Json } from "@/lib/db/types";

export type { Json };

/** UI field names that MUST NEVER appear in server_game_state.full_state. */
export const SERVER_STATE_UI_FIELDS = [
  "hydrated",
  "activeTab",
  "selectedBuilding",
  "notifications",
  "productionSnapshot",
] as const;

export type ServerStateUIField = (typeof SERVER_STATE_UI_FIELDS)[number];

/**
 * Strip UI fields from an untyped game-state-like object. Used at
 * every persistence boundary (state/route.ts, migrate-guest, etc.)
 * as defense-in-depth — even if a stale client sends UI fields, the
 * server refuses to persist them.
 *
 * Returns a NEW object; does not mutate `input`.
 */
export function stripUIFields(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if ((SERVER_STATE_UI_FIELDS as readonly string[]).includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Coerce a ServerGameData-shaped value to the JSONB column type used by
 * PostgREST inserts. The DB column types declare fields like
 * `buildings: Json`, `resources: Json`, `full_state: Json`. TypeScript's
 * PostgREST codegen treats `Json` as `string | number | boolean | null
 * | { [key: string]: Json | undefined } | Json[]`.
 *
 * In practice, all our values ARE JSON-serializable, so `Json` is
 * structurally a superset. This typed helper documents the intent
 * at every call site instead of the opaque `as never`.
 */
export function asFullState(value: unknown): Json {
  // We intentionally trust the input. Schema validation happens at the
  // API boundary (validateGameState in /api/game/state/sync) and is NOT
  // duplicated here — this helper is purely a typed alternative to
  // the `as never` cast that previously appeared everywhere.
  return value as Json;
}

/**
 * Type a DB row's `full_state` snapshot as ServerGameData. Use at the
 * read boundary (e.g., `loadServerGameStateLite`) where the result
 * is consumed by a server-side validator.
 */
export function asServerGameData(value: unknown): ServerGameData {
  // We intentionally cast through unknown. The actual schema check
  // happens via validateGameState() at the API boundary. TypeScript
  // can only verify the shape here.
  return value as ServerGameData;
}
