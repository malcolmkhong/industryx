import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const DEFAULT_HOURS = 24;
const MAX_HOURS = 168;

export async function GET(request: NextRequest) {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const resourceId = searchParams.get('resource');
  const hoursParam = Number(searchParams.get('hours'));
  const hours = Number.isFinite(hoursParam) && hoursParam > 0
    ? Math.min(hoursParam, MAX_HOURS)
    : DEFAULT_HOURS;

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('game_config_market_history')
    .select('resource_id, base_price, market_phase, game_tick, recorded_at')
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true });

  if (resourceId) {
    query = query.eq('resource_id', resourceId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    history: data ?? [],
    hours,
    resource: resourceId,
    fetchedAt: Date.now(),
  });
}
