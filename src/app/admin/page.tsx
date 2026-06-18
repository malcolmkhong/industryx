"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdminPresence } from "@/lib/hooks/useAdminPresence";

export default function BackendDashboard() {
  const [statsLoading, setStatsLoading] = useState(true);
  const { onlineCount: presenceOnlineCount, loggedInCount: presenceLoggedInCount, isConnected: presenceConnected } = useAdminPresence();
  const [stats, setStats] = useState<{
    totalPlayers: number;
    onlinePlayers: number;
    openInvestigations: number;
    lockedAccounts: number;
    totalActionsToday: number;
    invalidActionsToday: number;
  } | null>(null);
  const [recentActions, setRecentActions] = useState<Record<string, unknown>[]>([]);
  const [recentInvestigations, setRecentInvestigations] = useState<Record<string, unknown>[]>([]);

  const fetchDashboardData = async () => {
    try {
      setStatsLoading(true);
      const [statsRes, actionsRes, investigationsRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/actions?limit=5"),
        fetch("/api/admin/investigations?limit=5"),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const s = statsData.data;
        setStats({
          totalPlayers: s.total_players ?? 0,
          onlinePlayers: s.online_players ?? 0,
          openInvestigations: s.open_investigations ?? 0,
          lockedAccounts: s.locked_accounts ?? 0,
          totalActionsToday: s.total_actions_today ?? 0,
          invalidActionsToday: s.invalid_actions_today ?? 0,
        });
      }

      if (actionsRes.ok) {
        const actionsData = await actionsRes.json();
        setRecentActions(actionsData.data || []);
      }

      if (investigationsRes.ok) {
        const investigationsData = await investigationsRes.json();
        setRecentInvestigations(investigationsData.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <>
      {/* Welcome Card */}
      <div className="bg-linear-to-br from-warning/60/10 to-domain/80/5 border border-warning/20 rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Welcome back, Admin
            </h2>
            <p className="text-muted-label text-sm mt-1">
              IndustriaX Backend Management Console is operational.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-success text-sm font-medium">System Online</span>
            <button
              type="button"
              onClick={fetchDashboardData}
              disabled={statsLoading}
              aria-label="Refresh dashboard data"
              className="text-muted-label hover:text-warning transition-colors p-1.5 rounded-md hover:bg-background/60"
              title="Refresh data"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={statsLoading ? "animate-spin" : ""}>
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Live Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* Total Players */}
        <Link href="/admin/players" className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5 block hover:border-muted-label/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                <circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Total Players</p>
              <p className="text-white text-2xl font-bold">
                {statsLoading ? <span className="inline-block w-8 h-6 bg-background/60 rounded animate-pulse" /> : (stats?.totalPlayers ?? 0)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-success text-xs">Registered accounts</span>
          </div>
        </Link>

        {/* Online Now — real-time via Supabase Presence */}
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Online Now</p>
              <p className="text-white text-2xl font-bold">
                {presenceOnlineCount !== null ? (
                  presenceOnlineCount
                ) : statsLoading ? (
                  <span className="inline-block w-8 h-6 bg-background/60 rounded animate-pulse" />
                ) : (
                  stats?.onlinePlayers ?? 0
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {presenceConnected ? (
              <>
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-success text-xs">Live ({presenceLoggedInCount} logged in)</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-brand" />
                <span className="text-brand text-xs">Active sessions</span>
              </>
            )}
          </div>
        </div>

        {/* Open Investigations */}
        <Link href="/admin/investigations" className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5 block hover:border-muted-label/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-warning">
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Open Investigations</p>
              <p className="text-white text-2xl font-bold">
                {statsLoading ? <span className="inline-block w-8 h-6 bg-background/60 rounded animate-pulse" /> : (stats?.openInvestigations ?? 0)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-warning" />
            <span className="text-warning text-xs">Pending review</span>
          </div>
        </Link>

        {/* Locked Accounts */}
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-danger/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Locked Accounts</p>
              <p className="text-white text-2xl font-bold">
                {statsLoading ? <span className="inline-block w-8 h-6 bg-background/60 rounded animate-pulse" /> : (stats?.lockedAccounts ?? 0)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-danger" />
            <span className="text-danger text-xs">Restricted access</span>
          </div>
        </div>

        {/* Actions Today */}
        <Link href="/admin/audit" className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5 block hover:border-muted-label/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-research/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-research">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Actions Today</p>
              <p className="text-white text-2xl font-bold">
                {statsLoading ? <span className="inline-block w-8 h-6 bg-background/60 rounded animate-pulse" /> : (stats?.totalActionsToday ?? 0)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-research" />
            <span className="text-research text-xs">Player actions logged</span>
          </div>
        </Link>

        {/* Invalid Actions */}
        <Link href="/admin/audit" className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5 block hover:border-muted-label/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-domain/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-domain">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Invalid Actions</p>
              <p className="text-white text-2xl font-bold">
                {statsLoading ? <span className="inline-block w-8 h-6 bg-background/60 rounded animate-pulse" /> : (stats?.invalidActionsToday ?? 0)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-domain/50" />
            <span className="text-domain text-xs">Flagged today</span>
          </div>
        </Link>
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Service Info */}
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <h3 className="text-white font-medium text-sm mb-4">Service Information</h3>
          <div className="space-y-3">
            {[
              { label: "Service", value: "IndustriaX Backend" },
              { label: "Version", value: "0.3.0" },
              { label: "Phase", value: "3 — Admin & Moderation" },
              { label: "Port", value: "3000" },
              { label: "Framework", value: "Next.js 16 + App Router" },
              { label: "Database", value: "Supabase (PostgreSQL)" },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-muted-label/40 last:border-0">
                <span className="text-muted-label text-xs">{item.label}</span>
                <span className="text-subtle text-xs font-mono">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Player Actions */}
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium text-sm">Recent Actions</h3>
            <Link href="/admin/audit" className="text-warning text-xs hover:text-warning">View all →</Link>
          </div>
          <div className="space-y-1">
            {statsLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-background/60/50 rounded animate-pulse" />
              ))
            ) : recentActions.length === 0 ? (
              <p className="text-muted-label/80 text-xs py-4 text-center">No recent actions</p>
            ) : (
              recentActions.map((action, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-muted-label/40 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    action.is_valid ? "bg-success" : "bg-danger"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-subtle text-xs font-medium">
                      {String(action.action_type || "Unknown")}
                    </p>
                    <p className="text-muted-label text-xs truncate">
                      {(action.user_email as string) || String(action.user_id || "").slice(0, 8) + "..."}
                    </p>
                  </div>
                  <span className="text-muted-label/80 text-[10px] shrink-0">
                    {action.created_at
                      ? new Date(action.created_at as string).toLocaleTimeString()
                      : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Investigations */}
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium text-sm">Recent Investigations</h3>
            <Link href="/admin/investigations" className="text-warning text-xs hover:text-warning">View all →</Link>
          </div>
          <div className="space-y-1">
            {statsLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-background/60/50 rounded animate-pulse" />
              ))
            ) : recentInvestigations.length === 0 ? (
              <p className="text-muted-label/80 text-xs py-4 text-center">No recent investigations</p>
            ) : (
              recentInvestigations.map((inv, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-muted-label/40 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    inv.status === "open" ? "bg-warning" :
                    inv.status === "resolved" ? "bg-success" :
                    "bg-danger"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-subtle text-xs font-medium">
                      {String(inv.detection_type || "Unknown")}
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${
                        inv.severity === "high" ? "bg-danger/15 text-danger" :
                        inv.severity === "medium" ? "bg-warning/15 text-warning" :
                        "bg-background/20/15 text-muted-label"
                      }`}>
                        {String(inv.severity || "low")}
                      </span>
                    </p>
                    <p className="text-muted-label text-xs truncate">
                      {(inv.user_email as string) || String(inv.user_id || "").slice(0, 8) + "..."}
                    </p>
                  </div>
                  <span className="text-muted-label/80 text-[10px] shrink-0">
                    {inv.created_at
                      ? new Date(inv.created_at as string).toLocaleTimeString()
                      : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

