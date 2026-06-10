// ============================================
// Trade History API
// GET endpoint that retrieves a player's trade
// history from the trade_history Supabase table
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyAuth } from '@/lib/auth/verifyAuth';

export async function GET(request: Request) {
  // Auth check
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const supabase = createServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }

    const { data, error, count } = await supabase
      .from('trade_history')
      .select('*', { count: 'exact' })
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[TradesAPI] Failed to fetch trade history:', error);
      return NextResponse.json(
        { error: 'Failed to fetch trade history' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      trades: data.map(trade => ({
        id: trade.id,
        giveResource: trade.give_resource,
        giveAmount: Number(trade.give_amount),
        receiveResource: trade.receive_resource,
        receiveAmount: Number(trade.receive_amount),
        commissionRate: Number(trade.commission_rate),
        serverValidated: trade.server_validated,
        marketPhase: trade.market_phase,
        tick: trade.game_tick,
        createdAt: trade.created_at,
      })),
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[TradesAPI] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
