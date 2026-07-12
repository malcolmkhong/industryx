// Fingerprint Helper
// Lightweight client fingerprint using @fingerprintjs/fingerprintjs
// Phase 1 — Foundation (Storage + Audit)
//
// IMPORTANT: fingerprint is for CORRELATION ONLY.
// It is NEVER used for bans, locks, or recovery denial.
// The fingerprint value is a stable hash of browser/device signals; it is not
// personally identifiable on its own.
//
// Phase 2 — Structured result: returns { status, reason, value? } so the
// orchestrator can surface the WHY behind a missing fingerprint, not just
// "unknown". Reasons let the server (and future analytics) answer questions
// like "is Brave causing 90% of failures?".

import FingerprintJS from "@fingerprintjs/fingerprintjs";

const CACHE_KEY = "factory-dominion-fingerprint";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const COMPUTE_TIMEOUT_MS = 2000;

/**
 * Sentinel sent to the server when the browser could not produce a fingerprint.
 * Distinct from the legacy literal "unknown" (still rejected with 400 by
 * /api/auth/guest/quickstart) — this string tells the route "I know fingerprint
 * is missing, fall through to deviceId-only dedupe".
 */
export const FINGERPRINT_UNAVAILABLE = "__fingerprint_unavailable__";

export type FingerprintReason =
  "blocked" | "timeout" | "network" | "unsupported" | "unknown";

export type FingerprintResult =
  | { status: "available"; value: string }
  | { status: "unavailable"; reason: FingerprintReason };

interface CachedFingerprint {
  value: string;
  cachedAt: number;
}

let inFlightPromise: Promise<FingerprintResult> | null = null;

/**
 * Read the cached fingerprint from localStorage. Returns null if absent or expired.
 */
function readCache(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFingerprint;
    if (
      typeof parsed.value !== "string" ||
      typeof parsed.cachedAt !== "number"
    ) {
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
  if (typeof window === "undefined") return;
  try {
    const entry: CachedFingerprint = { value, cachedAt: Date.now() };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage may be full or disabled; not fatal
  }
}

/**
 * Classify a thrown error into a FingerprintReason. Best-effort:
 * - timeout     → our 2s race timer fired
 * - network     → fetch / DNS / connection failed
 * - blocked     → CSP / extension blocked the SDK load
 * - unsupported → API missing (very old browser, no crypto)
 * - unknown     → fallback
 */
function classifyError(err: unknown): FingerprintReason {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("fingerprint_timeout") || msg.includes("timeout"))
    return "timeout";
  if (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("Failed to fetch")
  ) {
    return "network";
  }
  if (
    msg.includes("CSP") ||
    msg.includes("Refused") ||
    msg.includes("blocked")
  ) {
    return "blocked";
  }
  if (msg.includes("undefined") || msg.includes("not a function")) {
    return "unsupported";
  }
  return "unknown";
}

/**
 * Compute the fingerprint using @fingerprintjs/fingerprintjs.
 * Wrapped in a Promise.race to enforce a hard 2-second timeout.
 * Returns a structured FingerprintResult.
 *
 * The result is de-duplicated via a single in-flight promise: concurrent calls
 * share the same computation.
 */
async function computeFingerprint(): Promise<FingerprintResult> {
  if (inFlightPromise) return inFlightPromise;

  inFlightPromise = (async (): Promise<FingerprintResult> => {
    try {
      const fpPromise = FingerprintJS.load().then((agent) => agent.get());
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("fingerprint_timeout")),
          COMPUTE_TIMEOUT_MS,
        );
      });
      const result = await Promise.race([fpPromise, timeoutPromise]);
      // result is FingerprintJS.GetResult; extract visitorId
      if (
        typeof result === "object" &&
        result !== null &&
        "visitorId" in result
      ) {
        const value = String((result as { visitorId: unknown }).visitorId);
        if (value && value !== "unknown") {
          return { status: "available", value };
        }
      }
      return { status: "unavailable", reason: "unknown" };
    } catch (err) {
      console.warn(
        "[Fingerprint] compute failed:",
        err instanceof Error ? err.message : "unknown error",
      );
      return { status: "unavailable", reason: classifyError(err) };
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

/**
 * Get the fingerprint, using the localStorage cache when available.
 * Returns a structured result.
 */
export async function getFingerprintResult(): Promise<FingerprintResult> {
  if (typeof window === "undefined") {
    return { status: "unavailable", reason: "unsupported" };
  }
  const cached = readCache();
  if (cached) return { status: "available", value: cached };
  const result = await computeFingerprint();
  if (result.status === "available") {
    writeCache(result.value);
  }
  return result;
}

/**
 * Legacy string-returning wrapper. Returns:
 *   - a real visitorId when available
 *   - FINGERPRINT_UNAVAILABLE sentinel when the browser could not produce one
 *   - the literal "unknown" only for SSR (no window)
 *
 * New code should prefer getFingerprintResult() so the reason is preserved.
 */
export async function getFingerprint(): Promise<string> {
  if (typeof window === "undefined") {
    return "unknown";
  }
  const result = await getFingerprintResult();
  return result.status === "available" ? result.value : FINGERPRINT_UNAVAILABLE;
}
