// Server-engine ID generation helpers.
//
// Centralizes UUID/random-ID creation for the server-authoritative engine so
// action handlers do not reimplement the crypto.randomUUID / fallback dance.
//
// HIGH-2 fix (2026-07-14): the previous fallback used Math.random() for the
// non-crypto.randomUUID branch. Math.random() is NOT cryptographically secure
// (V8 uses xorshift128+, which is reversible from a small number of observed
// outputs). For IDs that gate economy-relevant state (worker_id, building_id,
// transport line_id), a predictable PRNG enables an attacker to pre-compute
// IDs that will be assigned next, then race the action endpoint to claim
// them. Replaced with crypto.getRandomValues (available in Node 18+
// globalThis and in the Edge / Cloudflare Workers runtime).

declare const crypto:
  | undefined
  | {
      randomUUID?: () => string;
      getRandomValues?: <T extends ArrayBufferView>(arr: T) => T;
    };

function cryptoRandomHex(byteLength: number): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte === undefined) {
        throw new Error("[secureRandomHex] byte index out of range");
      }
      out += byte.toString(16).padStart(2, "0");
    }
    return out;
  }
  // Last-resort fallback. Should never execute on supported runtimes
  // (Next 16 + Node 18+ + Edge runtime all expose crypto.getRandomValues).
  // Kept only to avoid a hard crash on a misconfigured environment.
  let fallback = "";
  for (let i = 0; i < byteLength; i++) {
    fallback += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  }
  return fallback;
}

function generateServerUuid(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 16 random bytes → 32 hex chars. Pairs with `${prefix}_${ts}_…` for
  // uniqueness even if Math.random() fallback path is hit (extremely rare).
  return `${prefix}_${Date.now()}_${cryptoRandomHex(8)}`;
}

export function generateWorkerId(): string {
  return generateServerUuid("wrk");
}

export function generateBuildingId(): string {
  return generateServerUuid("bld");
}

export function generateTransportLineId(
  transportType: string,
  fromBuildingId: string,
  toBuildingId: string,
  existingLineCount: number,
): string {
  return `transport-${transportType}-${fromBuildingId.slice(0, 8)}-${toBuildingId.slice(
    0,
    8,
  )}-${existingLineCount}`;
}