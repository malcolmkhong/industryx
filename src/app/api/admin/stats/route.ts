/**
 * GET /api/admin/stats
 * Dashboard aggregate statistics.
 * Iteration 8: routed through db/serverGameState.ts, db/playerActions.ts,
 * db/cheatInvestigations.ts.
 */
import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { countPlayersTotal, countLockedPlayers } from "@/lib/db/serverGameState";
import {
  countActionsSince,
  countInvalidActionsSince,
  countOnlinePlayers,
} from "@/lib/db/playerActions";
import { countOpenCheatInvestigations } from "@/lib/db/cheatInvestigations";

export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const rateLimitResult = await checkRateLimit(
    authResult.admin.id,
    RATE_LIMITS.admin,
    "admin-stats"
  );
  if (rateLimitResult) return rateLimitResult;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const [
    total_players,
    online_players,
    open_investigations,
    locked_accounts,
    total_actions_today,
    invalid_actions_today,
  ] = await Promise.all([
    countPlayersTotal(),
    countOnlinePlayers(),
    countOpenCheatInvestigations(),
    countLockedPlayers(),
    countActionsSince(todayISO),
    countInvalidActionsSince(todayISO),
  ]);

  const response = NextResponse.json({
    data: {
      total_players,
      online_players,
      open_investigations,
      locked_accounts,
      total_actions_today,
      invalid_actions_today,
    },
  });
  response.headers.set("Cache-Control", "private, max-age=30");
  return withSecurityHeaders(response);
}