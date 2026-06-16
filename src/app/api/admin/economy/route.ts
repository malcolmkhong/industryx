import { NextResponse } from "next/server";
import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { data: moneyAgg, error: aggError } = await supabase
    .from('server_game_state')
    .select('money, total_money_earned');

  const totalMoney = moneyAgg?.reduce((sum, r) => sum + (Number(r.money) || 0), 0) ?? 0;
  const totalEarned = moneyAgg?.reduce((sum, r) => sum + (Number(r.total_money_earned) || 0), 0) ?? 0;
  const playerCount = moneyAgg?.length ?? 0;

  const { data: topEarners } = await supabase
    .from('server_game_state')
    .select('user_id, money, total_money_earned, game_tick')
    .order('total_money_earned', { ascending: false })
    .limit(10);

  const { count: actionsToday } = await supabase
    .from('player_actions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const { count: activePlayers } = await supabase
    .from('server_game_state')
    .select('*', { count: 'exact', head: true })
    .gte('last_saved_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const { count: lockedPlayers } = await supabase
    .from('server_game_state')
    .select('*', { count: 'exact', head: true })
    .eq('is_locked', true);

  const response = NextResponse.json({
    economy: {
      totalMoney,
      totalEarned,
      playerCount,
      activePlayers: activePlayers ?? 0,
      lockedPlayers: lockedPlayers ?? 0,
      transactionsToday: actionsToday ?? 0,
      avgMoneyPerPlayer: playerCount > 0 ? totalMoney / playerCount : 0,
    },
    topEarners: (topEarners || []).map((r) => ({
      userId: r.user_id,
      money: r.money,
      totalEarned: r.total_money_earned,
      gameTick: r.game_tick,
    })),
  });

  return withSecurityHeaders(response);
}
