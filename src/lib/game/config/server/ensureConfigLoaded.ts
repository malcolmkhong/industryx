// ============================================
// IndustriaX: ensureConfigLoaded — main config loader (idempotent, TTL-bound)
// Behavior-preserving split of the original configLoader.server.ts.
// Owns: CONFIG_LOADER_TTL_MS, LoaderState, ensureConfigLoaded(),
// getActiveConfigSource(), __resetConfigLoaderForTests().
// ============================================

import {
  updateFromSupabase,
  configSource as _liveConfigSource,
} from "@/lib/game/config/configCache";
import { fetchGameConfigFromSupabase } from "@/lib/db/config/serverConfigFetcher";
import { loadCompleteBalanceFromSupabase } from "./balanceLoader";
import { type LoadResult } from "./loaderTypes";

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
