// ============================================
// GET /api/market/state
// Returns current global market prices + news
// Read by all players every 10 seconds
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('server_market_state')
    .select('tick, prices, news, volatility')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return NextResponse.json({
      tick: 0,
      prices: [],
      news: [],
      volatility: 0,
    });
  }

  return NextResponse.json(data);
}
