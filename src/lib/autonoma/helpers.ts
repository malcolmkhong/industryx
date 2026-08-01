/**
 * Autonoma test-data — shared factory helpers.
 *
 * PK-derivation, ref-record shaping, user_id helpers. Reused by every
 * factory file in this folder so each stays tight and scannable.
 */

import { createServiceRoleClient } from "@/lib/db/access";
import { shortIdFor, textIdFor, uuidFor } from "./tokenKeys";

export { shortIdFor, textIdFor, uuidFor };

/** Stable, uuid-shaped user_id for a recipe-supplied logical user. The
 *  salt-by-testRunId means two concurrent runs of "standard" scenario
 *  get disjoint user_ids and never collide on
 *  server_game_state.user_id / admin_users.user_id / etc. */
const userUuidCache = new Map<string, string>();

export function userUuidFor(testRunId: string, logicalUserId: string): string {
  const key = `${testRunId}::${logicalUserId}`;
  const cached = userUuidCache.get(key);
  if (cached) return cached;
  const u = uuidFor(testRunId, `user:${logicalUserId}`);
  userUuidCache.set(key, u);
  return u;
}

/** Run-scoped text PK (e.g. `bld-iron_mine-7f3a1b2c`). */
export function rid(ctx: { testRunId: string }, prefix: string): string {
  return textIdFor(ctx.testRunId, prefix);
}

/** Run-scoped uuid PK (used for tables whose PK column is uuid). */
export function runUuid(ctx: { testRunId: string }, label: string): string {
  return uuidFor(ctx.testRunId, label);
}

/** Wrap an inserted record for the SDK's `ref`. */
export function ref(record: Record<string, unknown>) {
  return record;
}

/** Throws a typed error if the service-role client isn't configured —
 *  the SDK turns this into a 500 with a clear cause. */
export function requireDb() {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    throw new Error("[autonoma] service-role Supabase client not configured");
  }
  return supabase;
}

/** Common not-null upsert helper. The DB columns vary per factory, so
 *  callers assemble the patch and pass it through. */
export async function upsertById<T extends Record<string, unknown>>(
  table: string,
  values: Record<string, unknown>,
  conflictKey: string,
  selectColumn: string,
): Promise<{ id: string }> {
  const supabase = requireDb();
  const { data, error } = await supabase
    .from(table)
    .upsert(values, { onConflict: conflictKey })
    .select(selectColumn)
    .single();
  if (error) throw new Error(`[autonoma] ${table}: ${error.message}`);
  const row = data as Record<string, unknown> | null;
  if (!row) throw new Error(`[autonoma] ${table}: empty upsert result`);
  return { id: String(row[selectColumn] ?? row.id ?? "") };
}