// src/app/admin/monitoring/page.tsx
// Admin monitoring dashboard.
// Sections: Capacity (server-rendered from getCapacityStatus),
//           Activity (server-rendered from getCapacityStatus),
//           Supabase + Cloudflare infra (client-rendered from /api/admin/monitoring with 30s polling).
//
// Auth: the admin/layout already enforces session presence; the API route enforces
// authoritative admin check via verifyAdmin().

'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, RefreshCw, Cloud, Database, Cpu, Users, UserPlus, UserMinus, Hourglass, Gauge, CheckCircle2, AlertCircle, XCircle, HelpCircle } from 'lucide-react';

type CapacityStatus = 'healthy' | 'warning' | 'full';

interface CapacityInfo {
  total_players: number;
  registered_users: number;
  guest_users: number;
  waitlist_count: number;
  capacity_limit: number;
  utilization_pct: number;
  status: CapacityStatus;
}

interface ActivityInfo {
  active_15m: number;
  active_24h: number;
  active_7d: number;
}

interface SupabaseInfo {
  db_size_mb: number;
  db_limit_mb: number;
}

interface CloudflareInfo {
  status: 'configured' | 'missing_token' | 'error';
  workers_today?: number;
  ai_neurons_today?: number;
  detail?: string;
}

interface MonitoringData {
  capacity: CapacityInfo;
  activity: ActivityInfo;
  supabase: SupabaseInfo;
  cloudflare: CloudflareInfo;
  timestamp: string;
}

const statusColorClasses: Record<CapacityStatus, { dot: string; banner: string; text: string }> = {
  healthy: {
    dot: 'bg-success',
    banner: 'border-success/30 bg-success/5',
    text: 'text-success',
  },
  warning: {
    dot: 'bg-warning/70',
    banner: 'border-warning/40 bg-warning/5',
    text: 'text-warning',
  },
  full: {
    dot: 'bg-danger/70',
    banner: 'border-danger/30 bg-danger/5',
    text: 'text-danger',
  },
};

const statusIcon: Record<CapacityStatus, React.ReactNode> = {
  healthy: <CheckCircle2 className="w-4 h-4 text-success" />,
  warning: <AlertCircle className="w-4 h-4 text-warning" />,
  full: <XCircle className="w-4 h-4 text-danger" />,
};

