// ============================================
// IndustryaX: Server-Side Config Loader
// Loads GameConfig from Supabase into the in-process configCache
// so that cron validators / API routes see the same data the client sees.
//
// Architecture:
//
//   ┌────────────────────────────┐
//   │ Supabase (game_config_*)   │
//   │  + game_config_balance     │
//   └─────────────┬──────────────┘
//                 │  fetchGameConfigFromSupabase()
//                 │  + loadCompleteBalanceFromSupabase()
//                 ▼
//   ┌────────────────────────────┐
//   │ configLoader.server.ts     │ ← THIS FILE
//   │ ensureConfigLoaded()       │
//   │   + loadCompleteBalance()  │
//   │   + startBalancePoller()   │
//   └─────────────┬──────────────┘
//                 │  updateFromSupabase()        (configCache live bindings)
//                 │  applyBalanceOverrides(complete)  (balanceConfig strict)
//                 ▼
//   ┌────────────────────────────┐
//   │ configCache.ts (let-bound) │
//   │   BUILDING_DEFS,           │
//   │   RESEARCH_TREE, ...       │
//   │ activeBalance (let-bound)  │
//   │   getBalance() throws on   │
//   │   incomplete / unloaded    │
//   └─────────────┬──────────────┘
//                 │  read by:
//                 ▼
//   ┌────────────────────────────────────────────┐
//   │ - /api/cron/validate-ticks                 │
//   │ - /lib/auth/gameStateValidator (whitelist) │
//   │ - /lib/auth/guestMigrationValidator        │
//   │ - /api/market/trades/execute                          │
//   │ - /api/market/tick                         │
//   └────────────────────────────────────────────┘
//
// Server-authoritative behavior:
// - The first call from any consumer triggers a single fresh load.
// - Concurrent callers share the same promise (no thundering herd).
// - Subsequent calls within TTL return the cached promise immediately.
// - If Supabase returns critical failure (buildings/resources/recipes OR
//   incomplete balance), `ok: false` is returned and routes must fail closed.
// - NEVER throws: returns `{ ok, source, error }` and lets callers decide.
// ============================================

import {
  updateFromSupabase,
  configSource as _liveConfigSource,
} from "@/lib/game/config/configCache";
import {
  applyBalanceOverrides,
  validateCompleteBalance,
  REQUIRED_BALANCE_KEYS,
  type GameBalanceConfig,
} from "@/lib/game/config/balance/balanceConfig";
import { fetchGameConfigFromSupabase } from "@/lib/db/config/serverConfigFetcher";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Cache TTL — same as the client-side provider (5 minutes)
const CONFIG_LOADER_TTL_MS = 5 * 60 * 1000;

interface LoaderState {
  /** In-flight or completed load promise. Shared across callers. */
  promise: Promise<LoadResult> | null;
  /** When the load completed (used for TTL). 0 = not loaded yet. */
  loadedAt: number;
  /** Result of the most recent load attempt. */
  lastResult: LoadResult | null;
}

export interface LoadResult {
  /** Whether Supabase data is now bound into configCache (true) or we fell back to data.ts defaults (false). */
  ok: boolean;
  /** 'supabase' after a successful load, 'local' otherwise. */
  source: "supabase" | "local";
  /** Per-table error messages (only set when ok=false because of partial errors). */
  partialErrors: string[];
  /** Critical failure reason (only set when ok=false). */
  error?: string;
}

let state: LoaderState = {
  promise: null,
  loadedAt: 0,
  lastResult: null,
};

/**
 * Ensure configCache is loaded with fresh Supabase data.
 *
 * - Idempotent: concurrent calls share the same in-flight promise.
 * - Lazy: the very first call kicks off the load. Server boot does not
 *   trigger it — config loads on first validator invocation.
 * - TTL-bound: after CONFIG_LOADER_TTL_MS, the next call re-fetches.
 *
 * Returns a result describing whether Supabase data is active. Never throws.
 *
 * SECURITY/FAIL-CLOSED NOTE:
 * If `ok === false`, callers that depend on accurate game definitions
 * (cron anti-cheat, save validators) MUST refuse to proceed. Letting
 * them run against data.ts defaults during a Supabase outage would
 * silently weaken anti-cheat. This includes an incomplete balance — the
 * `ok` flag is false unless the FULL set of `game_config_balance` rows
 * passes both completeness and validator checks.
 */
