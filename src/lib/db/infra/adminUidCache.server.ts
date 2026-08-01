// ============================================
// IndustryaX: Admin UID Cache (Redis-backed)
//
// Caches the set of admin user IDs (from the `admin_users` table)
// so the per-request `isAdminUserIdInDb()` check doesn't hit
// the database on every admin request.
//
// Why Redis: the previous in-memory 60s TTL was per-process.
// With multiple instances behind a load balancer, an admin
// revocation only invalidated the cache on the instance that
// handled the write — the other instances continued accepting
// requests from the revoked admin for up to 60 seconds. This
// is a security concern (revoked super admins still have access
// for 60s on other instances).
//
// Vercel KV (Upstash Redis) gives us a shared cache that all
// instances read from. When an admin write happens, the
// mutation route calls `invalidateAdminUidCache()`, which
// deletes the Redis key. The next `isAdminUserIdInDb()` call
// on any instance reads fresh from the database.
//
// Cache contract:
//   • Event-driven invalidation (no periodic re-read). The cache
//     lives until `invalidateAdminUidCache()` is called.
//   • 1-hour safety-net TTL. If invalidation fails for any
//     reason (Redis restart, deploy glitch, network blip), the
//     cache self-expires within an hour. The next request
//     rebuilds.
//   • Redis is a cache, not a source of truth. If Redis is
//     down, the code falls through to a direct DB read.
//
// Tests: pass `useInMemoryCache: true` in
// `__setCacheImplementationForTests` to bypass Redis.
// ============================================

import { kv } from "@vercel/kv";

const CACHE_KEY = "cache:admin-uids:v1";
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour safety net

// ─── Test seam ──────────────────────────────────────────────────────
// When true, skip Redis and use module-local state. Set via
// `__setCacheImplementationForTests(true)` in beforeEach.
let useInMemoryCache = false;
let memoryCache: Set<string> | null = null;

export function __setCacheImplementationForTests(inMemory: boolean): void {
  useInMemoryCache = inMemory;
  memoryCache = null;
}

// ─── Read / write helpers ───────────────────────────────────────────

async function readCache(): Promise<Set<string> | null> {
  if (useInMemoryCache) {
    return memoryCache;
  }
  try {
    const raw = await kv.get<string[] | string>(CACHE_KEY);
    if (raw === null || raw === undefined) return null;
    // The Upstash SDK sometimes returns already-parsed JSON;
    // sometimes returns the raw string. Handle both.
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return new Set(arr);
  } catch (err) {
    console.error(
      "[adminUidCache] Redis read failed; falling through to DB",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

async function writeCache(uidSet: Set<string>): Promise<void> {
  if (useInMemoryCache) {
    memoryCache = new Set(uidSet);
    return;
  }
  try {
    await kv.set(CACHE_KEY, JSON.stringify(Array.from(uidSet)), {
      ex: CACHE_TTL_SECONDS,
    });
  } catch (err) {
    console.error(
      "[adminUidCache] Redis write failed; cache is now in-memory only",
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
    console.error(
      "[adminUidCache] Redis del failed; stale entry will expire via TTL",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Get the cached set of admin user IDs. Returns `null` on miss
 * (or Redis error). The caller is responsible for fetching from
 * the database and calling `setCachedAdminUids` on miss.
 */
export async function getCachedAdminUids(): Promise<Set<string> | null> {
  return readCache();
}

/**
 * Populate the cache with the full set of admin user IDs.
 * Called after a database read on cache miss.
 */
export async function setCachedAdminUids(uidSet: Set<string>): Promise<void> {
  await writeCache(uidSet);
}

/**
 * Force the next call to re-fetch. Used by admin write paths
 * (add/remove/demote via the admin UI) and by test
 * setup/teardown. Fire-and-forget: the actual `kv.del` is
 * awaited inside `clearCache`, but the caller does not need
 * to wait.
 */
export function invalidateAdminUidCache(): void {
  void clearCache();
}
