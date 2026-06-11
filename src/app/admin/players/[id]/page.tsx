"use client";

import { useEffect, useState, useCallback, use } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────

interface GameState {
  user_id: string;
  display_name: string | null;
  money: number;
  total_earned: number;
  research_points: number;
  game_tick: number;
  game_speed: number;
  buildings: Record<string, unknown> | unknown[] | null;
  is_locked: boolean;
  lock_reason: string | null;
  full_state: Record<string, unknown> | null;
  last_saved_at: string | null;
  created_at: string | null;
  [key: string]: unknown;
}

interface PlayerAction {
  id: string;
  action_type: string;
  money_after: number | null;
  is_valid: boolean;
  risk_level: string | null;
  rejection_reason: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface Investigation {
  id: string;
  detection_type: string;
  severity: string;
  description: string | null;
  status: string;
  created_at: string;
  [key: string]: unknown;
}

interface PlayerDetail {
  user_id: string;
  email: string | null;
  display_name: string | null;
  game_state: GameState;
  progress: Record<string, unknown> | null;
  recent_actions: PlayerAction[];
  investigations: Investigation[];
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

function IconArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
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

function IconChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconChevronUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconUnlock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
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

function getSeverityBadgeClasses(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/15 text-red-400 border-red-500/20";
    case "high":
      return "bg-orange-500/15 text-orange-400 border-orange-500/20";
    case "medium":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "low":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  }
}

function getInvestigationStatusBadge(status: string): string {
  switch (status) {
    case "open":
      return "bg-orange-500/15 text-orange-400 border-orange-500/20";
    case "resolved":
      return "bg-success/15 text-success border-emerald-500/20";
    case "dismissed":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  }
}

function getRiskLevelBadge(risk: string | null): string {
  if (!risk) return "";
  switch (risk) {
    case "high":
      return "bg-red-500/15 text-red-400 border-red-500/20";
    case "medium":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "low":
      return "bg-success/15 text-success border-emerald-500/20";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  }
}

function countBuildings(buildings: Record<string, unknown> | unknown[] | null): number {
  if (!buildings) return 0;
  if (Array.isArray(buildings)) return buildings.length;
  if (typeof buildings === "object") {
    if (typeof (buildings as Record<string, unknown>).count === "number") {
      return (buildings as Record<string, unknown>).count as number;
    }
    return Object.keys(buildings).length;
  }
  return 0;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = use(params);
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Lock/Unlock modal
  const [confirmModal, setConfirmModal] = useState<{ action: "lock" | "unlock" } | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // JSONB viewer
  const [jsonExpanded, setJsonExpanded] = useState(false);

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

  // ─── Fetch player ───────────────────────────────────────────────────────

  const fetchPlayer = useCallback(async () => {
    try {
      setDataLoading(true);
      const res = await fetch(`/api/admin/players/${playerId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to fetch player");
      }
      const data = await res.json();
      setPlayer(data.data || null);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to load player");
    } finally {
      setDataLoading(false);
    }
  }, [playerId, addToast]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchPlayer();
    }
  }, [authLoading, user, fetchPlayer]);

  // ─── Lock/Unlock handler ────────────────────────────────────────────────

  const handleLockAction = async () => {
    if (!confirmModal) return;
    const locked = confirmModal.action === "lock";

    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/players/${playerId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked, reason: locked ? lockReason || undefined : undefined }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || `Failed to ${locked ? "lock" : "unlock"} account`);
      }
      addToast("success", `Account ${locked ? "locked" : "unlocked"} successfully`);
      setConfirmModal(null);
      setLockReason("");
      fetchPlayer();
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : `Failed to ${locked ? "lock" : "unlock"} account`);
    } finally {
      setActionLoading(false);
    }
  };

  // ─── JSONB viewer ──────────────────────────────────────────────────────

  const getJsonLines = (): string[] => {
    if (!player?.game_state?.full_state) return [];
    try {
      return JSON.stringify(player.game_state.full_state, null, 2).split("\n");
    } catch {
      return ["[Error rendering JSON]"];
    }
  };

  const jsonLines = getJsonLines();
  const displayLines = jsonExpanded ? jsonLines : jsonLines.slice(0, 20);
  const hasMoreLines = jsonLines.length > 20;

  // ─── Auth loading ───────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading player detail...</p>
        </div>
      </div>
    );
  }

  // ─── Not found ──────────────────────────────────────────────────────────

  if (!dataLoading && !player) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600">
            <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
          </svg>
          <p className="text-zinc-400 text-sm">Player not found</p>
          <a href="/admin/players" className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 text-sm rounded-lg hover:bg-amber-500/20 transition-colors border border-amber-500/20">
            <IconArrowLeft />
            Back to Players
          </a>
        </div>
      </div>
    );
  }

  // ─── Derive computed values ─────────────────────────────────────────────

  const gameState = player?.game_state;
  const isLocked = gameState?.is_locked ?? false;
  const buildingsCount = gameState ? countBuildings(gameState.buildings) : 0;

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
          <div className="p-4 sm:p-6 max-w-5xl">
            {/* Back button */}
            <a
              href="/admin/players"
              className="inline-flex items-center gap-2 text-zinc-400 hover:text-amber-400 text-sm transition-colors mb-4"
            >
              <IconArrowLeft />
              Back to Players
            </a>

            {dataLoading ? (
              <div className="space-y-4">
                <div className="h-32 bg-zinc-800/50 rounded-xl animate-pulse" />
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-zinc-800/50 rounded-xl animate-pulse" />
                  ))}
                </div>
                <div className="h-48 bg-zinc-800/50 rounded-xl animate-pulse" />
              </div>
            ) : player ? (
              <>
                {/* Player Header Card */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 sm:p-6 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-xl bg-zinc-700 flex items-center justify-center text-zinc-300 text-xl font-bold shrink-0">
                        {(player.email || player.display_name || "U")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-white text-lg font-bold">
                            {player.display_name || "Unknown Player"}
                          </h2>
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-red-500/15 text-red-400 border-red-500/20">
                              <IconLock />
                              Locked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-success/15 text-success border-emerald-500/20">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-400 text-sm mt-1">{player.email || "No email"}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <code className="text-zinc-500 text-[10px] font-mono">
                            ID: {truncateUid(player.user_id, 12)}
                          </code>
                          <span className="text-zinc-600 text-[10px]">
                            Joined {gameState?.created_at ? new Date(gameState.created_at).toLocaleDateString() : "—"}
                          </span>
                        </div>
                        {isLocked && gameState?.lock_reason && (
                          <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                            <p className="text-red-400 text-xs">
                              <span className="font-medium">Lock reason:</span> {gameState.lock_reason}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 shrink-0">
                      {isLocked ? (
                        <button
                          onClick={() => setConfirmModal({ action: "unlock" })}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-success/10 text-success text-sm rounded-lg hover:bg-success/20 transition-colors border border-emerald-500/20 font-medium"
                        >
                          <IconUnlock />
                          Unlock Account
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmModal({ action: "lock" })}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 text-sm rounded-lg hover:bg-red-500/20 transition-colors border border-red-500/20 font-medium"
                        >
                          <IconLock />
                          Lock Account
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-500 text-[10px] mb-1">Money</p>
                    <p className="text-success text-sm font-bold font-mono">
                      ${formatMoney(gameState?.money ?? 0)}
                    </p>
                  </div>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-500 text-[10px] mb-1">Total Earned</p>
                    <p className="text-success text-sm font-bold font-mono">
                      ${formatMoney((gameState?.total_earned as number) ?? 0)}
                    </p>
                  </div>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-500 text-[10px] mb-1">Research Pts</p>
                    <p className="text-amber-400 text-sm font-bold font-mono">
                      {((gameState?.research_points as number) ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-500 text-[10px] mb-1">Buildings</p>
                    <p className="text-white text-sm font-bold">{buildingsCount}</p>
                  </div>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-500 text-[10px] mb-1">Game Tick</p>
                    <p className="text-white text-sm font-bold font-mono">
                      {(gameState?.game_tick ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                    <p className="text-zinc-500 text-[10px] mb-1">Game Speed</p>
                    <p className="text-white text-sm font-bold font-mono">
                      {((gameState?.game_speed as number) ?? 1)}x
                    </p>
                  </div>
                </div>

                {/* Game State Viewer */}
                {jsonLines.length > 0 && (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden mb-6">
                    <button
                      onClick={() => setJsonExpanded(!jsonExpanded)}
                      className="w-full flex items-center justify-between px-5 py-3 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <IconDatabase />
                        <span className="text-white text-sm font-medium">Game State (JSONB)</span>
                        <span className="text-zinc-500 text-[10px]">{jsonLines.length} lines</span>
                      </div>
                      {jsonExpanded ? <IconChevronUp /> : <IconChevronDown />}
                    </button>
                    <div className="p-4 overflow-x-auto max-h-96 overflow-y-auto">
                      <pre className="text-zinc-400 text-xs font-mono leading-relaxed">
                        {displayLines.map((line, i) => (
                          <div key={i} className="hover:bg-zinc-800/30 px-2 -mx-2">
                            <span className="text-zinc-600 select-none mr-4 inline-block w-8 text-right">{i + 1}</span>
                            {line}
                          </div>
                        ))}
                      </pre>
                      {hasMoreLines && !jsonExpanded && (
                        <div className="relative">
                          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-zinc-900/60 to-transparent pointer-events-none" />
                        </div>
                      )}
                    </div>
                    {hasMoreLines && !jsonExpanded && (
                      <div className="px-5 py-3 border-t border-zinc-800">
                        <button
                          onClick={() => setJsonExpanded(true)}
                          className="text-amber-400 text-xs hover:text-amber-300 transition-colors"
                        >
                          Expand all ({jsonLines.length} lines)
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Recent Actions Table */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden mb-6">
                  <div className="px-5 py-3 border-b border-zinc-800">
                    <h3 className="text-white text-sm font-medium">Recent Actions</h3>
                    <p className="text-zinc-500 text-[10px] mt-0.5">Last {player.recent_actions?.length ?? 0} actions</p>
                  </div>
                  {!player.recent_actions || player.recent_actions.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-zinc-500 text-sm">No actions recorded</p>
                    </div>
                  ) : (
                    <>
                      {/* Desktop table */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="px-4 py-2.5 text-left text-xs text-zinc-500 font-medium">Time</th>
                              <th className="px-4 py-2.5 text-left text-xs text-zinc-500 font-medium">Action</th>
                              <th className="px-4 py-2.5 text-right text-xs text-zinc-500 font-medium">Money After</th>
                              <th className="px-4 py-2.5 text-center text-xs text-zinc-500 font-medium">Valid</th>
                              <th className="px-4 py-2.5 text-center text-xs text-zinc-500 font-medium">Risk</th>
                              <th className="px-4 py-2.5 text-left text-xs text-zinc-500 font-medium">Rejection</th>
                            </tr>
                          </thead>
                          <tbody>
                            {player.recent_actions.map((action) => (
                              <tr key={action.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                                <td className="px-4 py-2.5">
                                  <span className="text-zinc-500 text-xs">
                                    {new Date(action.created_at).toLocaleString()}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <code className="text-zinc-300 text-xs font-mono">{action.action_type}</code>
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <span className="text-success text-xs font-mono">
                                    {action.money_after != null ? `$${formatMoney(action.money_after)}` : "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {action.is_valid ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-success/15 text-success border-emerald-500/20">
                                      Valid
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-red-500/15 text-red-400 border-red-500/20">
                                      Invalid
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {action.risk_level ? (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getRiskLevelBadge(action.risk_level)}`}>
                                      {action.risk_level}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-600 text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="text-zinc-500 text-xs truncate block max-w-[200px]">
                                    {action.rejection_reason || "—"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile cards */}
                      <div className="md:hidden divide-y divide-zinc-800/50">
                        {player.recent_actions.map((action) => (
                          <div key={action.id} className="p-4">
                            <div className="flex items-center justify-between mb-1.5">
                              <code className="text-zinc-300 text-xs font-mono">{action.action_type}</code>
                              {action.is_valid ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border bg-success/15 text-success border-emerald-500/20">
                                  Valid
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border bg-red-500/15 text-red-400 border-red-500/20">
                                  Invalid
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-zinc-500 text-[10px]">
                                {new Date(action.created_at).toLocaleString()}
                              </span>
                              {action.money_after != null && (
                                <span className="text-success text-[10px] font-mono">
                                  ${formatMoney(action.money_after)}
                                </span>
                              )}
                              {action.risk_level && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${getRiskLevelBadge(action.risk_level)}`}>
                                  {action.risk_level}
                                </span>
                              )}
                            </div>
                            {action.rejection_reason && (
                              <p className="text-red-400/70 text-[10px] mt-1">{action.rejection_reason}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Investigations Table */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden mb-6">
                  <div className="px-5 py-3 border-b border-zinc-800">
                    <h3 className="text-white text-sm font-medium">Cheat Investigations</h3>
                    <p className="text-zinc-500 text-[10px] mt-0.5">{player.investigations?.length ?? 0} investigation{(player.investigations?.length ?? 0) !== 1 ? "s" : ""}</p>
                  </div>
                  {!player.investigations || player.investigations.length === 0 ? (
                    <div className="p-8 text-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600 mx-auto mb-2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      <p className="text-zinc-500 text-sm">No investigations</p>
                      <p className="text-zinc-600 text-xs">This player has a clean record</p>
                    </div>
                  ) : (
                    <>
                      {/* Desktop table */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="px-4 py-2.5 text-left text-xs text-zinc-500 font-medium">Detection Type</th>
                              <th className="px-4 py-2.5 text-center text-xs text-zinc-500 font-medium">Severity</th>
                              <th className="px-4 py-2.5 text-left text-xs text-zinc-500 font-medium">Description</th>
                              <th className="px-4 py-2.5 text-center text-xs text-zinc-500 font-medium">Status</th>
                              <th className="px-4 py-2.5 text-right text-xs text-zinc-500 font-medium">Created</th>
                            </tr>
                          </thead>
                          <tbody>
                            {player.investigations.map((inv) => (
                              <tr key={inv.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                                <td className="px-4 py-2.5">
                                  <code className="text-zinc-300 text-xs font-mono">{inv.detection_type}</code>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getSeverityBadgeClasses(inv.severity)}`}>
                                    {inv.severity}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="text-zinc-400 text-xs truncate block max-w-[300px]">
                                    {inv.description || "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getInvestigationStatusBadge(inv.status)}`}>
                                    {inv.status}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <span className="text-zinc-500 text-xs">
                                    {new Date(inv.created_at).toLocaleDateString()}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile cards */}
                      <div className="md:hidden divide-y divide-zinc-800/50">
                        {player.investigations.map((inv) => (
                          <div key={inv.id} className="p-4">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <code className="text-zinc-300 text-xs font-mono">{inv.detection_type}</code>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${getSeverityBadgeClasses(inv.severity)}`}>
                                {inv.severity}
                              </span>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${getInvestigationStatusBadge(inv.status)}`}>
                                {inv.status}
                              </span>
                            </div>
                            {inv.description && (
                              <p className="text-zinc-400 text-[11px] mb-1">{inv.description}</p>
                            )}
                            <span className="text-zinc-600 text-[10px]">
                              {new Date(inv.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </main>
      </div>

      {/* ─── Lock/Unlock Confirm Modal ────────────────────────────────────── */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="p-6 text-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                confirmModal.action === "lock" ? "bg-red-500/10" : "bg-success/10"
              }`}>
                {confirmModal.action === "lock" ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                )}
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">
                {confirmModal.action === "lock" ? "Lock Account" : "Unlock Account"}
              </h3>
              <p className="text-zinc-400 text-sm mb-1">
                {confirmModal.action === "lock"
                  ? "Are you sure you want to lock this player's account?"
                  : "Are you sure you want to unlock this player's account?"}
              </p>
              <p className="text-zinc-500 text-xs">
                {player?.email || player?.display_name || playerId}
              </p>
            </div>

            {/* Lock reason input (only for locking) */}
            {confirmModal.action === "lock" && (
              <div className="px-5 pb-2">
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Suspected cheating"
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-800">
              <button
                onClick={() => { setConfirmModal(null); setLockReason(""); }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLockAction}
                disabled={actionLoading}
                className={`inline-flex items-center gap-2 px-4 py-2 font-medium text-sm rounded-lg transition-colors ${
                  confirmModal.action === "lock"
                    ? "bg-red-500 hover:bg-red-400 disabled:bg-red-500/50 text-white"
                    : "bg-success hover:bg-emerald-400 disabled:bg-success/50 text-white"
                }`}
              >
                {actionLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
                    {confirmModal.action === "lock" ? "Locking..." : "Unlocking..."}
                  </>
                ) : (
                  <>
                    {confirmModal.action === "lock" ? <IconLock /> : <IconUnlock />}
                    {confirmModal.action === "lock" ? "Lock Account" : "Unlock Account"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast Notifications ──────────────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg border transition-all ${
              toast.type === "success"
                ? "bg-success/15 text-success border-emerald-500/20"
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
