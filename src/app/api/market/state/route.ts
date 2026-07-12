// ============================================
// GET /api/market/state
// Returns current global market prices + news
// Read by all players every 10 seconds
// ============================================

import { NextResponse } from 'next/server';
import { getMarketState } from '@/lib/db/game/market';

export async function GET() {
  const data = await getMarketState();

  if (!data) {
    return NextResponse.json({
      tick: 0,
      prices: [],
      news: [],
      volatility: 0,
    });
  }

  return NextResponse.json(data);
}
