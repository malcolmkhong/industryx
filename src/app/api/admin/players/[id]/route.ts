import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { getDbClient } from '@/lib/db/access';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/players/[id]
 * Fetch comprehensive player detail including game state, progress, recent actions, and investigations.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id: playerId } = await context.params;

  try {
    const supabase = getDbClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }

    // Fetch game state
    const { data: gameState, error: gsError } = await supabase
      .from("server_game_state")
      .select(
        "user_id,full_state,money,total_money_earned,buildings_count,game_tick,game_speed,last_tick_at,last_saved_at,state_version,research_points,resources,workers,is_locked,lock_reason,cheat_flag_count,created_at",
      )
      .eq("user_id", playerId)
      .single();

    if (gsError || !gameState) {
      return NextResponse.json(
        { error: "Not Found", message: "Player not found" },
        { status: 404 }
      );
    }

    // Fetch player progress
    const { data: progress, error: progressError } = await supabase
      .from("player_progress")
      .select(
        "user_id,display_name,game_state,total_money_earned,game_tick,game_speed,last_login_at,last_saved_at,resources,buildings,workers,research_progress,completed_research,active_research,contracts,auto_collect,auto_sell_resources,blueprints,last_server_tick_at,pending_notifications,total_play_time,created_at",
      )
      .eq("user_id", playerId)
      .single();

    // Don't fail if player_progress doesn't exist — it's optional info
    if (progressError && progressError.code !== "PGRST116") {
      console.error(
        "[Admin/Players/Detail] Error fetching player progress:",
        progressError.message
      );
    }

    // Fetch last 50 player actions
    const { data: actions, error: actionsError } = await supabase
      .from("player_actions")
      .select(
        "id,user_id,action_type,payload,is_valid,money_after,rejection_reason,validation_risk,created_at",
      )
      .eq("user_id", playerId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (actionsError) {
      console.error(
        "[Admin/Players/Detail] Error fetching player actions:",
        actionsError.message
      );
    }

    // Fetch cheat investigations for this player
    const { data: investigations, error: invError } = await supabase
      .from("cheat_investigations")
      .select(
        "id,user_id,detection_type,description,evidence,status,device_id,fingerprint_hash,resolution_note,resolved_by,resolved_at,created_at,updated_at",
      )
      .eq("user_id", playerId)
      .order("created_at", { ascending: false });

    if (invError) {
      console.error(
        "[Admin/Players/Detail] Error fetching investigations:",
        invError.message
      );
    }

    // Fetch user email from auth admin API
    let email: string | null = null;
    try {
      const { data: userData, error: userError } =
        await supabase.auth.admin.getUserById(playerId);
      if (!userError && userData?.user) {
        email = userData.user.email ?? null;
      }
    } catch (authErr) {
      console.error(
        "[Admin/Players/Detail] Error fetching user email:",
        authErr
      );
    }

    // Compose comprehensive player detail
    const playerDetail = {
      user_id: gameState.user_id,
      email,
      display_name: progress?.display_name || null,
      game_state: gameState,
      progress: progress || null,
      recent_actions: actions || [],
      investigations: investigations || [],
    };

    const response = NextResponse.json({ data: playerDetail });
    return withSecurityHeaders(response);
  } catch (err) {
    console.error("[Admin/Players/Detail] Error fetching player detail:", err);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to fetch player detail" },
      { status: 500 }
    );
  }
}
