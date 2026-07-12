/**
 * GET /api/admin/economy/overview
 * Economy dashboard: total money, top earners, transaction velocity.
 * Iteration 8: routed through db/serverGameState.ts and db/playerActions.ts.
 */
import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import {
  sumMoneyAcrossAllPlayers,
  topEarners,
  countActivePlayersSince,
  countLockedPlayers,
} from "@/lib/db/serverGameState";
import { countActionsSince } from "@/lib/db/playerActions";

export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const dayAgoISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    moneyAgg,
    top10,
    actionsToday,
    activePlayers,
    lockedPlayers,
  ] = await Promise.all([
    sumMoneyAcrossAllPlayers(),
    topEarners(10),
    countActionsSince(dayAgoISO),
    countActivePlayersSince(dayAgoISO),
    countLockedPlayers(),
  ]);

  const response = NextResponse.json({
    economy: {
      totalMoney: moneyAgg.totalMoney,
      totalEarned: moneyAgg.totalEarned,
      playerCount: moneyAgg.playerCount,
      activePlayers,
      lockedPlayers,
      transactionsToday: actionsToday,
      avgMoneyPerPlayer:
        moneyAgg.playerCount > 0 ? moneyAgg.totalMoney / moneyAgg.playerCount : 0,
    },
    topEarners: top10.map((r) => ({
      userId: r.user_id,
      money: r.money,
      totalEarned: r.total_money_earned,
      gameTick: r.game_tick,
    })),
  });
  return withSecurityHeaders(response);
}