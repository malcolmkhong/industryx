// ============================================
// IndustryaX: GameConfig Cache (Redis-backed)
//
// Unified cache for the full `GameConfig` (buildings, recipes,
// market, weather, research, workers, transport, automation,
// prestige, ranks, quests, daily rewards, events, mega projects,
// game config, balance, production chains). This is the data
// that the existing per-process 5-minute TTL caches were
// guarding — `ensureConfigLoaded.ts`, `configCache.ts`, and
// the admin investigations `configLoader.ts`.
//
// Why a single shared cache: the previous design had THREE
// independent 5-minute caches for the SAME data, with NO shared
// invalidation. An admin config edit would invalidate the
// canonical state cache, but the action-side and investigations
// caches kept serving stale config for up to 5 minutes per
// instance. With multiple instances behind a load balancer, the
// staleness window was up to 5 min × N instances.
//
// This module:
//
//   • Stores the full `FetchConfigResult` in Redis under
//     `cache:game-config:v1`.
//   • Provides `invalidateGameConfigCache()` for the admin
//     config write path (wired in `tableRows.ts`).
//   • Has a 1-hour safety-net TTL: if invalidation fails for any
//     reason, the cache self-expires within an hour.
//   • Falls through to a direct `fetchGameConfigFromSupabase()`
//     call on Redis error. The game keeps working.
//   • Exposes `__setCacheImplementationForTests(true)` to bypass
//     Redis in unit tests.
//
// Callsite model: callers call `getCachedGameConfig()`, which
// returns either the cached value (stringified JSON in Redis
// decoded back to `FetchConfigResult`) or a fresh value. The
// caller is responsible for any side effects (e.g. updating the
// live `configCache` bindings).
// ============================================

import { kv } from "@vercel/kv";
import type { FetchConfigResult } from "@/lib/db/config/serverConfigFetcher";
import { fetchGameConfigFromSupabase } from "@/lib/db/config/serverConfigFetcher";

const CACHE_KEY = "cache:game-config:v1";
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour safety net

// ─── Test seam ──────────────────────────────────────────────────────
// When true, skip Redis and use module-local state. Set via
// `__setCacheImplementationForTests(true)` in beforeEach.
let useInMemoryCache = false;
let memoryCache: FetchConfigResult | null = null;

/**
 * Test-only seam. Production code never sets this. Set to `true`
 * to bypass Redis (use the in-memory cache); set to `false` to
 * use Redis. Both modes call `invalidateGameConfigCache()` to
 * clear the cache.
 */
export function __setCacheImplementationForTests(
  inMemory: boolean,
): void {
  useInMemoryCache = inMemory;
  memoryCache = null;
}

// ─── Read / write helpers ───────────────────────────────────────────

async function readCache(): Promise<FetchConfigResult | null> {
  if (useInMemoryCache) {
    return memoryCache;
  }
  try {
    const raw = await kv.get<FetchConfigResult | string>(CACHE_KEY);
    if (raw === null || raw === undefined) return null;
    // The Upstash SDK sometimes returns already-parsed JSON;
    // sometimes returns the raw string. Handle both.
    if (typeof raw === "string") {
      return JSON.parse(raw) as FetchConfigResult;
    }
    return raw;
  } catch (err) {
    // Redis is down / unreachable. Log once and fall through
    // to the DB read. The next request will retry the cache.
    console.error(
      "[gameConfigCache] Redis read failed; falling through to DB",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

async function writeCache(result: FetchConfigResult): Promise<void> {
  if (useInMemoryCache) {
    memoryCache = result;
    return;
  }
  try {
    await kv.set(
      CACHE_KEY,
      JSON.stringify(result),
      { ex: CACHE_TTL_SECONDS },
    );
  } catch (err) {
    // Non-fatal: the next request will try the cache again, and
    // the in-memory copy is still valid for this process.
    console.error(
      "[gameConfigCache] Redis write failed; cache is now in-memory only",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function clearCache(): Promise<void> {
  if (useInMemoryCache) {
    memoryCache = null;
    return;
  }
  try {
    await kv.del(CACHE_KEY);
  } catch (err) {
    // Best-effort. Even if Redis is down, the 1-hour TTL
    // ensures the stale entry expires eventually.
    console.error(
      "[gameConfigCache] Redis del failed; stale entry will expire via TTL",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Get the cached `FetchConfigResult`, falling through to a fresh
 * Supabase read on miss or Redis error.
 *
 * The returned object is a deep clone of the cached value so
 * callers can safely mutate it without leaking across requests.
 * (The Redis payload is JSON-parsed, so the returned object is
 * already a fresh copy at the top level, but nested objects
 * may still share references with the source — callers should
 * not mutate in place.)
 */
export async function getCachedGameConfig(): Promise<FetchConfigResult> {
  const cached = await readCache();
  if (cached) {
    return cached;
  }
  // Miss (or Redis down). Read fresh from the database.
  const fresh = await fetchGameConfigFromSupabase();
  await writeCache(fresh);
  return fresh;
}

/**
 * Force the next call to re-fetch. Used by admin config writes
 * (via `tableRows.ts`) and by test setup/teardown to prevent
 * cross-test cache pollution.
 *
 * Fire-and-forget: the actual `kv.del` is awaited inside
 * `clearCache`, but the caller (e.g. `tableRows.ts`) does not
 * need to wait. The invalidation is idempotent and best-effort:
 * even if Redis is down, the 1-hour TTL ensures the stale entry
 * expires eventually.
 */
export function invalidateGameConfigCache(): void {
  void clearCache();
}
