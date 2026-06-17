"use client";

import { useEffect, useState, useCallback } from "react";

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

// ─── Inline SVG helpers (used in core content) ────────────────────────────

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
  // Data state
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // Search & pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 50, total: 0, totalPages: 0 });

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Error display
  const [error, setError] = useState<string | null>(null);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
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
      showError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  }, [showError]);

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
      showError(err instanceof Error ? err.message : "Failed to load players");
    } finally {
      setDataLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchStats();
    fetchPlayers(activeSearch, page);
  }, [activeSearch, page, fetchStats, fetchPlayers]);

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
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showError("Failed to copy");
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/15 text-danger border border-danger/20 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-white text-xl font-bold">Players</h2>
          <p className="text-muted-label text-sm mt-1">
            Search and manage IndustriaX game players
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-label">
              <IconSearch />
            </div>
            <input
              type="text"
              placeholder="Search by email, user ID, or display name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full bg-background/80/80 border border-muted-label/40 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-muted-label/80 focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2.5 bg-warning hover:bg-warning text-black font-medium text-sm rounded-lg transition-colors shrink-0"
          >
            Search
          </button>
          {activeSearch && (
            <button
              onClick={clearSearch}
              className="px-3 py-2.5 text-sm text-muted-label hover:text-white hover:bg-background/60 rounded-lg transition-colors border border-muted-label/40 shrink-0"
            >
              Clear
            </button>
          )}
        </div>
        {activeSearch && (
          <p className="text-muted-label text-xs mt-2">
            Showing results for: <span className="text-warning">&quot;{activeSearch}&quot;</span>
          </p>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-warning">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-[10px] sm:text-xs">Total Players</p>
              {statsLoading ? (
                <div className="h-6 w-12 bg-background/60 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-white text-lg sm:text-2xl font-bold">{stats?.total_players ?? 0}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-[10px] sm:text-xs">Online</p>
              {statsLoading ? (
                <div className="h-6 w-12 bg-background/60 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-white text-lg sm:text-2xl font-bold">{stats?.online_players ?? 0}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-danger/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-[10px] sm:text-xs">Locked</p>
              {statsLoading ? (
                <div className="h-6 w-12 bg-background/60 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-white text-lg sm:text-2xl font-bold">{stats?.locked_accounts ?? 0}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-domain/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-domain">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-[10px] sm:text-xs">Investigations</p>
              {statsLoading ? (
                <div className="h-6 w-12 bg-background/60 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-white text-lg sm:text-2xl font-bold">{stats?.open_investigations ?? 0}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Players Table */}
      <div className="bg-background/80/60 border border-muted-label/40 rounded-xl overflow-hidden">
        {dataLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-14 bg-background/60/50 rounded animate-pulse" />
            ))}
          </div>
        ) : players.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-3xl mb-3">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-label/80 mx-auto">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <p className="text-muted-label text-sm mb-2">No players found</p>
            <p className="text-muted-label/80 text-xs">
              {activeSearch ? "Try a different search term" : "No players have registered yet"}
            </p>
            {activeSearch && (
              <button
                onClick={clearSearch}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-warning/10 text-warning text-sm rounded-lg hover:bg-warning/20 transition-colors border border-warning/20"
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
                  <tr className="border-b border-muted-label/40">
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Player</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">User ID</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-label font-medium">Money</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-label font-medium">Tick</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-label font-medium">Buildings</th>
                    <th className="px-4 py-3 text-center text-xs text-muted-label font-medium">Flags</th>
                    <th className="px-4 py-3 text-center text-xs text-muted-label font-medium">Status</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-label font-medium">Last Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr
                      key={player.user_id}
                      className="border-b border-muted-label/40/50 hover:bg-background/60/30 transition-colors cursor-pointer"
                      onClick={() => { window.location.href = `/admin/players/${player.user_id}`; }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-background/40 flex items-center justify-center text-subtle text-sm font-medium shrink-0">
                            {(player.email || player.display_name || "U")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="text-white text-sm truncate block max-w-[200px]">
                              {player.email || player.display_name || "Unknown"}
                            </span>
                            {player.display_name && player.email && (
                              <span className="text-muted-label text-[10px] block truncate max-w-[200px]">
                                {player.display_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="text-muted-label text-xs font-mono">
                            {truncateUid(player.user_id)}
                          </code>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(player.user_id); }}
                            className="text-muted-label/80 hover:text-subtle transition-colors p-0.5 rounded"
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
                      <td className="px-4 py-3 text-right">
                        <span className="text-success text-sm font-medium font-mono">
                          ${formatMoney(player.money)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-subtle text-xs font-mono">
                          {player.game_tick.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-subtle text-xs">
                          {player.buildings_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {player.cheat_flag_count > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-domain/15 text-domain border border-domain/20">
                            <IconFlag />
                            {player.cheat_flag_count}
                          </span>
                        ) : (
                          <span className="text-muted-label/80 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {player.is_locked ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-danger/15 text-danger border-danger/20">
                            Locked
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-success/15 text-success border-success/20">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-muted-label text-xs">
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
            <div className="md:hidden divide-y divide-background/60/50">
              {players.map((player) => (
                <div
                  key={player.user_id}
                  className="p-4 cursor-pointer hover:bg-background/60/30 transition-colors"
                  onClick={() => { window.location.href = `/admin/players/${player.user_id}`; }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-background/40 flex items-center justify-center text-subtle text-sm font-medium shrink-0">
                      {(player.email || player.display_name || "U")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium truncate">
                          {player.email || player.display_name || "Unknown"}
                        </span>
                        {player.is_locked ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border bg-danger/15 text-danger border-danger/20">
                            Locked
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border bg-success/15 text-success border-success/20">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-muted-label text-[10px] font-mono truncate">
                          {truncateUid(player.user_id, 6)}
                        </code>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(player.user_id); }}
                          className="text-muted-label/80 hover:text-subtle transition-colors p-0.5"
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
                        <span className="text-muted-label text-[10px]">
                          Tick {player.game_tick.toLocaleString()}
                        </span>
                        <span className="text-muted-label text-[10px]">
                          {player.buildings_count} bldgs
                        </span>
                        {player.cheat_flag_count > 0 && (
                          <span className="inline-flex items-center gap-1 text-domain text-[10px]">
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
              <div className="flex items-center justify-between px-4 py-3 border-t border-muted-label/40">
                <p className="text-muted-label text-xs">
                  {pagination.total} player{pagination.total !== 1 ? "s" : ""} &middot; Page {pagination.page} of {pagination.totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pagination.page <= 1}
                    className="p-1.5 rounded-lg text-muted-label hover:text-white hover:bg-background/60 disabled:text-muted-label/30 disabled:cursor-not-allowed transition-colors"
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
                            ? "bg-warning/20 text-warning border border-warning/30"
                            : "text-muted-label hover:text-white hover:bg-background/60"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="p-1.5 rounded-lg text-muted-label hover:text-white hover:bg-background/60 disabled:text-muted-label/30 disabled:cursor-not-allowed transition-colors"
                  >
                    <IconChevronRight />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
