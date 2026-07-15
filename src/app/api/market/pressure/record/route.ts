// ============================================
// POST /api/market/pressure/record
// Records player buy/sell activity for global
// market pressure calculation.
// Called on every market buy/sell action.
// ============================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/access';;
import { verifyAuth } from '@/lib/auth/verifyAuth';

export async function POST(request: Request) {
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  const body = await request.json().catch(() => ({}));
  const { resource, type, amount } = body;

  if (!resource || !type || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (type !== 'buy' && type !== 'sell') {
    return NextResponse.json({ error: 'Type must be buy or sell' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  // Upsert player pressure for this resource
  const { error } = await supabase.rpc('upsert_market_pressure', {
    p_user_id: auth.userId,
    p_resource: resource,
    p_buy_volume: type === 'buy' ? amount : 0,
    p_sell_volume: type === 'sell' ? amount : 0,
  });

  if (error) {
    console.error('[MarketAction] Failed to record pressure:', error.message);
    return NextResponse.json({ error: 'Failed to record' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
