/**
 * Shared admin authentication utility for API routes.
 * Verifies the user's session and checks admin status against the admin_users
 * Supabase table (with ADMIN_UIDS env var as bootstrap fallback).
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export interface AdminUser {
  id: string;
  email: string | undefined;
}

// In-memory cache of admin user IDs. Populated on first DB check, refreshed
// on miss or after CACHE_TTL_MS. Avoids hitting the DB on every API request
// while still allowing admin changes to propagate within the TTL window.
let adminCache: Set<string> = new Set();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

function getAdminUidsFromEnv(): string[] {
  return (process.env.ADMIN_UIDS || "")
    .split(",")
    .map((uid) => uid.trim())
    .filter(Boolean);
}

/**
 * Synchronous bootstrap check against ADMIN_UIDS env var.
 * Used in hot paths where async DB call is not feasible (and as fallback
 * when the DB is unreachable). For authoritative admin checks, use verifyAdmin.
 */
export function isAdminUserId(userId: string): boolean {
  return getAdminUidsFromEnv().includes(userId);
}

/**
 * Authoritative async admin check. Queries the admin_users table with an
 * in-memory cache (1-minute TTL). Falls back to ADMIN_UIDS env var if the DB
 * is unreachable (bootstrap / outage resilience).
 */
export async function isAdminUserDb(userId: string): Promise<boolean> {
  // Cache hit (within TTL)
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    if (adminCache.has(userId)) return true;
    // If we have a populated cache, a miss is authoritative
    if (adminCache.size > 0 || cacheLoadedAt > 0) return false;
  }

  // Refresh cache
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("is_active", true);
    if (error) {
      console.warn("[Auth] admin_users query failed, falling back to ADMIN_UIDS env var:", error.message);
      return isAdminUserId(userId);
    }
    adminCache = new Set((data ?? []).map((r: { user_id: string }) => r.user_id));
    cacheLoadedAt = Date.now();
    return adminCache.has(userId);
  } catch (err) {
    console.warn("[Auth] admin_users query threw, falling back to ADMIN_UIDS env var:", err);
    return isAdminUserId(userId);
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
 * Add common rate limiting and security headers to a response.
 */
export function withSecurityHeaders(
  response: NextResponse | Response
): NextResponse {
  if (response instanceof NextResponse) {
    response.headers.set("X-RateLimit-Limit", "100");
    response.headers.set("X-RateLimit-Remaining", "99");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Cache-Control", "no-store");
  }
  return response as NextResponse;
}
