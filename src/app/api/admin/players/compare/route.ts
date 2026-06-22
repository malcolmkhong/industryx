/**
 * POST /api/admin/players/compare
 * Side-by-side comparison of 2-4 players. Iteration 8: routed through
 * db/serverGameState.ts#loadPlayersByIds and db/playerProgress.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { loadPlayersByIds } from "@/lib/db/serverGameState";
import { listPlayerProgressByIds } from "@/lib/db/playerProgress";

export async function POST(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const body = await request.json();
  const { userIds } = body;

  if (!Array.isArray(userIds) || userIds.length < 2 || userIds.length > 4) {
    return NextResponse.json({ error: "Provide 2-4 userIds" }, { status: 400 });
  }

  const states = await loadPlayersByIds(userIds);
  const progress = await listPlayerProgressByIds(userIds);

  const displayNames: Record<string, string> = {};
  for (const p of progress) {
    if (p.display_name) displayNames[p.user_id] = p.display_name;
  }

  const players = states.map((s) => ({
    userId: s.user_id,
    displayName: displayNames[s.user_id] || s.user_id?.slice(0, 8) || '',
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

  return withSecurityHeaders(NextResponse.json({ players }));
}