"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────

interface PlayerRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  money: number;
  game_tick: number;
  buildings_count: number;
  cheat_flag_count: number;
  is_locked: boolean;
  lock_reason: string | null;
  last_saved_at: string | null;
  created_at: string | null;
}

interface StatsData {
  total_players: number;
  online_players: number;
  locked_accounts: number;
  open_investigations: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ToastMessage {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────

function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

function IconFlag() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function truncateUid(uid: string, max = 8): string {
  if (uid.length <= max * 2 + 3) return uid;
  return uid.slice(0, max) + "..." + uid.slice(-4);
}

function formatMoney(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + "B";
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toLocaleString();
}

// ─── Component ────────────────────────────────────────────────────────────

export default function PlayersListPage() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data state
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Search & pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 50, total: 0, totalPages: 0 });

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // ─── Auth ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setAuthLoading(false);
    };
    getUser();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/admin/login";
  };

  // ─── Toast system ───────────────────────────────────────────────────────

  const addToast = useCallback((type: ToastMessage["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // ─── Fetch stats ────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await fetch("/api/admin/stats");
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to fetch stats");
      }
      const data = await res.json();
      setStats(data.data || null);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  }, [addToast]);

  // ─── Fetch players ──────────────────────────────────────────────────────

  const fetchPlayers = useCallback(async (searchStr: string, pageNum: number) => {
    try {
      setDataLoading(true);
      const params = new URLSearchParams({ page: String(pageNum), limit: "50" });
      if (searchStr) params.set("search", searchStr);
      const res = await fetch(`/api/admin/players?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to fetch players");
      }
      const data = await res.json();
      setPlayers(data.data || []);
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to load players");
    } finally {
      setDataLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchStats();
      fetchPlayers(activeSearch, page);
    }
  }, [authLoading, user, activeSearch, page, fetchStats, fetchPlayers]);

  // ─── Search handler ─────────────────────────────────────────────────────

  const handleSearch = () => {
    setPage(1);
    setActiveSearch(searchQuery);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const clearSearch = () => {
    setSearchQuery("");
    setActiveSearch("");
    setPage(1);
  };

  // ─── Copy to clipboard ─────────────────────────────────────────────────

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      addToast("info", "Copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      addToast("error", "Failed to copy");
    }
  };

  // ─── Auth loading ───────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading players page...</p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* ─── Top Header ─────────────────────────────────────────────────── */}
      <header className="h-14 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between px-4 sm:px-6 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button
            className="md:hidden text-zinc-400 hover:text-white p-1"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <IconMenu />
          </button>
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
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400">
              <IconUser />
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
            <IconLogout />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── Mobile Sidebar Overlay ──────────────────────────────────── */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-20"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ─── Sidebar ────────────────────────────────────────────────── */}
        <aside className={`
          fixed md:static inset-y-0 left-0 z-20 md:z-auto
          w-64 md:w-56 bg-zinc-900/95 md:bg-zinc-900/50 border-r border-zinc-800
          flex flex-col shrink-0 transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          pt-14 md:pt-0
        `}>
          <nav className="p-3 space-y-1 border-b border-zinc-800">
            <a
              href="/admin"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            >
              <IconDashboard />
              <span>Dashboard</span>
            </a>
            <a
              href="/admin/config"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            >
              <IconDatabase />
              <span>Config Tables</span>
            </a>
            <a
              href="/admin/admins"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            >
              <IconUsers />
              <span>Admin</span>
            </a>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="flex-1">Players</span>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-600 cursor-not-allowed">
              <IconShield />
              <span className="flex-1">Security Log</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">Phase 5</span>
            </div>
          </nav>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 px-2">
                Current User
              </p>
              <div className="px-2 py-2 rounded-lg bg-zinc-800/50">
                <p className="text-zinc-300 text-xs truncate">{user?.email || "Unknown"}</p>
                <p className="text-zinc-500 text-[10px] font-mono mt-0.5 truncate">{user?.id || ""}</p>
              </div>
            </div>
          </div>

          <div className="p-3 border-t border-zinc-800">
            <div className="p-3 bg-zinc-800/50 rounded-lg">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Phase</p>
              <p className="text-xs text-amber-400 font-medium">Phase 3 — Player Management</p>
              <div className="mt-2 w-full bg-zinc-700 rounded-full h-1.5">
                <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: "75%" }} />
              </div>
            </div>
          </div>
        </aside>

        {/* ─── Main Content ───────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-white text-xl font-bold">Players</h2>
                <p className="text-zinc-500 text-sm mt-1">
                  Search and manage IndustriaX game players
                </p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="mb-6">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                    <IconSearch />
                  </div>
                  <input
                    type="text"
                    placeholder="Search by email, user ID, or display name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-medium text-sm rounded-lg transition-colors shrink-0"
                >
                  Search
                </button>
                {activeSearch && (
                  <button
                    onClick={clearSearch}
                    className="px-3 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors border border-zinc-800 shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
              {activeSearch && (
                <p className="text-zinc-500 text-xs mt-2">
                  Showing results for: <span className="text-amber-400">&quot;{activeSearch}&quot;</span>
                </p>
              )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-[10px] sm:text-xs">Total Players</p>
                    {statsLoading ? (
                      <div className="h-6 w-12 bg-zinc-800 rounded animate-pulse mt-1" />
                    ) : (
                      <p className="text-white text-lg sm:text-2xl font-bold">{stats?.total_players ?? 0}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-[10px] sm:text-xs">Online</p>
                    {statsLoading ? (
                      <div className="h-6 w-12 bg-zinc-800 rounded animate-pulse mt-1" />
                    ) : (
                      <p className="text-white text-lg sm:text-2xl font-bold">{stats?.online_players ?? 0}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-[10px] sm:text-xs">Locked</p>
                    {statsLoading ? (
                      <div className="h-6 w-12 bg-zinc-800 rounded animate-pulse mt-1" />
                    ) : (
                      <p className="text-white text-lg sm:text-2xl font-bold">{stats?.locked_accounts ?? 0}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-400">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-[10px] sm:text-xs">Investigations</p>
                    {statsLoading ? (
                      <div className="h-6 w-12 bg-zinc-800 rounded animate-pulse mt-1" />
                    ) : (
                      <p className="text-white text-lg sm:text-2xl font-bold">{stats?.open_investigations ?? 0}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Players Table */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
              {dataLoading ? (
                <div className="p-8 space-y-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-14 bg-zinc-800/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : players.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-3xl mb-3">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600 mx-auto">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                    </svg>
                  </div>
                  <p className="text-zinc-400 text-sm mb-2">No players found</p>
                  <p className="text-zinc-600 text-xs">
                    {activeSearch ? "Try a different search term" : "No players have registered yet"}
                  </p>
                  {activeSearch && (
                    <button
                      onClick={clearSearch}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 text-sm rounded-lg hover:bg-amber-500/20 transition-colors border border-amber-500/20"
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Player</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">User ID</th>
                          <th className="px-4 py-3 text-right text-xs text-zinc-500 font-medium">Money</th>
                          <th className="px-4 py-3 text-right text-xs text-zinc-500 font-medium">Tick</th>
                          <th className="px-4 py-3 text-right text-xs text-zinc-500 font-medium">Buildings</th>
                          <th className="px-4 py-3 text-center text-xs text-zinc-500 font-medium">Flags</th>
                          <th className="px-4 py-3 text-center text-xs text-zinc-500 font-medium">Status</th>
                          <th className="px-4 py-3 text-right text-xs text-zinc-500 font-medium">Last Saved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((player) => (
                          <tr
                            key={player.user_id}
                            className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                            onClick={() => { window.location.href = `/admin/players/${player.user_id}`; }}
                          >
                            {/* Avatar + Email */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-sm font-medium shrink-0">
                                  {(player.email || player.display_name || "U")[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <span className="text-white text-sm truncate block max-w-[200px]">
                                    {player.email || player.display_name || "Unknown"}
                                  </span>
                                  {player.display_name && player.email && (
                                    <span className="text-zinc-500 text-[10px] block truncate max-w-[200px]">
                                      {player.display_name}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            {/* User ID */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <code className="text-zinc-400 text-xs font-mono">
                                  {truncateUid(player.user_id)}
                                </code>
                                <button
                                  onClick={(e) => { e.stopPropagation(); copyToClipboard(player.user_id); }}
                                  className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5 rounded"
                                  title="Copy full ID"
                                >
                                  {copiedId === player.user_id ? (
                                    <span className="text-success"><IconCheck /></span>
                                  ) : (
                                    <IconCopy />
                                  )}
                                </button>
                              </div>
                            </td>
                            {/* Money */}
                            <td className="px-4 py-3 text-right">
                              <span className="text-success text-sm font-medium font-mono">
                                ${formatMoney(player.money)}
                              </span>
                            </td>
                            {/* Game Tick */}
                            <td className="px-4 py-3 text-right">
                              <span className="text-zinc-300 text-xs font-mono">
                                {player.game_tick.toLocaleString()}
                              </span>
                            </td>
                            {/* Buildings */}
                            <td className="px-4 py-3 text-right">
                              <span className="text-zinc-300 text-xs">
                                {player.buildings_count}
                              </span>
                            </td>
                            {/* Flags */}
                            <td className="px-4 py-3 text-center">
                              {player.cheat_flag_count > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/15 text-orange-400 border border-orange-500/20">
                                  <IconFlag />
                                  {player.cheat_flag_count}
                                </span>
                              ) : (
                                <span className="text-zinc-600 text-xs">—</span>
                              )}
                            </td>
                            {/* Status */}
                            <td className="px-4 py-3 text-center">
                              {player.is_locked ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-red-500/15 text-red-400 border-red-500/20">
                                  Locked
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-success/15 text-success border-success/20">
                                  Active
                                </span>
                              )}
                            </td>
                            {/* Last Saved */}
                            <td className="px-4 py-3 text-right">
                              <span className="text-zinc-500 text-xs">
                                {player.last_saved_at
                                  ? new Date(player.last_saved_at).toLocaleDateString()
                                  : "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-zinc-800/50">
                    {players.map((player) => (
                      <div
                        key={player.user_id}
                        className="p-4 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                        onClick={() => { window.location.href = `/admin/players/${player.user_id}`; }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-sm font-medium shrink-0">
                            {(player.email || player.display_name || "U")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white text-sm font-medium truncate">
                                {player.email || player.display_name || "Unknown"}
                              </span>
                              {player.is_locked ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border bg-red-500/15 text-red-400 border-red-500/20">
                                  Locked
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border bg-success/15 text-success border-success/20">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <code className="text-zinc-500 text-[10px] font-mono truncate">
                                {truncateUid(player.user_id, 6)}
                              </code>
                              <button
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(player.user_id); }}
                                className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5"
                              >
                                {copiedId === player.user_id ? (
                                  <span className="text-success"><IconCheck /></span>
                                ) : (
                                  <IconCopy />
                                )}
                              </button>
                            </div>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              <span className="text-success text-xs font-mono">
                                ${formatMoney(player.money)}
                              </span>
                              <span className="text-zinc-500 text-[10px]">
                                Tick {player.game_tick.toLocaleString()}
                              </span>
                              <span className="text-zinc-500 text-[10px]">
                                {player.buildings_count} bldgs
                              </span>
                              {player.cheat_flag_count > 0 && (
                                <span className="inline-flex items-center gap-1 text-orange-400 text-[10px]">
                                  <IconFlag /> {player.cheat_flag_count}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
                      <p className="text-zinc-500 text-xs">
                        {pagination.total} player{pagination.total !== 1 ? "s" : ""} &middot; Page {pagination.page} of {pagination.totalPages}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={pagination.page <= 1}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:text-zinc-700 disabled:cursor-not-allowed transition-colors"
                        >
                          <IconChevronLeft />
                        </button>
                        {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (pagination.totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (pagination.page <= 3) {
                            pageNum = i + 1;
                          } else if (pagination.page >= pagination.totalPages - 2) {
                            pageNum = pagination.totalPages - 4 + i;
                          } else {
                            pageNum = pagination.page - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setPage(pageNum)}
                              className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                                pageNum === pagination.page
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                          disabled={pagination.page >= pagination.totalPages}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:text-zinc-700 disabled:cursor-not-allowed transition-colors"
                        >
                          <IconChevronRight />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ─── Toast Notifications ──────────────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg border transition-all ${
              toast.type === "success"
                ? "bg-success/15 text-success border-success/20"
                : toast.type === "error"
                ? "bg-red-500/15 text-red-400 border-red-500/20"
                : "bg-amber-500/15 text-amber-400 border-amber-500/20"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
