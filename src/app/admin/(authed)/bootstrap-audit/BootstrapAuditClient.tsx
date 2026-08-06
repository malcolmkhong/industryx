"use client";

/**
 * Client island for /admin/bootstrap-audit.
 *
 * Renders the server-pre-fetched telemetry data and exposes a Refresh
 * button that re-fetches via /api/admin/bootstrap-audit (GET). The route
 * uses the same RPC + table query, so behavior is identical.
 */

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Activity,
  AlertTriangle,
  Gauge,
  Hammer,
  LogOut,
  LogIn,
} from "lucide-react";

import type { BootstrapAuditData } from "./page";

interface BootstrapAuditClientProps {
  initialData: BootstrapAuditData;
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0.0%";
  const pct = (numerator / denominator) * 100;
  return `${pct.toFixed(1)}%`;
}

function formatMs(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)} ms`;
}

function formatBySource(bySource: Record<string, string | number>): string {
  const entries = Object.entries(bySource);
  if (entries.length === 0) return "none";
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

function formatRelativeTs(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "default" | "warning" | "danger" | "success";
}) {
  const toneClasses: Record<typeof tone, string> = {
    default: "text-muted-label",
    warning: "text-warning",
    danger: "text-danger",
    success: "text-success",
  };
  return (
    <div className="border border-muted-label/40 rounded-xl p-4 bg-background/80">
      <div className="flex items-center gap-2 mb-2">
        <span className={toneClasses[tone]}>{icon}</span>
        <span className="text-xs text-muted-label">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${toneClasses[tone]}`}>{value}</p>
      {sub ? <p className="text-xs text-muted-label mt-1">{sub}</p> : null}
    </div>
  );
}

export function BootstrapAuditClient({ initialData }: BootstrapAuditClientProps) {
  const [data, setData] = useState<BootstrapAuditData>(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(initialData.error ?? null);

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await fetch("/api/admin/bootstrap-audit", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as BootstrapAuditData;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh audit");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // No periodic polling here (PER-008). Manual refresh only.
  }, []);

  const summary = data.summary;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Bootstrap Audit</h2>
          <p className="text-sm text-muted-label mt-1">
            Anonymized bootstrap outcome telemetry (last 24h)
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-label hover:text-white bg-background/40 hover:bg-background/60 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mb-4 p-3 border border-danger/40 rounded-lg bg-danger/10 text-danger text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label="Total bootstraps (24h)"
          value={summary.total_count.toLocaleString()}
          icon={<Activity className="w-4 h-4" />}
          tone="default"
        />
        <MetricCard
          label="Conflict rate"
          value={formatPercent(summary.conflict_count, summary.total_count)}
          sub={`${summary.conflict_count.toLocaleString()} conflicts`}
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="warning"
        />
        <MetricCard
          label="Recovery rate"
          value={formatPercent(summary.recovery_count, summary.total_count)}
          sub={`${summary.recovery_count.toLocaleString()} recovery_required`}
          icon={<Hammer className="w-4 h-4" />}
          tone="danger"
        />
        <MetricCard
          label="p95 duration"
          value={formatMs(summary.p95_duration_ms)}
          sub={summary.p50_duration_ms !== null ? `p50 ${formatMs(summary.p50_duration_ms)}` : "p50 —"}
          icon={<Gauge className="w-4 h-4" />}
          tone="default"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <MetricCard
          label="Signed out (24h)"
          value={summary.signed_out_count.toLocaleString()}
          icon={<LogOut className="w-4 h-4" />}
          tone="default"
        />
        <MetricCard
          label="Signed in (24h)"
          value={summary.signed_in_count.toLocaleString()}
          icon={<LogIn className="w-4 h-4" />}
          tone="success"
        />
        <MetricCard
          label="Temporary errors (24h)"
          value={summary.temporary_error_count.toLocaleString()}
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="warning"
        />
      </div>

      <div className="mb-6 text-xs text-muted-label">
        <span className="font-semibold text-subtle">Outcomes by source:</span>{" "}
        {formatBySource(summary.by_source)}
      </div>

      <h3 className="text-sm font-semibold text-subtle mb-3">
        Recent conflicts &amp; recovery_required events
      </h3>
      <div className="overflow-x-auto rounded-xl border border-muted-label/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-muted-label/40 bg-background/40">
              <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label">
                Device ID
              </th>
              <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label">
                Outcome
              </th>
              <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label hidden sm:table-cell">
                Source
              </th>
              <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label hidden md:table-cell">
                State at emit
              </th>
              <th scope="col" className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label">
                Created (local)
              </th>
            </tr>
          </thead>
          <tbody>
            {data.recent_rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-xs text-muted-label"
                >
                  No conflict or recovery_required telemetry in the last 24h.
                </td>
              </tr>
            ) : (
              data.recent_rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-muted-label/20 last:border-b-0 hover:bg-background/40"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-subtle">
                    {row.device_id_truncated}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${
                        row.outcome === "conflict"
                          ? "bg-warning/15 text-warning border border-warning/20"
                          : "bg-danger/15 text-danger border border-danger/20"
                      }`}
                    >
                      {row.outcome}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-label hidden sm:table-cell">
                    {row.source ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-label hidden md:table-cell">
                    {row.state_at_emit ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-label text-right">
                    {formatRelativeTs(row.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-label">
        Window: {formatRelativeTs(summary.since)} → {formatRelativeTs(summary.until_ts)}.
        Privacy: deviceId is a generated UUID; no email, IP, raw fingerprint, or session tokens are stored.
      </p>
    </>
  );
}
