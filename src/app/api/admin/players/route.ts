/**
 * GET /api/admin/players
 * Search and list players with pagination.
 * Iteration 8: routed through db/serverGameState.ts#listPlayersForAdmin,
 * db/playerProgress.ts, and db/adminUsers.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { listPlayersForAdmin } from "@/lib/db/serverGameState";
import { searchPlayerProgressByDisplayName, listPlayerProgressByIds } from "@/lib/db/playerProgress";
import { filterAuthUsersEnrichedByIds } from "@/lib/db/adminUsers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));

  // Resolve search to user_id filter
  let userIdFilter: string[] | undefined;
  let excludeUuid: string | undefined;
  if (search) {
    if (UUID_RE.test(search)) {
      userIdFilter = [search];
    } else {
      const matches = await searchPlayerProgressByDisplayName(search, limit);
      if (matches.length === 0) {
        excludeUuid = '00000000-0000-0000-0000-000000000000';
      } else {
        userIdFilter = matches;
      }
    }
  }

  const { players, total } = await listPlayersForAdmin(page, limit, {
    userIdFilter,
    excludeUuid,
  });

  const userIds = players.map((p) => p.user_id).filter((id): id is string => !!id);

  // Batch lookup display names
  const displayNameMap: Record<string, string> = {};
  const progress = await listPlayerProgressByIds(userIds);
  for (const p of progress) {
    if (p.display_name) displayNameMap[p.user_id] = p.display_name;
  }

  // Batch lookup enriched auth data (provider, avatar, last sign-in, etc.)
  const authMap = await filterAuthUsersEnrichedByIds(userIds);

  const result = players.map((gs) => {
    const auth = authMap[gs.user_id as string];
    return {
      user_id: gs.user_id,
      email: auth?.email ?? null,
      display_name: displayNameMap[gs.user_id as string] ?? null,
      avatar_url: auth?.avatar_url ?? null,
      provider: auth?.provider ?? null,
      providers: auth?.providers ?? null,
      is_anonymous: auth?.is_anonymous ?? false,
      last_sign_in_at: auth?.last_sign_in_at ?? null,
      email_confirmed_at: auth?.email_confirmed_at ?? null,
      money: gs.money,
      total_money_earned: gs.total_money_earned,
      research_points: gs.research_points,
      game_tick: gs.game_tick,
      game_speed: gs.game_speed,
      buildings_count: gs.buildings_count,
      cheat_flag_count: gs.cheat_flag_count,
      is_locked: gs.is_locked,
      lock_reason: gs.lock_reason,
      last_saved_at: gs.last_saved_at,
      created_at: gs.created_at,
    };
  });

  const totalPages = Math.ceil(total / limit);
  const response = NextResponse.json({
    data: result,
    pagination: { page, limit, total, totalPages },
  });
  return withSecurityHeaders(response);
}