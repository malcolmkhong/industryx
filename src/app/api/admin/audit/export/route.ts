import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";

function csvEscape(value: unknown): string {
  const str = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');

  let query = supabase
    .from('admin_actions')
    .select('admin_user_id, target_user_id, action_type, details, created_at')
    .order('created_at', { ascending: false });

  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const headers = ['Admin User ID', 'Target User ID', 'Action', 'Details', 'Timestamp'];
  const csvLines = [headers.join(',')];

  for (const row of rows) {
    const record = row as Record<string, unknown>;
    csvLines.push([
      csvEscape(record.admin_user_id),
      csvEscape(record.target_user_id),
      csvEscape(record.action_type),
      csvEscape(record.details),
      csvEscape(record.created_at),
    ].join(','));
  }

  const csv = csvLines.join('\n');
  const filename = `admin_audit_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
