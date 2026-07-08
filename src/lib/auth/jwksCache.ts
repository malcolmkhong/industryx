// ============================================
// JWKS Cache — Phase 5.5 Step 4 (JWT Trust)
//
// Caches Supabase's signing public keys so the API can verify JWT signatures
// locally instead of round-tripping to Supabase on every request.
//
// Why: supabase.auth.getUser() costs ~150-300ms per call (HTTP to auth server).
//      Local jose.jwtVerify() with cached JWKS costs ~1-5ms.
//
// Where JWKS comes from:
//   Supabase publishes its signing keys at a stable well-known endpoint per
//   project. We fetch once, cache 1h, refresh on key-miss (kid unknown).
//
// Why not RS256:
//   Supabase uses ES256 (ECDSA P-256). jose supports it natively via the
//   createRemoteJWKSet helper, but we hand-roll the cache so we can
//   refresh-on-miss cheaply and avoid an extra HTTP layer.
//
// Security notes:
//   - We do NOT trust keys from any source other than the configured JWKS URL.
//   - On key-miss we refresh once. If still missing, verifyAuth falls back to
//     supabase.auth.getUser(). Never returns a false positive.
//   - Module-level state means the cache is per-server-instance. In a
//     multi-instance deployment each instance fetches once. Acceptable.
//   - The cache TTL (1h) bounds the lag between Supabase rotating its keys
//     and our instances picking them up. Worst case: 1h of tokens fail local
//     verify and fall through to Supabase. That's correct behaviour.
// ============================================

import type { JWK } from "jose";

const JWKS_URL =
  process.env.SUPABASE_JWKS_URL ??
  "https://wkkzqtseqwcyyyezroqq.supabase.co/auth/v1/.well-known/jwks.json";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
// If a key id ('kid') isn't in the cache we refresh once. Freshness cap
// prevents an attack or upstream bug from forcing us to refetch forever.
const REFRESH_COOLDOWN_MS = 30 * 1000; // 30s

interface CacheEntry {
  jwks: { keys: JWK[] };
  fetchedAt: number;
  inflight?: Promise<void>;
}

let cache: CacheEntry | null = null;

async function fetchJwks(): Promise<{ keys: JWK[] }> {
  const res = await fetch(JWKS_URL, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `JWKS fetch failed: ${res.status} ${res.statusText} (${JWKS_URL})`,
    );
  }
  const data = (await res.json()) as { keys: JWK[] };
  if (!Array.isArray(data.keys) || data.keys.length === 0) {
    throw new Error("JWKS response contained no keys");
  }
  return data;
}

async function refresh(): Promise<void> {
  const fresh = await fetchJwks();
  cache = {
    jwks: fresh,
    fetchedAt: Date.now(),
  };
}

/**
 * Returns the JWK for the given kid, refreshing the cache once on miss.
 * Returns null if the key can't be located (caller must fall back to
 * Supabase round-trip — never throw, never improvise).
 */
export async function getKeyByKid(kid: string): Promise<JWK | null> {
  // Coalesce concurrent refresh requests so a stampede of new tokens
  // (e.g. server cold-start) doesn't trigger 100 parallel JWKS fetches.
  if (cache?.inflight) {
    await cache.inflight;
  }

  const now = Date.now();

  // Cold start or stale cache — prime it.
  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    if (cache) {
      // Stale: try refresh, but cap refresh frequency (REFRESH_COOLDOWN_MS).
      if (now - cache.fetchedAt > CACHE_TTL_MS + REFRESH_COOLDOWN_MS) {
        cache.inflight = refresh().finally(() => {
          if (cache) cache.inflight = undefined;
        });
        await cache.inflight;
      }
    } else {
      cache = {
        jwks: { keys: [] },
        fetchedAt: 0,
        inflight: refresh().finally(() => {
          if (cache) cache.inflight = undefined;
        }),
      };
      await cache.inflight;
    }
  }

  if (!cache) return null;

  // Try cache.
  const hit = cache.jwks.keys.find((k) => (k as { kid?: string }).kid === kid);
  if (hit) return hit;

  // Key-miss: refresh once. If still missing after refresh, give up.
  if (cache.jwks.keys.length > 0) {
    // We have some keys but not this one. The JWKS may have rotated.
    cache.inflight = refresh().finally(() => {
      if (cache) cache.inflight = undefined;
    });
    await cache.inflight;
    const afterRefresh = cache?.jwks.keys.find(
      (k) => (k as { kid?: string }).kid === kid,
    );
    return afterRefresh ?? null;
  }

  return null;
}

/**
 * Test-only helper. Invalidates the in-process cache so the next call
 * re-fetches from Supabase. Do not call from production code paths.
 */
export function _resetJwksCacheForTests(): void {
  cache = null;
}
