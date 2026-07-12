// ============================================
// Trade History API
// GET endpoint that retrieves a player's trade
// history from the trade_history Supabase table
// ============================================

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/verifyAuth';
import { getUserGuestStatus } from '@/lib/auth/guestCheck';
import { getTradeHistory } from '@/lib/db/trades';

export async function GET(request: Request) {
  const auth = await verifyAuth();
  if (!auth.success) return auth.response;

  const guestStatus = await getUserGuestStatus(auth.userId);
  if (guestStatus.isGuest) {
    return NextResponse.json(
      { error: 'Bind Account to access trade history', code: 'GUEST_GATED' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const result = await getTradeHistory(auth.userId, limit, offset);

    if (result === null) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[TradesAPI] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
