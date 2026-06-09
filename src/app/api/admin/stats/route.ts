import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/stats
 * Dashboard aggregate statistics.
 * Returns: total players, online players, open investigations, locked accounts,
 *          total actions today, invalid actions today.
 */
export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    const supabase = createServiceRoleClient();

    // Calculate "today" in ISO format for date-based queries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Run all count queries in parallel for performance
    const [
      totalPlayersResult,
      onlinePlayersResult,
      openInvestigationsResult,
      lockedAccountsResult,
      totalActionsTodayResult,
      invalidActionsTodayResult,
    ] = await Promise.all([
      // Total players
      supabase
        .from("server_game_state")
        .select("user_id", { count: "exact", head: true }),

      // Online players
      supabase
        .from("player_sessions")
        .select("user_id", { count: "exact", head: true })
        .eq("is_online", true),

      // Open investigations
      supabase
        .from("cheat_investigations")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),

      // Locked accounts
      supabase
        .from("server_game_state")
        .select("user_id", { count: "exact", head: true })
        .eq("is_locked", true),

      // Total actions today
      supabase
        .from("player_actions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayISO),

      // Invalid actions today
      supabase
        .from("player_actions")
        .select("id", { count: "exact", head: true })
        .eq("is_valid", false)
        .gte("created_at", todayISO),
    ]);

    const stats = {
      total_players: totalPlayersResult.count ?? 0,
      online_players: onlinePlayersResult.count ?? 0,
      open_investigations: openInvestigationsResult.count ?? 0,
      locked_accounts: lockedAccountsResult.count ?? 0,
      total_actions_today: totalActionsTodayResult.count ?? 0,
      invalid_actions_today: invalidActionsTodayResult.count ?? 0,
    };

    // Log any errors from the queries (non-critical, return partial data)
    const errors = [
      totalPlayersResult.error,
      onlinePlayersResult.error,
      openInvestigationsResult.error,
      lockedAccountsResult.error,
      totalActionsTodayResult.error,
      invalidActionsTodayResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error("[Admin/Stats] Some queries had errors:", errors);
    }

    const response = NextResponse.json({ data: stats });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/Stats] Error fetching dashboard stats:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
