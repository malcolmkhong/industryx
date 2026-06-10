import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/players
 * Search and list players with pagination.
 * Query params: search (email/id/name), page, limit (default 50)
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }
    const url = new URL(request.url);

    const search = url.searchParams.get("search") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // UUID regex for search detection
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Build the base query for server_game_state
    let query = supabase
      .from("server_game_state")
      .select(
        `
        user_id,
        money,
        total_money_earned,
        research_points,
        game_tick,
        game_speed,
        buildings_count,
        cheat_flag_count,
        is_locked,
        lock_reason,
        last_saved_at,
        created_at
      `,
        { count: "exact" }
      )
      .range(from, to)
      .order("created_at", { ascending: false });

    // Apply search filters
    if (search) {
      if (uuidRegex.test(search)) {
        // Search by user_id (exact match)
        query = query.eq("user_id", search);
      }
      // display_name search needs player_progress — handle after initial query
    }

    const { data: gameStates, count, error } = await query;

    if (error) {
      console.error("[Admin/Players] Error fetching players:", error.message);
      return NextResponse.json(
        { error: "Database Error", message: error.message },
        { status: 500 }
      );
    }

    // Fetch display names from player_progress for these users
    const userIds = (gameStates || []).map((gs: Record<string, unknown>) => gs.user_id as string);
    let displayNameMap: Record<string, string> = {};
    let emailMap: Record<string, string> = {};
    let allAuthUsers: { id: string; email?: string }[] = [];

    if (userIds.length > 0) {
      // Get display names from player_progress
      const { data: progressData } = await supabase
        .from("player_progress")
        .select("user_id, display_name")
        .in("user_id", userIds);

      if (progressData) {
        for (const pp of progressData) {
          if (pp.display_name) {
            displayNameMap[pp.user_id] = pp.display_name;
          }
        }
      }

      // Get emails from Supabase Auth Admin API
      try {
        const { data: usersData, error: usersError } =
          await supabase.auth.admin.listUsers();

        if (!usersError && usersData?.users) {
          allAuthUsers = usersData.users;
          for (const user of usersData.users) {
            if (userIds.includes(user.id)) {
              emailMap[user.id] = user.email ?? "";
            }
          }
        }
      } catch (authErr) {
        console.error("[Admin/Players] Error fetching user emails:", authErr);
      }

      // If search is not a UUID, filter by display_name or email
      if (search && !uuidRegex.test(search)) {
        const searchLower = search.toLowerCase();
        const matchingUserIds = userIds.filter(uid => {
          const displayName = (displayNameMap[uid] || "").toLowerCase();
          const email = (emailMap[uid] || "").toLowerCase();
          return displayName.includes(searchLower) || email.includes(searchLower);
        });

        // Filter results to only matching users
        const filtered = (gameStates || []).filter(
          (gs: Record<string, unknown>) => matchingUserIds.includes(gs.user_id as string)
        );

        // If email search found users not in the initial results, do a second query
        const allAuthMatches = allAuthUsers
          .filter((u: { id: string; email?: string }) => (u.email || "").toLowerCase().includes(searchLower))
          .map((u: { id: string; email?: string }) => u.id);

        if (allAuthMatches.length > 0) {
          const existingIds = new Set(userIds);
          const newIds = allAuthMatches.filter((id: string) => !existingIds.has(id));

          if (newIds.length > 0) {
            const { data: extraStates } = await supabase
              .from("server_game_state")
              .select(`
                user_id, money, total_money_earned, research_points,
                game_tick, game_speed, buildings_count, cheat_flag_count,
                is_locked, lock_reason, last_saved_at, created_at
              `)
              .in("user_id", newIds)
              .range(0, limit - 1)
              .order("created_at", { ascending: false });

            if (extraStates) {
              (filtered as Record<string, unknown>[]).push(...(extraStates as Record<string, unknown>[]));
            }
          }
        }

        // Replace gameStates with filtered results
        (gameStates as Record<string, unknown>[]).length = 0;
        (gameStates as Record<string, unknown>[]).push(...filtered);
      }
    }

    // Compose final results
    const players = (gameStates || []).map((gs: Record<string, unknown>) => ({
      user_id: gs.user_id,
      email: emailMap[gs.user_id as string] || null,
      display_name: displayNameMap[gs.user_id as string] || null,
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
    }));

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    const response = NextResponse.json({
      data: players,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });

    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/Players] Error listing players:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to list players" },
      { status: 500 }
    );
  }
}
