import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Allowed config tables (security: only these tables can be queried)
const ALLOWED_TABLES = [
  'game_config_buildings',
  'game_config_resources',
  'game_config_production_recipes',
  'game_config_production_chains',
  'game_config_research',
  'game_config_automation',
  'game_config_workers',
  'game_config_transport',
  'game_config_market',
  'game_config_prestige_bonuses',
  'game_config_rank_thresholds',
  'game_config_quest_definitions',
  'game_config_daily_rewards',
  'game_config_event_templates',
  'game_config_seasonal_events',
  'game_config_mega_projects',
  'game_config_game',
  'game_config_weather',
  'game_config_balancing_rules',
] as const;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get('table');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '500'), 2000);
    const page = parseInt(searchParams.get('page') || '1');

    // If no specific table, return list of all tables with counts
    if (!table) {
      const result = await getTableList();
      if (!result) {
        return NextResponse.json(
          { error: 'Service temporarily unavailable — database not configured' },
          { status: 503 }
        );
      }
      return result;
    }

    if (!ALLOWED_TABLES.includes(table as any)) {
      return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
    }

    const result = await getTableData(table, page, pageSize);
    if (!result) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable — database not configured' },
        { status: 503 }
      );
    }
    return result;
  } catch (error) {
    console.error('[/api/config] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getTableList(): Promise<NextResponse | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return null;
  }
  const tables = ALLOWED_TABLES.map(t => ({ name: t }));

  const results = await Promise.all(
    tables.map(async (t) => {
      const { count, error } = await supabase
        .from(t.name)
        .select('*', { count: 'exact', head: true });
      return {
        name: t.name,
        rowCount: count ?? 0,
        error: error?.message,
      };
    })
  );

  return NextResponse.json({
    tables: results,
    total: results.length,
  });
}

async function getTableData(table: string, page: number, pageSize: number): Promise<NextResponse | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return null;
  }
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Try sort_order first, fall back to no ordering if column doesn't exist
  let query = supabase
    .from(table)
    .select('*', { count: 'exact' })
    .range(from, to);

  // Only order by sort_order for tables that have the column
  const tablesWithSortOrder = new Set([
    'game_config_buildings', 'game_config_resources', 'game_config_research',
    'game_config_automation', 'game_config_workers', 'game_config_transport',
    'game_config_market', 'game_config_prestige_bonuses', 'game_config_quest_definitions',
    'game_config_event_templates', 'game_config_seasonal_events', 'game_config_mega_projects',
    'game_config_weather',
  ]);

  let data, error, count;

  if (tablesWithSortOrder.has(table)) {
    // Try with sort_order first, fall back to no ordering if column doesn't exist
    const withSort = await query.order('sort_order', { ascending: true, nullsFirst: false });
    data = withSort.data;
    error = withSort.error;
    count = withSort.count;

    if (error?.message?.includes('sort_order')) {
      // Column doesn't exist, retry without ordering
      const withoutSort = await supabase
        .from(table)
        .select('*', { count: 'exact' })
        .range(from, to);
      data = withoutSort.data;
      error = withoutSort.error;
      count = withoutSort.count;
    }
  } else {
    const result = await query;
    data = result.data;
    error = result.error;
    count = result.count;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}
