/**
 * Shared admin authentication utility for API routes.
 * Verifies the user's session and checks admin status against the admin_users
 * Supabase table (with ADMIN_UIDS env var as bootstrap fallback).
 *
 * Iteration 2 of the Database Centralization migration (2026-06-20):
 * The admin_users query logic and 60s in-memory cache have moved to
 * `@/lib/db/admin/admins`. This file re-exports them under the original names
 * (isAdminUserId, isAdminUserDb, clearAdminCache) to preserve the existing
 * public API and avoid breaking every call site.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  isAdminUserIdInEnv as _isAdminUserIdInEnv,
  isAdminUserIdInDb as _isAdminUserIdInDb,
  clearAdminCache as _clearAdminCache,
} from "@/lib/db/admin/admins";

export interface AdminUser {
  id: string;
  email: string | undefined;
}

/**
 * Synchronous bootstrap check against ADMIN_UIDS env var.
 * Used in hot paths where async DB call is not feasible (and as fallback
 * when the DB is unreachable). For authoritative admin checks, use verifyAdmin.
 */
export function isAdminUserId(userId: string): boolean {
  return _isAdminUserIdInEnv(userId);
}

/**
 * Authoritative async admin check. Queries the admin_users table with an
 * in-memory cache (1-minute TTL). Falls back to ADMIN_UIDS env var if the DB
 * is unreachable (bootstrap / outage resilience).
 */
export async function isAdminUserDb(userId: string): Promise<boolean> {
  return _isAdminUserIdInDb(userId);
}

export function clearAdminCache(): void {
  _clearAdminCache();
}

/**
 * Check whether the currently authenticated user (per request cookies) is an
 * admin. Returns false if not authenticated or not an admin.
 *
 * Single source of truth for "is the current user an admin" — uses the
 * authoritative admin_users table via the cache, with ADMIN_UIDS env as
 * bootstrap fallback. Client components should call this through the
 * /api/auth/session/me endpoint (which uses this helper internally) rather than
 * importing server-only Supabase client directly.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return false;
    return _isAdminUserIdInDb(user.id);
  } catch (err) {
    console.warn('[Auth] isCurrentUserAdmin check failed:', err);
    return false;
  }
}

/**
 * Verify that the current request is from an authenticated admin user.
 * Returns the admin user info on success, or a NextResponse error on failure.
 */
export async function verifyAdmin(): Promise<
  { admin: AdminUser } | { error: NextResponse }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        error: NextResponse.json(
          { error: "Unauthorized", message: "No valid session found" },
          { status: 401 }
        ),
      };
    }

    // M7 FIX: authoritative admin check via admin_users table (with env var fallback).
    const isAdmin = await isAdminUserDb(user.id);
    if (!isAdmin) {
      return {
        error: NextResponse.json(
          { error: "Forbidden", message: "User is not an admin" },
          { status: 403 }
        ),
      };
    }

    return {
      admin: {
        id: user.id,
        email: user.email,
      },
    };
  } catch (err) {
    console.error("[Auth] Admin verification failed:", err);
    return {
      error: NextResponse.json(
        { error: "Internal Server Error", message: "Auth verification failed" },
        { status: 500 }
      ),
    };
  }
}

/**
 * Add common security headers to a response.
 * Rate limit headers are set by the rate limiter when applied; do not advertise
 * a fixed remaining count that we do not actually track.
 */
export function withSecurityHeaders(
  response: NextResponse | Response
): NextResponse {
  if (response instanceof NextResponse) {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Cache-Control", "no-store");
  }
  return response as NextResponse;
}
