import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await request.json();
    const { userIds } = body;

    if (!Array.isArray(userIds) || userIds.length < 2 || userIds.length > 4) {
      return NextResponse.json({ error: "Provide 2-4 userIds" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data: states, error } = await supabase
      .from("server_game_state")
      .select("*")
      .in("user_id", userIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: progress } = await supabase
      .from("player_progress")
      .select("user_id, display_name")
      .in("user_id", userIds);

    const displayNames: Record<string, string> = {};
    if (progress) {
      for (const p of progress) {
        displayNames[p.user_id] = p.display_name || p.user_id.slice(0, 8);
      }
    }

    const players = (states || []).map((s) => ({
      userId: s.user_id,
      displayName: displayNames[s.user_id] || s.user_id.slice(0, 8),
      money: s.money,
      totalEarned: s.total_money_earned,
      researchPoints: s.research_points,
      gameTick: s.game_tick,
      gameSpeed: s.game_speed,
      buildingsCount: s.buildings_count,
      cheatFlags: s.cheat_flag_count,
      isLocked: s.is_locked,
      lastSaved: s.last_saved_at,
    }));

    const response = NextResponse.json({ data: players });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/Compare] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
