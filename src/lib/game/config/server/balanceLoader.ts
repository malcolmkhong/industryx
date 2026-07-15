// ============================================
// IndustriaX: Strict balance loader — fetches + assembles game_config_balance.
// Behavior-preserving split of the original configLoader.server.ts.
// Owns: loadCompleteBalanceFromSupabase(), refreshBalanceFromSupabase(),
// getRequiredBalanceKeyCount().
// ============================================

import { createServiceRoleClient } from '@/lib/db/access';;
import {
  applyBalanceOverrides,
  validateCompleteBalance,
  REQUIRED_BALANCE_KEYS,
  type GameBalanceConfig,
} from "@/lib/game/config/balance/balanceConfig";
import { markBalancePrimed } from "./balancePoller";
import { type BalanceLoadResult, type BalanceRow } from "./loaderTypes";

// ─── Balance Config Loading (strict, fail-closed) ────────────────────────
// The complete `game_config_balance` row set is fetched, merged into a
// single object, and validated against `GameBalanceConfig` keys. Any
// missing top-level key or field is treated as a hard failure — the game
// refuses to start until ops populates the DB. This is the post-ARC-002
// contract: code never carries playable values.

/**
 * Fetch the full `game_config_balance` table and assemble a complete
 * `GameBalanceConfig` payload. Strict: the payload must contain every
 * top-level key and every required field within each key, AND every field
 * must pass its `BALANCE_VALIDATORS` range/finiteness check.
 *
 * Returns `{ ok: false, error, errors }` on any failure. Does NOT
 * partially apply — either the whole balance is valid, or nothing changes.
 */
export async function loadCompleteBalanceFromSupabase(): Promise<BalanceLoadResult> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      ok: false,
      error: "no service-role client available",
      errors: ["[BalanceLoader] No service-role client available"],
    };
  }
  let rows: BalanceRow[];
  try {
    const { data, error } = await supabase
      .from("game_config_balance")
      .select("key, value, updated_at");
    if (error) {
      return {
        ok: false,
        error: `Supabase fetch failed: ${error.message}`,
        errors: [error.message],
      };
    }
    rows = (data ?? []) as BalanceRow[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Supabase fetch threw: ${message}`,
      errors: [message],
    };
  }

  // Assemble the complete payload from row values.
  const assembled: Record<string, unknown> = {};
  for (const row of rows) {
    assembled[row.key] = row.value;
  }

  // 1. Completeness check — every required top-level key and field present.
  const completeness = validateCompleteBalance(assembled);
  if (!completeness.valid) {
    const missing = completeness.errors
      .filter((e) => e.startsWith("missing"))
      .join("; ");
    return {
      ok: false,
      error: `game_config_balance is incomplete — ${missing}. ` +
        "Run migrations 077 (payout + endgame) and 078 (storage.maxBulkUpgradeLevels) to seed the missing rows, or populate them via admin.",
      errors: completeness.errors,
    };
  }

  // 2. Cast to GameBalanceConfig (we've just verified completeness).
  const complete = assembled as unknown as GameBalanceConfig;

  // 3. applyBalanceOverrides re-validates ranges and writes the in-process
  //    activeBalance atomically. Throws on any range/finiteness failure.
  try {
    applyBalanceOverrides(complete);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `game_config_balance failed validation: ${message}`,
      errors: [message],
    };
  }

  return { ok: true, errors: [] };
}

/** Convenience: count of required top-level balance keys.
 *  Re-exported so callers / tests can size the DB row set. */
export function getRequiredBalanceKeyCount(): number {
  return REQUIRED_BALANCE_KEYS.size;
}

/**
 * Manually trigger a fetch+apply cycle. Returns true on success (the
 * complete balance loaded and was applied). Used by instrumentation at
 * boot AND by the polling timer. On failure, the previous in-process
 * balance is preserved.
 */
export async function refreshBalanceFromSupabase(): Promise<boolean> {
  const result = await loadCompleteBalanceFromSupabase();
  if (!result.ok) {
    console.warn(
      "[BalanceLoader] Refresh failed:",
      result.error ?? "unknown",
    );
    return false;
  }
  // `balanceState.primed = true` in the original — bridge through the
  // poller module since `balanceState` is now private there.
  markBalancePrimed();
  return true;
}
