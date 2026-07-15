"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdminPresence } from "@/lib/hooks/useAdminPresence";
import { RefreshCw, User, Clock, Shield, Activity, AlertTriangle, Lock } from "lucide-react";

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
  const [recentActions, setRecentActions] = useState<Array<{
    id: string;
    action_type: string;
    is_valid: boolean;
    user_email: string | null;
    user_id: string | null;
    created_at: string | null;
  }>>([]);
  const [recentInvestigations, setRecentInvestigations] = useState<Array<{
    id: string;
    status: string;
    detection_type: string;
    severity: string;
    user_email: string | null;
    user_id: string | null;
    created_at: string | null;
  }>>([]);

  const fetchDashboardData = async () => {
    try {
      setStatsLoading(true);
      const [statsRes, actionsRes, investigationsRes] = await Promise.all([
        fetch("/api/admin/system/stats"),
        fetch("/api/admin/audit/player-actions?limit=5"),
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
              <RefreshCw size={16} className={statsLoading ? "animate-spin" : ""} />
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
              <User size={18} className="text-success" />
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
              <Clock size={18} className="text-brand" />
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
              <Shield size={18} className="text-warning" />
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
              <Lock size={18} className="text-danger" />
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
              <Activity size={18} className="text-research" />
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
              <AlertTriangle size={18} className="text-domain" />
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
              recentActions.map((action) => (
                <div key={action.id} className="flex items-start gap-3 py-2 border-b border-muted-label/40 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    action.is_valid ? "bg-success" : "bg-danger"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-subtle text-xs font-medium">
                      {String(action.action_type || "Unknown")}
                    </p>
                    <p className="text-muted-label text-xs truncate">
                      {(action.user_email) || String(action.user_id || "").slice(0, 8) + "..."}
                    </p>
                  </div>
                  <span className="text-muted-label/80 text-[10px] shrink-0">
                    {action.created_at
                      ? new Date(action.created_at).toLocaleTimeString()
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
              recentInvestigations.map((inv) => (
                <div key={inv.id} className="flex items-start gap-3 py-2 border-b border-muted-label/40 last:border-0">
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
                      {(inv.user_email) || String(inv.user_id || "").slice(0, 8) + "..."}
                    </p>
                  </div>
                  <span className="text-muted-label/80 text-[10px] shrink-0">
                    {inv.created_at
                      ? new Date(inv.created_at).toLocaleTimeString()
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

