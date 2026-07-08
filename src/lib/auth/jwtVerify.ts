// ============================================
// JWT Verify — Phase 5.5 Step 4 (JWT Trust)
//
// Local JWT signature verification for Supabase access tokens. Avoids the
// 150-300ms Supabase auth.getUser() round-trip on every authenticated
// API call.
//
// What this does:
//   1. Reads the Supabase auth cookie(s) from the request passed in.
//   2. Verifies the signature against the JWKS cached in jwksCache.
//   3. Returns userId + email on success.
//
// What this does NOT do:
//   - Does NOT check the session in the Supabase DB (no live revocation).
//     Supabase tokens default to 1h lifetime; worst-case revocation lag
//     equals that. Acceptable for an idle game.
//   - Does NOT handle refresh tokens. If the access token is expired and
//     no refresh cookie is present, we return EXPIRED and the caller falls
//     back to the full Supabase flow.
//   - Does NOT trust any token whose `iss` doesn't match the Supabase URL
//     or whose `exp` is in the past (with 5s tolerance for clock skew).
//
// Failure modes → AuthVerifyResult.valid = false with a specific reason
// so verifyAuth.ts can decide whether to fall through to Supabase or
// return 401 immediately.
// ============================================

import { jwtVerify } from "jose";
import type { JWK } from "jose";

import { getKeyByKid } from "./jwksCache";
import type { NextRequest } from "next/server";

const SUPABASE_PROJECT_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://wkkzqtseqwcyyyezroqq.supabase.co";

// Cookie name pattern used by @supabase/ssr: sb-{projectRef}-auth-token
// For large tokens Supabase splits across numbered chunks (.0, .1, ...).
function getCookieKeys(): { base: string; projectRef: string } {
  const url = SUPABASE_PROJECT_URL;
  let projectRef = "";
  try {
    projectRef = new URL(url).hostname.split(".")[0];
  } catch {
    /* ignore */
  }
  return {
    base: projectRef ? `sb-${projectRef}-auth-token` : "",
    projectRef,
  };
}

export type VerifyFailureReason =
  | "MISSING_TOKEN"
  | "EXPIRED"
  | "INVALID_SIGNATURE"
  | "INVALID_CLAIMS"
  | "UNSUPPORTED_ALG"
  | "JWKS_ERROR"
  | "MALFORMED";

export type AuthVerifyResult =
  | { valid: true; userId: string; email?: string; expiresAt: number }
  | { valid: false; reason: VerifyFailureReason };

/**
 * Extract the access token from a NextRequest's cookie jar.
 * Handles both the single-cookie and chunked-cookie patterns used by
 * @supabase/ssr. Cookie values are either:
 *   - raw JWT (rare; mostly dev/SSR-only paths), or
 *   - base64url of { "access_token": "...", "refresh_token": "...", ... }
 *     which is what the production cookie store writes.
 */
function extractAccessToken(req: NextRequest): string | null {
  const { base } = getCookieKeys();
  if (!base) return null;
  const jar = req.cookies;

  const direct = jar.get(base)?.value;
  if (direct) return decodeAccessToken(direct);

  const chunks: string[] = [];
  for (let i = 0; i < 16; i++) {
    const v = jar.get(`${base}.${i}`)?.value;
    if (v) chunks.push(v);
    else break;
  }
  if (chunks.length === 0) return null;
  return decodeAccessToken(chunks.join(""));
}

function decodeAccessToken(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  // Raw JWT — three dot-separated segments
  if (v.startsWith("ey") && v.split(".").length === 3) return v;
  // StoredCookie (base64url-encoded JSON)
  try {
    const parsed = JSON.parse(Buffer.from(v, "base64url").toString("utf8")) as {
      access_token?: string;
    };
    return parsed.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Main entrypoint. Tries to verify the JWT from the request's cookies
 * using locally cached JWKS. Returns a structured result; never throws.
 */
export async function tryLocalVerify(
  req: NextRequest,
): Promise<AuthVerifyResult> {
  let token: string | null;
  try {
    token = extractAccessToken(req);
  } catch {
    return { valid: false, reason: "MISSING_TOKEN" };
  }
  if (!token) return { valid: false, reason: "MISSING_TOKEN" };

  // Header → kid + alg
  const segments = token.split(".");
  if (segments.length !== 3 || !segments[0]) {
    return { valid: false, reason: "MALFORMED" };
  }
  let header: { kid?: string; alg?: string };
  try {
    header = JSON.parse(
      Buffer.from(segments[0], "base64url").toString("utf8"),
    ) as { kid?: string; alg?: string };
  } catch {
    return { valid: false, reason: "MALFORMED" };
  }
  if (!header.kid) return { valid: false, reason: "MALFORMED" };
  if (!header.alg || header.alg === "none") {
    return { valid: false, reason: "UNSUPPORTED_ALG" };
  }

  let jwk: JWK | null;
  try {
    jwk = await getKeyByKid(header.kid);
  } catch {
    return { valid: false, reason: "JWKS_ERROR" };
  }
  if (!jwk) return { valid: false, reason: "JWKS_ERROR" };

  try {
    const { payload } = await jwtVerify(token, jwk as JWK, {
      issuer: SUPABASE_PROJECT_URL,
      // Supabase tokens do not set an aud claim; do not enforce one.
      clockTolerance: 5,
      algorithms: [header.alg],
    });

    const sub = payload.sub;
    const exp = payload.exp;
    if (typeof sub !== "string" || sub.length === 0) {
      return { valid: false, reason: "INVALID_CLAIMS" };
    }
    if (typeof exp !== "number") {
      return { valid: false, reason: "INVALID_CLAIMS" };
    }

    return {
      valid: true,
      userId: sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      expiresAt: exp,
    };
  } catch (err) {
    // jose errors carry a stable `code` prefix (e.g. ERR_JWT_EXPIRED). Match
    // on code first, fall back to message substring.
    const code: string =
      (err as { code?: string; name?: string } | null)?.code ?? "";
    if (code === "ERR_JWT_EXPIRED") {
      return { valid: false, reason: "EXPIRED" };
    }
    if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
      // Could be issuer/audience/required claim mismatch.
      return { valid: false, reason: "INVALID_CLAIMS" };
    }
    if (
      code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" ||
      code === "ERR_JWS_INVALID"
    ) {
      return { valid: false, reason: "INVALID_SIGNATURE" };
    }
    const msg = err instanceof Error ? err.message : String(err);
    const m = msg.toLowerCase();
    if (m.includes("exp")) {
      return { valid: false, reason: "EXPIRED" };
    }
    if (m.includes("signature")) {
      return { valid: false, reason: "INVALID_SIGNATURE" };
    }
    if (m.includes("iss") || m.includes("issuer") || m.includes("aud")) {
      return { valid: false, reason: "INVALID_CLAIMS" };
    }
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }
}
