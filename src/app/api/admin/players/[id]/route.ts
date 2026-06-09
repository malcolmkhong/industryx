import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

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
    const supabase = createServiceRoleClient();

    // Fetch game state
    const { data: gameState, error: gsError } = await supabase
      .from("server_game_state")
      .select("*")
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
      .select("*")
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
      .select("*")
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
      .select("*")
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
