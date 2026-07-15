// ============================================
// IndustriaX: API Authentication Helper
// Verifies Supabase session — Phase 5.5: JWT Trust fast path.
//
// On the happy path (request carries a valid Supabase cookie) we verify the
// JWT signature locally using JWKS cached in jwksCache. This skips the
// ~150-300ms Supabase auth.getUser() round-trip on every authenticated API
// call.
//
// On any fast-path failure we fall through to the existing Supabase flow, so
// security guarantees are preserved (fail-closed on every error path).
//
// Backwards compatible: passing no argument uses the original Supabase-only
// path. New callers can pass `request: NextRequest` to opt into the fast
// path. All 50+ existing call sites still compile and behave the same.
// ============================================

import { createClient } from '@/lib/db/access';;
import { NextResponse, type NextRequest } from "next/server";

import { tryLocalVerify } from "./jwtVerify";

export interface AuthResult {
  success: true;
  userId: string;
  email?: string;
}

export interface AuthError {
  success: false;
  response: NextResponse;
}

/**
 * Verify that the request comes from an authenticated user.
 *
 * Usage (legacy, no fast path):
 *   const auth = await verifyAuth();
 *
 * Usage (Phase 5.5+ fast path):
 *   const auth = await verifyAuth(request);
 *
 * Behavior:
 *   - If a request is passed AND a valid Supabase cookie is present:
 *       verify the JWT signature locally (~1-5ms), return the user.
 *   - Else (no req, no cookie, signature mismatch, expired token, JWKS issue):
 *       fall through to `supabase.auth.getUser()`.
 *   - If Supabase also fails: return 401 like before.
 */
export async function verifyAuth(
  request?: NextRequest,
): Promise<AuthResult | AuthError> {
  // ── Phase 5.5 fast path ────────────────────────────────────────────
  if (request) {
    try {
      const local = await tryLocalVerify(request);
      if (local.valid) {
        return {
          success: true,
          userId: local.userId,
          email: local.email,
        };
      }
      // Fall through on any failure. We deliberately do NOT cache the
      // outcome so repeat callers with refreshed cookies still benefit.
    } catch (err) {
      // Local verify must never escalate into an auth bypass. Log and
      // continue to the slow path.
      console.warn("[Auth] Local JWT verify threw, falling back:", err);
    }
  }

  // ── Original Supabase path (slow but authoritative) ────────────────
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.warn("[Auth] Session verification failed:", error.message);
      return {
        success: false,
        response: NextResponse.json(
          { error: "Authentication required", code: "AUTH_REQUIRED" },
          { status: 401 },
        ),
      };
    }

    if (!user) {
      console.warn("[Auth] No user found in session");
      return {
        success: false,
        response: NextResponse.json(
          { error: "Authentication required", code: "AUTH_REQUIRED" },
          { status: 401 },
        ),
      };
    }

    return {
      success: true,
      userId: user.id,
      email: user.email,
    };
  } catch (err) {
    console.error("[Auth] Unexpected error during verification:", err);
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Authentication service unavailable",
          code: "AUTH_SERVICE_ERROR",
        },
        { status: 503 },
      ),
    };
  }
}

/**
 * Verify that the authenticated user matches the requested userId.
 * This prevents users from accessing other players' data.
 *
 * Phase 5.5: also accepts an optional request for the fast path.
 */
export async function verifyAuthAndOwnership(
  requestUserId: string,
  request?: NextRequest,
): Promise<AuthResult | AuthError> {
  const auth = await verifyAuth(request);

  if (!auth.success) return auth;

  if (auth.userId !== requestUserId) {
    console.warn(
      `[Auth] User ${auth.userId} attempted to access data for ${requestUserId}`,
    );
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "You can only access your own data",
          code: "FORBIDDEN_OWNERSHIP",
        },
        { status: 403 },
      ),
    };
  }

  return auth;
}
