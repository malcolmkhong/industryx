import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// GET /api/player?userId=xxx - Load player progress
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('player_progress')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found - new player
      return NextResponse.json({ data: null, isNew: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, isNew: false });
}

// POST /api/player - Save player progress
export async function POST(request: Request) {
  const body = await request.json();
  const { userId, gameState, displayName } = body;

  if (!userId || !gameState) {
    return NextResponse.json({ error: 'userId and gameState are required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Upsert: insert if not exists, update if exists
  const { data, error } = await supabase
    .from('player_progress')
    .upsert({
      user_id: userId,
      display_name: displayName || 'Commander',
      game_state: gameState,
      last_saved_at: new Date().toISOString(),
      total_money_earned: gameState.totalMoneyEarned || 0,
      game_tick: gameState.gameTick || 0,
      buildings_count: gameState.buildings?.length || 0,
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, saved: true });
}
