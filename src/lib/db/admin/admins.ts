/**
 * admins — Centralized access to the `admin_users` table.
 *
 * This module is the ONLY place in the codebase that should call
 * `.from('admin_users')`. All API routes and library code must
 * import query functions from here instead of touching the table directly.
 *
 * Iteration 2 of the Database Centralization migration (2026-06-20).
 * Migrated routes: /api/admin/users/admins, /api/admin/users/admins/[id],
 *   /api/admin/users/admins/[id]/role, /api/auth/* (via auth.ts cache),
 *   and src/lib/auth/admin-helpers.ts.
 *
 * Note: The legacy `/api/admins` and `/api/admins/[id]` (without the
 * `admin/` prefix) were deleted in Phase 5.4 as dead code (no consumers
 * — the `/api/admin/users/admins/*` paths are the canonical ones).
 *
 * Caching: The 60s in-memory cache for admin user IDs is preserved exactly
 * as it was in src/lib/auth/admin.ts. The cache now lives here, and
 * src/lib/auth/admin.ts re-exports it via getAdminUserIdsFromDb().
 *
 * Conventions (decided in Phase 2 of the audit):
 *   - All async functions return `Promise<T | null>` (null for not-found).
 *   - Throw for unexpected database errors (PostgrestError).
 *   - Caller handles auth + rate limit + response shaping.
 *
 * Affected files (Iteration 2):
 *   - src/lib/db/admins.ts                    (NEW)
 *   - src/lib/db/adminActions.ts              (NEW, sibling)
 *   - src/lib/auth/admin.ts                   (cache moved here, re-exports)
 *   - src/lib/auth/admin-helpers.ts           (uses db/admins + db/adminActions)
 *   - src/app/api/admin/users/admins/route.ts       (3 call sites)
 *   - src/app/api/admin/users/admins/[id]/route.ts  (2 call sites)
 *   - src/app/api/admin/users/admins/[id]/role/route.ts (4 call sites)
 */

import { createClient } from "@/lib/db/access";
import {
  getCachedAdminUids,
  setCachedAdminUids,
  invalidateAdminUidCache,
} from "@/lib/db/infra/adminUidCache.server";
import type { Database } from "@/lib/db/types";

// Type aliases from the generated Supabase types.
type AdminUserRow = Database["public"]["Tables"]["admin_users"]["Row"];
type AdminUserInsert = Database["public"]["Tables"]["admin_users"]["Insert"];

/**
 * Narrow shape for list endpoint — only the fields returned by GET.
 */
export type AdminUserListItem = Pick<
  AdminUserRow,
  "id" | "user_id" | "email" | "role" | "added_by" | "created_at"
>;

/**
 * Narrow shape for the role-update endpoint — id + user_id + role.
 */
export type AdminUserForRoleUpdate = Pick<
  AdminUserRow,
  "id" | "user_id" | "role"
>;

// ─────────────────────────────────────────────────────────────────
// Admin UID cache (Redis-backed, see adminUidCache.server.ts)
// ─────────────────────────────────────────────────────────────────
//
// R-1 audit fix (2026-07-18): the previous per-process 60s in-memory
// cache was kept in this module and the Redis cache module
// (adminUidCache.server.ts) was orphaned. With multiple instances
// behind a load balancer, an admin revocation only invalidated the
// cache on the instance that handled the write — the other
// instances continued accepting requests from the revoked admin
// for up to 60 seconds.
//
// We now use Redis as the cross-instance source of truth and keep a
// per-process `inflightRefresh` Promise for single-flight dedup
// within a single instance. The cache content lives in Redis under
// `cache:admin-uids:v1` with a 1-hour safety-net TTL. Writes are
// invalidated via `clearAdminCache()` (called by admin write paths)
// which calls Redis DEL. On Redis error the code falls through to a
// direct DB read — Redis is a cache, not a source of truth.

let inflightRefresh: Promise<Set<string>> | null = null;

function getAdminUidsFromEnv(): string[] {
  return (process.env.ADMIN_UIDS || "")
    .split(",")
    .map((uid) => uid.trim())
    .filter(Boolean);
}

/**
 * Synchronous bootstrap check against ADMIN_UIDS env var.
 * Mirrors the original isAdminUserId() in auth/admin.ts.
 */
export function isAdminUserIdInEnv(userId: string): boolean {
  return getAdminUidsFromEnv().includes(userId);
}

/**
 * Refresh the cache once. Reads from Redis first; on miss/error,
 * falls through to the database and writes the result to Redis.
 * Concurrent callers share the same in-flight promise (single-flight).
 *
 * Returns the resulting Set, or an env-var fallback Set on query
 * failure. Redis errors are logged inside `adminUidCache.server.ts`
 * and return null from `getCachedAdminUids()`, which signals the
 * caller to refresh from DB.
 */
