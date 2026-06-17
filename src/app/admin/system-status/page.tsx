'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, CheckCircle2, AlertCircle, XCircle, HelpCircle } from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latencyMs?: number;
  detail?: string;
}

interface JobStatus {
  name: string;
  schedule: string;
  lastRun: string | null;
  status: 'ok' | 'late' | 'failed' | 'unknown';
  detail: string;
}

interface SystemStatusData {
  status: string;
  timestamp: string;
  uptime: number;
  responseTimeMs: number;
  services: ServiceStatus[];
  jobs: JobStatus[];
  alerts: string[];
  summary: {
    healthy: number;
    degraded: number;
    down: number;
    unknown: number;
  };
}

const statusIcons: Record<string, React.ReactNode> = {
  healthy: <CheckCircle2 className="w-4 h-4 text-success" />,
  degraded: <AlertCircle className="w-4 h-4 text-warning" />,
  down: <XCircle className="w-4 h-4 text-danger/60" />,
  unknown: <HelpCircle className="w-4 h-4 text-muted-label" />,
};

const statusColors: Record<string, string> = {
  healthy: 'border-success/20 bg-success/5',
  degraded: 'border-warning/60/20 bg-warning/60/5',
  down: 'border-danger/20 bg-danger/5',
  unknown: 'border-muted-label/30 bg-background/60/30',
};

const jobStatusBadge: Record<string, string> = {
  ok: 'bg-success/10 text-success border-success/20',
  late: 'bg-warning/60/10 text-warning border-warning/60/20',
  failed: 'bg-danger/10 text-danger/60 border-danger/20',
  unknown: 'bg-background/40/50 text-muted-label border-muted-label/20/30',
};

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatLastRun(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function SystemStatusPage() {
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/admin/system-status');
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch system status:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-muted-label/20 border-t-warning/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">System Status</h2>
          <p className="text-sm text-muted-label mt-1">
            Infrastructure health and connectivity monitoring
          </p>
        </div>
        <button
          type="button"
          onClick={fetchStatus}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-label hover:text-white bg-background/60/50 hover:bg-background/40/50 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {data && (
        <>
          {/* Overall Banner */}
          <div
            className={[
              'flex items-center gap-3 rounded-xl border p-4 mb-6',
              data.status === 'healthy' ? 'border-success/20 bg-success/5' : 'border-warning/60/20 bg-warning/60/5',
            ].join(' ')}
          >
            <div
              className={[
                'w-3 h-3 rounded-full animate-pulse',
                data.status === 'healthy' ? 'bg-success/60' : 'bg-warning/50',
              ].join(' ')}
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white capitalize">
                System {data.status}
              </p>
              <p className="text-xs text-muted-label">
                {data.summary.healthy} healthy · {data.summary.degraded} degraded · {data.summary.down} down
                {data.summary.unknown > 0 && ` · ${data.summary.unknown} unknown`}
              </p>
            </div>
            <div className="text-right text-xs text-muted-label">
              <div>Uptime {formatUptime(data.uptime)}</div>
              <div>Response {data.responseTimeMs}ms</div>
            </div>
          </div>

          {/* Services Grid */}
          <h3 className="text-sm font-semibold text-subtle mb-3">Services</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {data.services.map((svc) => (
              <div
                key={svc.name}
                className={['border rounded-xl p-4', statusColors[svc.status]].join(' ')}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white">{svc.name}</span>
                  {statusIcons[svc.status]}
                </div>
                <p className="text-xs text-muted-label">{svc.detail || svc.status}</p>
                {svc.latencyMs !== undefined && (
                  <p className="text-xs text-muted-label mt-1">{svc.latencyMs}ms latency</p>
                )}
              </div>
            ))}
          </div>

          {/* Jobs Table */}
          {data.jobs.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-subtle mb-3">Cron Jobs</h3>
              <div className="overflow-x-auto rounded-xl border border-muted-label/40 mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-muted-label/40">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label">Job</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label hidden sm:table-cell">Schedule</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label">Last Run</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label">Status</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label hidden md:table-cell">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((job) => (
                      <tr key={job.name} className="border-b border-muted-label/40/60 last:border-0">
                        <td className="px-4 py-2.5 text-sm text-white">{job.name}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-label hidden sm:table-cell">{job.schedule}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-label">
                          {formatLastRun(job.lastRun)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={['inline-flex text-[11px] font-semibold px-1.5 py-0.5 rounded border', jobStatusBadge[job.status]].join(' ')}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-label hidden md:table-cell max-w-[200px] truncate">
                          {job.detail}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Alerts */}
          {data.alerts.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-subtle mb-3">Alerts</h3>
              <div className="space-y-2 mb-6">
                {data.alerts.map((alert) => (
                  <div
                    key={alert}
                    className="flex items-start gap-3 p-3 rounded-lg border border-warning/60/10 bg-warning/60/5"
                  >
                    <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                    <p className="text-xs text-warning/80/80">{alert}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Timestamp */}
          <p className="text-xs text-muted-label/80 text-right">
            Last checked: {new Date(data.timestamp).toLocaleString()}
          </p>
        </>
      )}
    </>
  );
}
