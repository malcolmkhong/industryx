/**
 * /admin/bootstrap-audit
 *
 * Server component per AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §21 PR 5.
 * Renders the bootstrap-telemetry audit dashboard (4 metric cards + a
 * table of recent conflict / recovery_required events).
 *
 * AUTH (AUT-001): `verifyAdmin()` enforces admin privileges server-side.
 * Uses the same redirect-to-login / forbidden pattern as existing admin
 * guards.
 *
 * Data (DB-002 + RPC permissions): `get_bootstrap_telemetry_summary()` is
 * SECURITY DEFINER; called via the service-role client.
 */

import { redirect } from "next/navigation";

import { verifyAdmin } from "@/lib/auth/admin";
import { getDbClient } from '@/lib/db/access';

import { BootstrapAuditClient } from "./BootstrapAuditClient";

export const dynamic = "force-dynamic";

interface SummaryRow {
  total_count: string | number | null;
  ready_count: string | number | null;
  conflict_count: string | number | null;
  recovery_count: string | number | null;
  temporary_error_count: string | number | null;
  signed_out_count: string | number | null;
  signed_in_count: string | number | null;
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

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function truncateDeviceId(deviceId: string): string {
  if (deviceId.length <= 12) return deviceId;
  return `${deviceId.slice(0, 8)}…${deviceId.slice(-4)}`;
}

export interface BootstrapAuditData {
  summary: {
    total_count: number;
    ready_count: number;
    conflict_count: number;
    recovery_count: number;
    temporary_error_count: number;
    signed_out_count: number;
    signed_in_count: number;
    by_source: Record<string, string | number>;
    p50_duration_ms: number | null;
    p95_duration_ms: number | null;
    since: string;
    until_ts: string;
  };
  recent_rows: Array<{
    id: string;
    device_id_truncated: string;
    outcome: string;
    source: string | null;
    state_at_emit: string | null;
    created_at: string;
  }>;
  error?: string;
}

async function loadBootstrapAudit(): Promise<BootstrapAuditData> {
  const supabase = getDbClient();
  if (!supabase) {
    return {
      summary: {
        total_count: 0,
        ready_count: 0,
        conflict_count: 0,
        recovery_count: 0,
        temporary_error_count: 0,
        signed_out_count: 0,
        signed_in_count: 0,
        by_source: {},
        p50_duration_ms: null,
        p95_duration_ms: null,
        since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        until_ts: new Date().toISOString(),
      },
      recent_rows: [],
      error: "service unavailable",
    };
  }

  const { data: summaryData, error: summaryError } = await supabase.rpc(
    "get_bootstrap_telemetry_summary",
    {},
  );

  if (summaryError) {
    return {
      summary: {
        total_count: 0,
        ready_count: 0,
        conflict_count: 0,
        recovery_count: 0,
        temporary_error_count: 0,
        signed_out_count: 0,
        signed_in_count: 0,
        by_source: {},
        p50_duration_ms: null,
        p95_duration_ms: null,
        since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        until_ts: new Date().toISOString(),
      },
      recent_rows: [],
      error: summaryError.message,
    };
  }

  const summaryRow = (summaryData as SummaryRow[] | null)?.[0];
  if (!summaryRow) {
    return {
      summary: {
        total_count: 0,
        ready_count: 0,
        conflict_count: 0,
        recovery_count: 0,
        temporary_error_count: 0,
        signed_out_count: 0,
        signed_in_count: 0,
        by_source: {},
        p50_duration_ms: null,
        p95_duration_ms: null,
        since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        until_ts: new Date().toISOString(),
      },
      recent_rows: [],
      error: "summary returned no row",
    };
  }

  const { data: recentData } = await supabase
    .from("bootstrap_telemetry")
    .select("id,device_id,outcome,source,state_at_emit,created_at")
    .in("outcome", ["conflict", "recovery_required"])
    .order("created_at", { ascending: false })
    .limit(RECENT_ROW_LIMIT);

  const recentRows = ((recentData as RecentTelemetryRow[] | null) ?? []).map((row) => ({
    id: row.id,
    device_id_truncated: truncateDeviceId(row.device_id),
    outcome: row.outcome,
    source: row.source,
    state_at_emit: row.state_at_emit,
    created_at: row.created_at,
  }));

  return {
    summary: {
      total_count: toNumber(summaryRow.total_count),
      ready_count: toNumber(summaryRow.ready_count),
      conflict_count: toNumber(summaryRow.conflict_count),
      recovery_count: toNumber(summaryRow.recovery_count),
      temporary_error_count: toNumber(summaryRow.temporary_error_count),
      signed_out_count: toNumber(summaryRow.signed_out_count),
      signed_in_count: toNumber(summaryRow.signed_in_count),
      by_source: summaryRow.by_source ?? {},
      p50_duration_ms: toFiniteNumber(summaryRow.p50_duration_ms),
      p95_duration_ms: toFiniteNumber(summaryRow.p95_duration_ms),
      since: summaryRow.since,
      until_ts: summaryRow.until_ts,
    },
    recent_rows: recentRows,
  };
}

export default async function BootstrapAuditPage() {
  const authResult = await verifyAdmin();
  if ("error" in authResult) {
    // Mirror the existing /admin/forbidden flow.
    if (authResult.error.status === 401) {
      redirect("/admin/login");
    }
    redirect("/admin/forbidden");
  }

  const data = await loadBootstrapAudit();

  return <BootstrapAuditClient initialData={data} />;
}