async function refreshAdminCache(): Promise<Set<string>> {
  if (inflightRefresh) return await inflightRefresh;
  // Capture the in-flight promise in a local variable. The
  // IIFE's `finally` block clears the module-level
  // `inflightRefresh` reference, so reading it AFTER `await`
  // would return `null`. Capturing the local copy preserves the
  // resolved value for the explicit `await` + `return`.
  const promise = (async () => {
    try {
      // 1. Try Redis first (R-1: cross-instance consistency).
      const cached = await getCachedAdminUids();
      if (cached !== null && cached.size > 0) {
        return cached;
      }
      // 2. Miss (or Redis down). Read fresh from the database.
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id");
      if (error) {
        console.warn(
          "[Auth] admin_users query failed, falling back to ADMIN_UIDS env var:",
          error.message,
        );
        return new Set(getAdminUidsFromEnv());
      }
      const fresh = new Set((data ?? []).map((r) => r.user_id));
      // 3. Populate Redis for the next caller on every instance.
      // Best-effort: failure is logged inside setCachedAdminUids.
      await setCachedAdminUids(fresh);
      return fresh;
    } catch (err) {
      console.warn(
        "[Auth] admin_users query threw, falling back to ADMIN_UIDS env var:",
        err,
      );
      return new Set(getAdminUidsFromEnv());
    } finally {
      inflightRefresh = null;
    }
  })();
  inflightRefresh = promise;
  // Explicit `await` satisfies ESLint `return-await` rule. The
  // IIFE never rejects (the inner try/catch always returns a
  // fallback Set) so this is functionally equivalent to
  // `return inflightRefresh`, but the await makes the contract
  // explicit and future-proofs against a throw being added to
  // the IIFE body.
  return await promise;
}

/**
 * Authoritative async admin check. Returns the Set of admin user
 * IDs currently known (cache contents). Callers should check
 * `set.has(userId)` to test membership.
 *
 * R-1: the cache is now Redis-backed (`cache:admin-uids:v1`).
 * Single-flight dedup is per-process via `inflightRefresh`.
 */
export async function getAdminUserIdsFromDb(): Promise<Set<string>> {
  // 1. Try Redis (cross-instance cache hit). If a populated Set
  //    comes back we return it directly; no DB roundtrip.
  const cached = await getCachedAdminUids();
  if (cached !== null && cached.size > 0) {
    return cached;
  }
  // 2. Miss / Redis-down → single-flight refresh.
  return refreshAdminCache();
}

/**
 * Authoritative async admin check (boolean). Same cache, returns
 * whether the userId is in the admin set.
 */
export async function isAdminUserIdInDb(userId: string): Promise<boolean> {
  // 1. Try Redis.
  const cached = await getCachedAdminUids();
  if (cached !== null && cached.size > 0) {
    return cached.has(userId);
  }
  // 2. Cache miss — refresh and re-check.
  const refreshed = await getAdminUserIdsFromDb();
  return refreshed.has(userId);
}

/**
 * Clear the admin UID cache on all instances. Called by routes
 * that mutate admin_users so subsequent reads see fresh data.
 *
 * R-1: now deletes the Redis key (cross-instance) AND cancels the
 * in-flight single-flight refresh for the current process.
 */
export function clearAdminCache(): void {
  invalidateAdminUidCache();
  inflightRefresh = null;
}

// ─────────────────────────────────────────────────────────────────
// Query functions
// ─────────────────────────────────────────────────────────────────

/**
 * Check if the admin_users table is reachable.
 */
export function isAdminsAvailable(): boolean {
  // Both createClient and getDbClient return null when not configured.
  // We don't actually need a client here — this is a fast precheck before
  // hitting the table.
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

/**
 * List all admins from the database (without env-only entries).
 * Returns an empty array on error or no results.
 */
export async function listAdmins(): Promise<AdminUserListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, user_id, email, role, added_by, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[Admins] Error fetching admin_users:", error.message);
    throw error;
  }
  return (data ?? []) as AdminUserListItem[];
}

/**
 * Get the role of a specific admin by their user_id.
 * Returns null if the user has no admin record.
 */
export async function getAdminRoleByUserId(
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[Admins] Error fetching admin role:", error.message);
    return null;
  }
  return (data?.role as string | undefined) ?? null;
}

/**
 * Get an admin record by its primary key (id).
 * Returns null if not found.
 */
export async function getAdminById(
  adminRecordId: string,
): Promise<AdminUserForRoleUpdate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, user_id, role")
    .eq("id", adminRecordId)
    .maybeSingle();

  if (error) {
    console.error("[Admins] Error fetching admin by id:", error.message);
    return null;
  }
  return (data ?? null) as AdminUserForRoleUpdate | null;
}

/*
 * Check if an admin with the given user_id already exists.
 * Returns the id if found, null otherwise.
 */
export async function findAdminIdByUserId(
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[Admins] Error checking existing admin:", error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

/**
 * Count admins with a given role. Used by the role-update route to
 * enforce the "last super admin cannot demote self" guard.
 */
export async function countAdminsByRole(role: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role", role);

  if (error) {
    console.error("[Admins] Error counting admins by role:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Insert a new admin user. Returns the inserted row, or null on error.
 */
export async function insertAdmin(
  values: AdminUserInsert,
): Promise<AdminUserRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_users")
    .insert(values)
    .select()
    .single();

  if (error) {
    console.error("[Admins] Error inserting admin:", error.message);
    return null;
  }
  return data as AdminUserRow;
}

/**
 * Delete an admin by primary key. Returns true on success, false on error.
 */
export async function deleteAdminById(adminRecordId: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("admin_users")
    .delete()
    .eq("id", adminRecordId);

  if (error) {
    console.error("[Admins] Error deleting admin:", error.message);
    return false;
  }
  return true;
}

/**
 * Update an admin's role. Returns true on success, false on error.
 */
export async function updateAdminRole(
  adminRecordId: string,
  role: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("admin_users")
    .update({ role })
    .eq("id", adminRecordId);

  if (error) {
    console.error("[Admins] Error updating admin role:", error.message);
    return false;
  }
  return true;
}
// ============================================
// Iteration 8 — admin_users count for system-status
// ============================================

export async function countAdmins(): Promise<number> {
  const supabase = await createClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("admin_users")
    .select("user_id", { count: "exact", head: true });
  return count ?? 0;
}