export function ensureConfigLoaded(): Promise<LoadResult> {
  const now = Date.now();

  // Cache hit — TTL not expired, previous attempt already known
  if (state.lastResult && now - state.loadedAt < CONFIG_LOADER_TTL_MS) {
    return Promise.resolve(state.lastResult);
  }

  // Cache hit — in-flight promise exists; share it
  if (state.promise) {
    return state.promise;
  }

  // Cache miss — kick off a fresh load
  state.promise = (async (): Promise<LoadResult> => {
    try {
      const result = await fetchGameConfigFromSupabase();

      if (!result.config) {
        // Critical Supabase failure — leave configCache on empty defaults.
        // (post data.ts deletion, BUILDING_DEFS etc. start as empty objects.)
        const partialErrors = result.partialErrors;
        const error =
          partialErrors[partialErrors.length - 1] ||
          "Supabase returned no config (critical tables missing)";
        console.error(
          "[ConfigLoader] CRITICAL: Supabase config unavailable. " +
            "configCache remains on data.ts defaults. Caller must fail closed.",
          partialErrors,
        );

        const loadResult: LoadResult = {
          ok: false,
          source: "local",
          partialErrors,
          error,
        };
        state.lastResult = loadResult;
        state.loadedAt = Date.now();
        return loadResult;
      }

      // Main config tables loaded — pipe into configCache live bindings.
      updateFromSupabase(result.config);

      // Balance config is a separate concern: must be COMPLETE before any
      // route that calls getBalance() is allowed to proceed. If the DB row
      // set is missing keys/fields, we fail the whole load.
      const balanceResult = await loadCompleteBalanceFromSupabase();
      if (!balanceResult.ok) {
        const partialErrors = [
          ...result.partialErrors,
          `balance: ${balanceResult.error ?? "load failed"}`,
        ];
        const loadResult: LoadResult = {
          ok: false,
          source: "local",
          partialErrors,
          error: balanceResult.error,
        };
        state.lastResult = loadResult;
        state.lastResult.partialErrors = partialErrors;
        state.loadedAt = Date.now();
        console.error(
          "[ConfigLoader] CRITICAL: game_config_balance incomplete or invalid. " +
            "Caller must fail closed. Reason: " +
            (balanceResult.error ?? "unknown"),
        );
        return loadResult;
      }

      const loadResult: LoadResult = {
        ok: true,
        source: "supabase",
        partialErrors: result.partialErrors,
      };
      state.lastResult = loadResult;
      state.loadedAt = Date.now();

      if (result.partialErrors.length > 0) {
        console.warn(
          "[ConfigLoader] Loaded from Supabase with partial errors:",
          result.partialErrors,
        );
      } else {
        console.info("[ConfigLoader] Config loaded from Supabase OK");
      }
      return loadResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ConfigLoader] Unexpected error:", message);
      const loadResult: LoadResult = {
        ok: false,
        source: "local",
        partialErrors: [],
        error: message,
      };
      state.lastResult = loadResult;
      state.loadedAt = Date.now();
      return loadResult;
    } finally {
      // Clear in-flight so the next TTL window can re-fire a fresh load
      state.promise = null;
    }
  })();

  return state.promise;
}

/**
 * Synchronous probe — returns the current source tag without triggering a load.
 * Useful for hot paths that need to fail-closed if Supabase is not bound yet.
 *
 * Returns 'supabase' if `ensureConfigLoaded` has succeeded at least once
 * within the current TTL window. Returns 'local' otherwise (cold start OR
 * Supabase down).
 */
export function getActiveConfigSource(): "supabase" | "local" {
  return _liveConfigSource as "supabase" | "local";
}

/**
 * Test-only helper — reset the loader so the next call re-fetches.
 * NOT exported from the public API; used by integration tests.
 */
export function __resetConfigLoaderForTests(): void {
  state = { promise: null, loadedAt: 0, lastResult: null };
}

// ─── Balance Config Loading (strict, fail-closed) ────────────────────────
// The complete `game_config_balance` row set is fetched, merged into a
// single object, and validated against `GameBalanceConfig` keys. Any
// missing top-level key or field is treated as a hard failure — the game
// refuses to start until ops populates the DB. This is the post-ARC-002
// contract: code never carries playable values.

interface BalanceRow {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

export interface BalanceLoadResult {
  ok: boolean;
  /** Set when ok=false. */
  error?: string;
  /** Per-row validation errors (kept for logging). */
  errors: string[];
}

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
        "Run migration 068 to seed the missing rows, or populate them via admin.",
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

// ─── Balance Config Polling (60s) ─────────────────────────────────────────
// Hot-reloads the COMPLETE balance every BALANCE_POLL_INTERVAL_MS. Unlike
// the old incremental approach, we always re-fetch the full set: a partial
// set is a hard failure, so the new payload must be complete before it can
// replace the in-process balance. Failures keep the previous values.

export const BALANCE_POLL_INTERVAL_MS = 60_000;

interface BalancePollState {
  /** setInterval handle (null when not polling). */
  timer: ReturnType<typeof setInterval> | null;
  /** Whether the poller has done at least one full fetch. */
  primed: boolean;
}

const balanceState: BalancePollState = {
  timer: null,
  primed: false,
};

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
  balanceState.primed = true;
  return true;
}

/**
 * Start the 60s polling timer. Idempotent — calling twice is a no-op.
 * Returns a function that stops the poller (useful for tests).
 */
export function startBalancePoller(): () => void {
  if (balanceState.timer) {
    return () => stopBalancePoller();
  }
  balanceState.timer = setInterval(() => {
    void refreshBalanceFromSupabase().catch((err) => {
      console.warn(
        "[BalanceLoader] Poll tick failed:",
        err instanceof Error ? err.message : String(err),
      );
    });
  }, BALANCE_POLL_INTERVAL_MS);
  // Don't keep the Node.js process alive solely for this timer.
  if (typeof balanceState.timer === "object" && balanceState.timer && "unref" in balanceState.timer) {
    (balanceState.timer as { unref: () => void }).unref();
  }
  return () => stopBalancePoller();
}

export function stopBalancePoller(): void {
  if (balanceState.timer) {
    clearInterval(balanceState.timer);
    balanceState.timer = null;
  }
}

/** Test-only: reset all balance poller state. */
export function __resetBalancePollerForTests(): void {
  stopBalancePoller();
  balanceState.primed = false;
}
