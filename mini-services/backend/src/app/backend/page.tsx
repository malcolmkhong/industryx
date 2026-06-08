"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface NavItem {
  label: string;
  icon: string;
  href: string;
  active: boolean;
  disabled: boolean;
  phase: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", icon: "layout-dashboard", href: "/backend", active: true, disabled: false, phase: "" },
  { label: "Players", icon: "user-person", href: "/players", active: false, disabled: false, phase: "" },
  { label: "Investigations", icon: "shield", href: "/investigations", active: false, disabled: false, phase: "" },
  { label: "Player Actions", icon: "scroll", href: "/audit", active: false, disabled: false, phase: "" },
  { label: "Admin Actions", icon: "gavel", href: "/admin-audit", active: false, disabled: false, phase: "" },
  { label: "Config Tables", icon: "database", href: "/config", active: false, disabled: false, phase: "" },
  { label: "Admin", icon: "users", href: "/admins", active: false, disabled: false, phase: "" },
];

function IconRenderer({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    "layout-dashboard": (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
      </svg>
    ),
    database: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />
      </svg>
    ),
    users: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    shield: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      </svg>
    ),
    scroll: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" /><path d="M19 3H9v7h14V5a2 2 0 0 0-2-2Z" />
      </svg>
    ),
    "user-person": (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" />
      </svg>
    ),
    gavel: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m14.5 12.5 2-2" /><path d="m14 5-8.5 8.5-1.5 5 5-1.5L17.5 3.5a2.12 2.12 0 0 1 3 3Z" /><path d="M2 19h20" />
      </svg>
    ),
  };
  return icons[name] || null;
}

