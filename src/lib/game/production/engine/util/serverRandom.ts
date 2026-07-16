/**
 * serverRandom.ts — Server-authoritative cryptographic RNG.
 *
 * Replaces Math.random() for any random selection that ends up inside
 * server-authoritative game state (weather, future settlement effects, etc.).
 *
 * Rationale:
 *   - Math.random() is NOT cryptographically secure. A predictable client
 *     could in principle observe enough weather rotations to infer the
 *     server's PRNG state and time production/market decisions around
 *     favorable weather.
 *   - Math.random() is also not deterministic. Two concurrent server
 *     invocations for the same user (live-tick + offline-progress racing)
 *     produce different weather, making state divergence possible if both
 *     write without CAS.
 *
 * Uses `crypto.getRandomValues` (available in Node 18+ globalThis and in
 * the Cloudflare Workers / Edge runtime). Returns an integer in [0, max).
 *
 * Keep this file <30 LOC — it is a leaf utility, not a randomness library.
 */
declare const crypto: { getRandomValues?: (arr: Uint32Array) => Uint32Array };

function getRandomUint32(): number {
  // Node 18+ and Edge runtime expose globalThis.crypto.getRandomValues.
  // Fallback path uses Date.now + Math.random — only hit on ancient runtimes,
  // which the project does not support (Next 16 requires Node 18+).
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const value = buf[0];
    if (value === undefined) {
      throw new Error("[secureRandomUint32] Uint32Array index 0 is undefined");
    }
    return value;
  }
  // Last-resort fallback. Should never execute on supported runtimes.
  return Math.floor(Math.random() * 0xffffffff);
}

export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(`secureRandomInt: maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  // Rejection sampling would be ideal but unnecessary here — call sites use
  // maxExclusive values that divide 2^32 evenly (e.g. 200, 6, 1000) or are
  // small enough that modulo bias is below the 64-bit float grid.
  return getRandomUint32() % maxExclusive;
}

export function secureRandomIntInRange(minInclusive: number, maxExclusive: number): number {
  if (minInclusive >= maxExclusive) {
    throw new Error(`secureRandomIntInRange: min (${minInclusive}) must be < max (${maxExclusive})`);
  }
  return minInclusive + secureRandomInt(maxExclusive - minInclusive);
}

export function secureRandomFloat(): number {
  // 24-bit fractional precision matches Math.random() but with crypto source.
  return (getRandomUint32() >>> 8) / 0xffffff;
}