/**
 * GET /api/admin/bootstrap-audit
 *
 * Per AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §19 + §21 PR 5: admin audit summary
 * endpoint powering /admin/bootstrap-audit. Calls the
 * `get_bootstrap_telemetry_summary` SECURITY DEFINER RPC (migration 075).
 *
 * AUTH (AUT-001 + AUT-002): verifyAdmin() gates the route. We follow the
 * codebase's existing read-gate convention for observability dashboards
 * (see /api/admin/system/monitoring, /api/admin/market/overview — they call
 * verifyAdmin() only, since plan §21 distinguishes read vs write gates).
 *
 * Rate limit (API-001/002/003): RATE_LIMITS.admin (best-effort profile).
 *
 * Response shape:
 *   200:
 *     {
 *       summary: { total_count, ready_count, conflict_count, ...,
 *                  by_source, p50_duration_ms, p95_duration_ms, since, until_ts },
 *       recent_rows: Array<{ id, device_id_truncated, outcome, source, created_at }>
 *     }
 *   401/403: auth failure
 *   429:     rate limited
 *   503:     DB unreachable
 */

import { NextResponse } from "next/server";

import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { checkRateLimit, RATE_LIMITS } from "@/lib/auth/rateLimiter";
import { getDbClient } from '@/lib/db/access';

export const dynamic = "force-dynamic";

interface SummaryRow {
  total_count: string | number;
  ready_count: string | number;
  conflict_count: string | number;
  recovery_count: string | number;
  temporary_error_count: string | number;
  signed_out_count: string | number;
  signed_in_count: string | number;
  by_source: Record<string, string | number> | null;
  p50_duration_ms: string | number | null;
  p95_duration_ms: string | number | null;
  since: string;
  until_ts: string;
}

interface RecentTelemetryRow {
  id: string;
  device_id: string;
  outcome: string;
  source: string | null;
  state_at_emit: string | null;
  created_at: string;
}

const RECENT_ROW_LIMIT = 50;

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function truncateDeviceId(deviceId: string): string {
  if (deviceId.length <= 12) return deviceId;
  return `${deviceId.slice(0, 8)}…${deviceId.slice(-4)}`;
}

export async function GET() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const rateLimited = await checkRateLimit(
    authResult.admin.id,
    RATE_LIMITS.admin,
    "/api/admin/bootstrap-audit",
  );
  if (rateLimited) return rateLimited;

  const supabase = getDbClient();
  if (!supabase) {
    return withSecurityHeaders(
      NextResponse.json(
        { error: "service unavailable", code: "AUDIT_UNAVAILABLE" },
        { status: 503 },
      ),
    );
  }

  // RPC: get_bootstrap_telemetry_summary (default 24h window).
  const { data: summaryData, error: summaryError } = await supabase.rpc(
    "get_bootstrap_telemetry_summary",
    {},
  );

  if (summaryError) {
    console.error(
      "[bootstrap-audit] get_bootstrap_telemetry_summary RPC error:",
      summaryError.message,
    );
    return withSecurityHeaders(
      NextResponse.json(
        { error: "audit summary unavailable", code: "AUDIT_UNAVAILABLE" },
        { status: 503 },
      ),
    );
  }

  const summaryRow = (summaryData as SummaryRow[] | null)?.[0];
  if (!summaryRow) {
    return withSecurityHeaders(
      NextResponse.json(
        { error: "audit summary returned no row", code: "AUDIT_UNAVAILABLE" },
        { status: 503 },
      ),
    );
  }

  // Recent rows: conflict + recovery_required only (per plan §21 audit view).
  const { data: recentData, error: recentError } = await supabase
    .from("bootstrap_telemetry")
    .select("id,device_id,outcome,source,state_at_emit,created_at")
    .in("outcome", ["conflict", "recovery_required"])
    .order("created_at", { ascending: false })
    .limit(RECENT_ROW_LIMIT);

  if (recentError) {
    console.error(
      "[bootstrap-audit] recent rows fetch error:",
      recentError.message,
    );
    // Non-fatal: return the summary without recent rows.
    return withSecurityHeaders(
      NextResponse.json({
        summary: {
          total_count: toFiniteNumber(summaryRow.total_count) ?? 0,
          ready_count: toFiniteNumber(summaryRow.ready_count) ?? 0,
          conflict_count: toFiniteNumber(summaryRow.conflict_count) ?? 0,
          recovery_count: toFiniteNumber(summaryRow.recovery_count) ?? 0,
          temporary_error_count: toFiniteNumber(summaryRow.temporary_error_count) ?? 0,
          signed_out_count: toFiniteNumber(summaryRow.signed_out_count) ?? 0,
          signed_in_count: toFiniteNumber(summaryRow.signed_in_count) ?? 0,
          by_source: summaryRow.by_source ?? {},
          p50_duration_ms: toFiniteNumber(summaryRow.p50_duration_ms),
          p95_duration_ms: toFiniteNumber(summaryRow.p95_duration_ms),
          since: summaryRow.since,
          until_ts: summaryRow.until_ts,
        },
        recent_rows: [],
      }),
    );
  }

  const recentRows = ((recentData as RecentTelemetryRow[] | null) ?? []).map((row) => ({
    id: row.id,
    device_id_truncated: truncateDeviceId(row.device_id),
    outcome: row.outcome,
    source: row.source,
    state_at_emit: row.state_at_emit,
    created_at: row.created_at,
  }));

  return withSecurityHeaders(
    NextResponse.json({
      summary: {
        total_count: toFiniteNumber(summaryRow.total_count) ?? 0,
        ready_count: toFiniteNumber(summaryRow.ready_count) ?? 0,
        conflict_count: toFiniteNumber(summaryRow.conflict_count) ?? 0,
        recovery_count: toFiniteNumber(summaryRow.recovery_count) ?? 0,
        temporary_error_count: toFiniteNumber(summaryRow.temporary_error_count) ?? 0,
        signed_out_count: toFiniteNumber(summaryRow.signed_out_count) ?? 0,
        signed_in_count: toFiniteNumber(summaryRow.signed_in_count) ?? 0,
        by_source: summaryRow.by_source ?? {},
        p50_duration_ms: toFiniteNumber(summaryRow.p50_duration_ms),
        p95_duration_ms: toFiniteNumber(summaryRow.p95_duration_ms),
        since: summaryRow.since,
        until_ts: summaryRow.until_ts,
      },
      recent_rows: recentRows,
    }),
  );
}