export default function BackendDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [statsLoading, setStatsLoading] = useState(true);
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
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, [supabase]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    if (!loading && user) {
      fetchDashboardData();
    }
  }, [loading, user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Top Header */}
      <header className="h-14 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20h20" /><path d="M5 20V8l7-5 7 5v12" /><path d="M9 20v-6h6v6" />
            </svg>
          </div>
          <h1 className="text-white font-semibold text-sm sm:text-base">IndustriaX Backend</h1>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={fetchDashboardData}
            disabled={statsLoading}
            className="text-zinc-400 hover:text-amber-400 transition-colors p-1.5 rounded-md hover:bg-zinc-800"
            title="Refresh data"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={statsLoading ? "animate-spin" : ""}>
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" />
            </svg>
          </button>
          <span className="text-zinc-400 text-xs hidden sm:block">
            {currentTime.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <span className="text-zinc-300 text-xs sm:text-sm max-w-[150px] truncate">
              {user?.email || "Unknown"}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-zinc-400 hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-zinc-800"
            title="Sign out"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden md:flex w-56 bg-zinc-900/50 border-r border-zinc-800 flex-col shrink-0">
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => (
              item.disabled ? (
                <div
                  key={item.label}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-600 cursor-not-allowed"
                >
                  <IconRenderer name={item.icon} />
                  <span className="flex-1">{item.label}</span>
                  {item.phase && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                      {item.phase}
                    </span>
                  )}
                </div>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    item.active
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  <IconRenderer name={item.icon} />
                  <span className="flex-1">{item.label}</span>
                  {item.active && (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </a>
              )
            ))}
          </nav>

          <div className="p-3 border-t border-zinc-800">
            <div className="p-3 bg-zinc-800/50 rounded-lg">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Phase</p>
              <p className="text-xs text-amber-400 font-medium">Phase 3 — Admin & Moderation</p>
              <div className="mt-2 w-full bg-zinc-700 rounded-full h-1.5">
                <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: "80%" }} />
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Welcome Card */}
          <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/5 border border-amber-500/20 rounded-2xl p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  Welcome back, Admin
                </h2>
                <p className="text-zinc-400 text-sm mt-1">
                  IndustriaX Backend Management Console is operational.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 text-sm font-medium">System Online</span>
              </div>
            </div>
          </div>

          {/* Live Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {/* Total Players */}
            <a href="/players" className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 block hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                    <circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" />
                  </svg>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Total Players</p>
                  <p className="text-white text-2xl font-bold">
                    {statsLoading ? <span className="inline-block w-8 h-6 bg-zinc-800 rounded animate-pulse" /> : (stats?.totalPlayers ?? 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-emerald-400 text-xs">Registered accounts</span>
              </div>
            </a>

            {/* Online Now */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                    <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                  </svg>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Online Now</p>
                  <p className="text-white text-2xl font-bold">
                    {statsLoading ? <span className="inline-block w-8 h-6 bg-zinc-800 rounded animate-pulse" /> : (stats?.onlinePlayers ?? 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-blue-400 text-xs">Active sessions</span>
              </div>
            </div>

            {/* Open Investigations */}
            <a href="/investigations" className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 block hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                  </svg>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Open Investigations</p>
                  <p className="text-white text-2xl font-bold">
                    {statsLoading ? <span className="inline-block w-8 h-6 bg-zinc-800 rounded animate-pulse" /> : (stats?.openInvestigations ?? 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-amber-400 text-xs">Pending review</span>
              </div>
            </a>

            {/* Locked Accounts */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Locked Accounts</p>
                  <p className="text-white text-2xl font-bold">
                    {statsLoading ? <span className="inline-block w-8 h-6 bg-zinc-800 rounded animate-pulse" /> : (stats?.lockedAccounts ?? 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-red-400 text-xs">Restricted access</span>
              </div>
            </div>

            {/* Actions Today */}
            <a href="/audit" className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 block hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Actions Today</p>
                  <p className="text-white text-2xl font-bold">
                    {statsLoading ? <span className="inline-block w-8 h-6 bg-zinc-800 rounded animate-pulse" /> : (stats?.totalActionsToday ?? 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="text-purple-400 text-xs">Player actions logged</span>
              </div>
            </a>

            {/* Invalid Actions */}
            <a href="/audit" className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 block hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-400">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />
                  </svg>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Invalid Actions</p>
                  <p className="text-white text-2xl font-bold">
                    {statsLoading ? <span className="inline-block w-8 h-6 bg-zinc-800 rounded animate-pulse" /> : (stats?.invalidActionsToday ?? 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-400" />
                <span className="text-orange-400 text-xs">Flagged today</span>
              </div>
            </a>
          </div>

          {/* Quick Info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Service Info */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-white font-medium text-sm mb-4">Service Information</h3>
              <div className="space-y-3">
                {[
                  { label: "Service", value: "IndustriaX Backend" },
                  { label: "Version", value: "0.3.0" },
                  { label: "Phase", value: "3 — Admin & Moderation" },
                  { label: "Port", value: "3001" },
                  { label: "Framework", value: "Next.js 16 + App Router" },
                  { label: "Database", value: "Supabase (PostgreSQL)" },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-zinc-800 last:border-0">
                    <span className="text-zinc-500 text-xs">{item.label}</span>
                    <span className="text-zinc-300 text-xs font-mono">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Player Actions */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium text-sm">Recent Actions</h3>
                <a href="/audit" className="text-amber-400 text-xs hover:text-amber-300">View all →</a>
              </div>
              <div className="space-y-1">
                {statsLoading ? (
                  [1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-zinc-800/50 rounded animate-pulse" />
                  ))
                ) : recentActions.length === 0 ? (
                  <p className="text-zinc-600 text-xs py-4 text-center">No recent actions</p>
                ) : (
                  recentActions.map((action, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        action.is_valid ? "bg-emerald-400" : "bg-red-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-300 text-xs font-medium">
                          {String(action.action_type || "Unknown")}
                        </p>
                        <p className="text-zinc-500 text-xs truncate">
                          {(action.user_email as string) || String(action.user_id || "").slice(0, 8) + "..."}
                        </p>
                      </div>
                      <span className="text-zinc-600 text-[10px] shrink-0">
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
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium text-sm">Recent Investigations</h3>
                <a href="/investigations" className="text-amber-400 text-xs hover:text-amber-300">View all →</a>
              </div>
              <div className="space-y-1">
                {statsLoading ? (
                  [1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-zinc-800/50 rounded animate-pulse" />
                  ))
                ) : recentInvestigations.length === 0 ? (
                  <p className="text-zinc-600 text-xs py-4 text-center">No recent investigations</p>
                ) : (
                  recentInvestigations.map((inv, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        inv.status === "open" ? "bg-amber-400" :
                        inv.status === "resolved" ? "bg-emerald-400" :
                        "bg-red-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-300 text-xs font-medium">
                          {String(inv.detection_type || "Unknown")}
                          <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${
                            inv.severity === "high" ? "bg-red-500/15 text-red-400" :
                            inv.severity === "medium" ? "bg-amber-500/15 text-amber-400" :
                            "bg-zinc-500/15 text-zinc-400"
                          }`}>
                            {String(inv.severity || "low")}
                          </span>
                        </p>
                        <p className="text-zinc-500 text-xs truncate">
                          {(inv.user_email as string) || String(inv.user_id || "").slice(0, 8) + "..."}
                        </p>
                      </div>
                      <span className="text-zinc-600 text-[10px] shrink-0">
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
        </main>
      </div>
    </div>
  );
}
