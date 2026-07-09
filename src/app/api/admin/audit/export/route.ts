/**
 * GET /api/admin/audit/export
 * CSV export of admin_actions. Iteration 8: routed through db/adminActions.ts.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdmin } from "@/lib/auth/admin";
import { listAdminActionsForExport } from "@/lib/db/playerActions";

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

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get('date_from') || undefined;
  const dateTo = url.searchParams.get('date_to') || undefined;

  const rows = await listAdminActionsForExport({ dateFrom, dateTo });

  const headers = ['Admin User ID', 'Target User ID', 'Action', 'Details', 'Timestamp'];
  const csvLines = [headers.join(',')];

  for (const row of rows) {
    csvLines.push([
      csvEscape(row.admin_user_id),
      csvEscape(row.target_user_id),
      csvEscape(row.action_type),
      csvEscape(row.details),
      csvEscape(row.created_at),
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