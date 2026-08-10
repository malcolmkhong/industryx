/**
 * POST /api/admin/system/clear-cache
 *
 * Manually flushes the canonical initial-state cache. Used by
 * operators when a config edit doesn't seem to have taken effect,
 * or for emergency cache busting after a suspected data inconsistency.
 *
 * The endpoint calls `invalidateCanonicalInitialStateCache()`, which
 * deletes the Redis key. The next `fetchCanonicalInitialState()`
 * call rebuilds the cache from the database.
 *
 * Auth: admin + write. The action is recorded via `logAdminAction`
 * so it's auditable.
 *
 * Safety:
 *   - The cache rebuilds from the live database. There is no risk
 *     of "losing" the cached value — the database is the source
 *     of truth.
 *   - The 1-hour Redis TTL means the cache would self-expire anyway.
 *     This endpoint just forces the expiry.
 *   - The action is idempotent: calling it twice is the same as
 *     calling it once.
 */
import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import { logAdminAction } from "@/lib/auth/admin-helpers";
import { invalidateCanonicalInitialStateCache } from "@/lib/db/infra/initialState.server";
import { invalidateGameConfigCache } from "@/lib/db/infra/gameConfigCache.server";

export async function POST() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const writeError = await requireAdminWrite(authResult.admin);
  if (writeError) return writeError;

  // Fire-and-forget: the invalidation is async (Redis DEL). We
  // don't wait for it — the next request after this response
  // will see the cleared cache. Errors inside the cache helper
  // are already logged.
  //
  // R-3 audit fix (2026-07-18): now flushes BOTH the
  // cross-instance Redis caches AND the per-process canonical
  // state cache. Previously the route only flushed the
  // per-process module-level `cache` in initialState.server.ts,
  // leaving other instances behind their Redis-served entries.
  invalidateCanonicalInitialStateCache();
  invalidateGameConfigCache();

  await logAdminAction({
    adminId: authResult.admin.id,
    actionType: "system.clear_canonical_cache",
    details: { reason: "manual_admin_flush" },
  });

  return withSecurityHeaders(
    NextResponse.json({
      success: true,
      message:
        "Canonical state cache cleared. Next guest request rebuilds from DB.",
      clearedAt: new Date().toISOString(),
    }),
  );
}