const POLL_MS = 30_000;

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await fetch('/api/admin/monitoring', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as MonitoringData;
      setData(json);
      setLastUpdated(json.timestamp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load monitoring data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-muted-label/20 border-t-research rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Monitoring</h2>
          <p className="text-sm text-muted-label mt-1">
            Capacity, activity, and infrastructure metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-label hidden sm:inline">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={fetchData}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-label hover:text-white bg-card hover:bg-card/80 border border-muted-label/30 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-danger/30 bg-danger/5 rounded-xl p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Capacity Banner */}
          {(() => {
            const c = data.capacity;
            const s = statusColorClasses[c.status];
            return (
              <div className={`flex items-center gap-3 rounded-xl border p-4 ${s.banner}`}>
                <div className={`w-3 h-3 rounded-full animate-pulse ${s.dot}`} />
                <div className="flex-1">
                  <p className={`text-sm font-semibold capitalize ${s.text}`}>
                    Capacity {c.status}
                  </p>
                  <p className="text-xs text-muted-label">
                    {c.total_players} / {c.capacity_limit} players ({c.utilization_pct}% utilized)
                  </p>
                </div>
                <div className="text-right text-xs text-muted-label">
                  <div>{c.registered_users} registered</div>
                  <div>{c.guest_users} guests</div>
                  <div>{c.waitlist_count} on waitlist</div>
                </div>
              </div>
            );
          })()}

          {/* Capacity Stats */}
          <Section
            title="Capacity"
            icon={<BarChart3 className="w-4 h-4 text-research" />}
            description="Player counts vs. configured limit. Source: get_capacity_status() RPC."
          >
            <StatGrid>
              <Stat icon={<Users className="w-3.5 h-3.5" />} label="Total Players" value={data.capacity.total_players} />
              <Stat icon={<UserPlus className="w-3.5 h-3.5" />} label="Registered" value={data.capacity.registered_users} />
              <Stat icon={<UserMinus className="w-3.5 h-3.5" />} label="Guests" value={data.capacity.guest_users} />
              <Stat icon={<Hourglass className="w-3.5 h-3.5" />} label="On Waitlist" value={data.capacity.waitlist_count} />
              <Stat icon={<Gauge className="w-3.5 h-3.5" />} label="Capacity Limit" value={data.capacity.capacity_limit} />
              <Stat
                icon={statusIcon[data.capacity.status]}
                label="Utilization"
                value={`${data.capacity.utilization_pct}%`}
                valueClass={statusColorClasses[data.capacity.status].text}
              />
            </StatGrid>
          </Section>

          {/* Activity */}
          <Section
            title="Activity"
            icon={<BarChart3 className="w-4 h-4 text-research" />}
            description="Active players by recency (analytics only — not used for capacity enforcement)."
          >
            <StatGrid>
              <Stat label="Active 15m" value={data.activity.active_15m} />
              <Stat label="Active 24h" value={data.activity.active_24h} />
              <Stat label="Active 7d" value={data.activity.active_7d} />
            </StatGrid>
          </Section>

          {/* Supabase */}
          <Section
            title="Supabase"
            icon={<Database className="w-4 h-4 text-research" />}
            description="Database size relative to the free tier limit (500 MB)."
          >
            {(() => {
              const used = data.supabase.db_size_mb;
              const limit = data.supabase.db_limit_mb;
              const pct = limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0;
              const known = used > 0;
              return (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">
                      {known ? `${used} MB` : '—'}
                    </span>
                    <span className="text-xs text-muted-label">
                      {known ? `of ${limit} MB (${pct}%)` : 'db_size_mb unavailable — pg_database_size not exposed via RPC'}
                    </span>
                  </div>
                  {known && (
                    <div className="h-2 bg-background/40 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          pct > 80 ? 'bg-danger/70' : pct > 60 ? 'bg-warning/70' : 'bg-success'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })()}
          </Section>

          {/* Cloudflare */}
          <Section
            title="Cloudflare"
            icon={<Cloud className="w-4 h-4 text-research" />}
            description="Workers invocations and AI neurons consumed today."
          >
            <CloudflarePanel data={data.cloudflare} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-muted-label/30 rounded-xl p-5">
      <div className="flex items-start gap-2 mb-1">
        {icon}
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <p className="text-xs text-muted-label mb-4">{description}</p>
      {children}
    </section>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>;
}

function Stat({
  label,
  value,
  icon,
  valueClass,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="bg-background/40 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-label uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold text-white mt-1 ${valueClass ?? ''}`}>{value}</div>
    </div>
  );
}

function CloudflarePanel({ data }: { data: CloudflareInfo }) {
  if (data.status === 'missing_token') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-label">
        <HelpCircle className="w-4 h-4" />
        <span>
          Set <code className="text-white bg-background/40 px-1.5 py-0.5 rounded text-xs">CLOUDFLARE_API_TOKEN</code> and{' '}
          <code className="text-white bg-background/40 px-1.5 py-0.5 rounded text-xs">CLOUDFLARE_ACCOUNT_ID</code> to enable live metrics.
        </span>
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <div className="border border-warning/30 bg-warning/5 rounded-lg p-3 text-sm text-warning">
        Cloudflare API error: {data.detail || 'Unknown error'}
      </div>
    );
  }
  return (
    <StatGrid>
      <Stat
        icon={<Cpu className="w-3.5 h-3.5" />}
        label="Workers (today)"
        value={data.workers_today?.toLocaleString() ?? '—'}
      />
      <Stat
        icon={<Cpu className="w-3.5 h-3.5" />}
        label="AI Neurons (today)"
        value={data.ai_neurons_today?.toLocaleString() ?? '—'}
      />
    </StatGrid>
  );
}
