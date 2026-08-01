// Fingerprint Helper
// Lightweight client fingerprint using @fingerprintjs/fingerprintjs
// Phase 1 — Foundation (Storage + Audit)
//
// IMPORTANT: fingerprint is for CORRELATION ONLY.
// It is NEVER used for bans, locks, or recovery denial.
// The fingerprint value is a stable hash of browser/device signals; it is not
// personally identifiable on its own.

import FingerprintJS from '@fingerprintjs/fingerprintjs';

const CACHE_KEY = 'factory-dominion-fingerprint';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const COMPUTE_TIMEOUT_MS = 2000;

interface CachedFingerprint {
  value: string;
  cachedAt: number;
}

let inFlightPromise: Promise<string> | null = null;

/**
 * Read the cached fingerprint from localStorage. Returns null if absent or expired.
 */
function readCache(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFingerprint;
    if (typeof parsed.value !== 'string' || typeof parsed.cachedAt !== 'number') {
      return null;
    }
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

/**
 * Write the fingerprint to localStorage with a TTL timestamp.
 */
function writeCache(value: string): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: CachedFingerprint = { value, cachedAt: Date.now() };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage may be full or disabled; not fatal
  }
}

/**
 * Compute the fingerprint using @fingerprintjs/fingerprintjs.
 * Wrapped in a Promise.race to enforce a hard 2-second timeout.
 * Returns 'unknown' on any failure (timeout, error, SSR, etc.).
 *
 * The result is de-duplicated via a single in-flight promise: concurrent calls
 * share the same computation.
 */
async function computeFingerprint(): Promise<string> {
  if (inFlightPromise) return inFlightPromise;

  inFlightPromise = (async () => {
    try {
      const fpPromise = FingerprintJS.load().then((agent) => agent.get());
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('fingerprint_timeout')), COMPUTE_TIMEOUT_MS),
      );
      const result = await Promise.race([fpPromise, timeoutPromise]);
      // result is FingerprintJS.GetResult; extract visitorId
      if (typeof result === 'object' && result !== null && 'visitorId' in result) {
        return String(result.visitorId);
      }
      return 'unknown';
    } catch (err) {
      console.warn(
        '[Fingerprint] compute failed:',
        err instanceof Error ? err.message : 'unknown error',
      );
      return 'unknown';
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

/**
 * Get the fingerprint, using the localStorage cache when available.
 * Returns 'unknown' if the cache is empty and computation fails or times out.
 */
export async function getFingerprint(): Promise<string> {
  if (typeof window === 'undefined') {
    return 'unknown';
  }
  const cached = readCache();
  if (cached) return cached;
  const value = await computeFingerprint();
  if (value !== 'unknown') {
    writeCache(value);
  }
  return value;
}
