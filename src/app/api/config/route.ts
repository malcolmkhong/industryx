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
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '500'), 2000);
  const page = parseInt(searchParams.get('page') || '1');

  // If no specific table, return list of all tables with counts
  if (!table) {
    return getTableList();
  }

  if (!ALLOWED_TABLES.includes(table as any)) {
    return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
  }

  return getTableData(table, page, pageSize);
}

async function getTableList() {
  const supabase = createServiceRoleClient();
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

async function getTableData(table: string, page: number, pageSize: number) {
  const supabase = createServiceRoleClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Try sort_order first, fall back to no ordering if column doesn't exist
  let query = supabase
    .from(table)
    .select('*', { count: 'exact' })
    .range(from, to);

  // Only order by sort_order for tables that have it
  const tablesWithSortOrder = [
    'game_config_buildings', 'game_config_resources', 'game_config_research',
    'game_config_automation', 'game_config_workers', 'game_config_transport',
    'game_config_market', 'game_config_prestige_bonuses', 'game_config_quest_definitions',
    'game_config_event_templates', 'game_config_seasonal_events', 'game_config_mega_projects',
    'game_config_weather', 'game_config_balancing_rules',
  ];

  if (tablesWithSortOrder.includes(table)) {
    query = query.order('sort_order', { ascending: true, nullsFirst: false });
  }

  const { data, error, count } = await query;

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
