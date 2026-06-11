"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────

interface Investigation {
  id: string;
  user_id: string;
  user_email: string | null;
  detection_type: string;
  severity: string;
  description: string | null;
  status: string;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_by_email: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface Pagination {
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

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["all", "open", "investigating", "resolved", "dismissed"];
const SEVERITY_OPTIONS = ["all", "low", "medium", "high", "critical"];
const DETECTION_TYPE_OPTIONS = [
  "all",
  "money_manipulation",
  "tick_manipulation",
  "invalid_building",
  "invalid_research",
  "speed_hack",
  "import_hack",
  "state_tampering",
  "negative_resources",
  "impossible_progression",
  "other",
];

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

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconClipboardList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />
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

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
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

function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function IconScrollText() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" /><path d="M19 3H9v7h14V5a2 2 0 0 0-2-2Z" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "open":
      return "bg-red-500/15 text-red-400 border-red-500/20";
    case "investigating":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "resolved":
      return "bg-success/15 text-success border-emerald-500/20";
    case "dismissed":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  }
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
      return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  }
}

function formatDetectionType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncateStr(str: string, max: number): string {
  if (!str) return "—";
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

// ─── Component ────────────────────────────────────────────────────────────

export default function InvestigationsPage() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data state
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [dataLoading, setDataLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter state
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterDetectionType, setFilterDetectionType] = useState("all");

  // Inline action state
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"resolve" | "dismiss" | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // View detail state
  const [viewTarget, setViewTarget] = useState<Investigation | null>(null);

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

  // ─── Fetch investigations ───────────────────────────────────────────────

  const fetchInvestigations = useCallback(async () => {
    try {
      setDataLoading(true);
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterSeverity !== "all") params.set("severity", filterSeverity);
      if (filterDetectionType !== "all") params.set("detection_type", filterDetectionType);

      const res = await fetch(`/api/admin/investigations?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to fetch investigations");
      }
      const data = await res.json();
      setInvestigations(data.data || []);
      setPagination((prev) => ({ ...prev, ...data.pagination }));
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to load investigations");
    } finally {
      setDataLoading(false);
    }
  }, [pagination.page, pagination.limit, filterStatus, filterSeverity, filterDetectionType, addToast]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchInvestigations();
    }
  }, [authLoading, user, fetchInvestigations]);

  // ─── Handle action (resolve/dismiss) ────────────────────────────────────

  const handleAction = async (investigationId: string, action: "resolve" | "dismiss") => {
    if (!actionNote.trim()) {
      addToast("error", "A note is required");
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/investigations/${investigationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: actionNote.trim() }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || `Failed to ${action} investigation`);
      }
      addToast("success", `Investigation ${action === "resolve" ? "resolved" : "dismissed"} successfully`);
      setActionTarget(null);
      setActionType(null);
      setActionNote("");
      fetchInvestigations();
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : `Failed to ${action} investigation`);
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Computed stats ─────────────────────────────────────────────────────

  const openCount = investigations.filter((inv) => inv.status === "open" || inv.status === "investigating").length;
  const criticalCount = investigations.filter((inv) => inv.severity === "critical" && (inv.status === "open" || inv.status === "investigating")).length;
  const resolvedToday = investigations.filter((inv) => {
    if (inv.status !== "resolved" || !inv.resolved_at) return false;
    const resolvedDate = new Date(inv.resolved_at);
    const today = new Date();
    return resolvedDate.toDateString() === today.toDateString();
  }).length;
  const totalInvestigations = pagination.total;

  // ─── Auth loading ───────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading investigations...</p>
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
              <IconShield />
              <span className="flex-1">Investigations</span>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            </div>
            <a
              href="/admin/audit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            >
              <IconScrollText />
              <span>Audit Log</span>
            </a>
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
              <p className="text-xs text-amber-400 font-medium">Phase 5 — Security</p>
              <div className="mt-2 w-full bg-zinc-700 rounded-full h-1.5">
                <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: "90%" }} />
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
                <h2 className="text-white text-xl font-bold">Cheat Investigations</h2>
                <p className="text-zinc-500 text-sm mt-1">
                  Monitor and manage cheat detection investigations
                </p>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 mb-6">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => { setFilterStatus(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Severity</label>
                  <select
                    value={filterSeverity}
                    onChange={(e) => { setFilterSeverity(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                  >
                    {SEVERITY_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s === "all" ? "All Severities" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Detection Type</label>
                  <select
                    value={filterDetectionType}
                    onChange={(e) => { setFilterDetectionType(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                  >
                    {DETECTION_TYPE_OPTIONS.map((dt) => (
                      <option key={dt} value={dt}>{dt === "all" ? "All Types" : formatDetectionType(dt)}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => fetchInvestigations()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 text-sm rounded-lg hover:bg-amber-500/20 transition-colors border border-amber-500/20 shrink-0"
                >
                  <IconRefresh />
                  Refresh
                </button>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Open Count</p>
                    <p className="text-white text-2xl font-bold">{openCount}</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-400">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Critical</p>
                    <p className="text-white text-2xl font-bold">{criticalCount}</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Resolved Today</p>
                    <p className="text-white text-2xl font-bold">{resolvedToday}</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <IconClipboardList />
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Total</p>
                    <p className="text-white text-2xl font-bold">{totalInvestigations}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Investigations Table */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
              {dataLoading ? (
                <div className="p-8 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-14 bg-zinc-800/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : investigations.length === 0 ? (
                <div className="p-12 text-center">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600 mx-auto">
                    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                  </svg>
                  <p className="text-zinc-400 text-sm mb-2 mt-3">No investigations found</p>
                  <p className="text-zinc-600 text-xs">Adjust filters or wait for new detections.</p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">User Email</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Detection Type</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Severity</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Description</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Status</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Created</th>
                          <th className="px-4 py-3 text-right text-xs text-zinc-500 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {investigations.map((inv) => (
                          <tr
                            key={inv.id}
                            className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <span className="text-white text-sm truncate max-w-[180px] block">
                                {inv.user_email || truncateStr(inv.user_id, 12)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-zinc-300 text-xs">
                                {formatDetectionType(inv.detection_type)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getSeverityBadgeClasses(inv.severity)}`}>
                                {inv.severity.charAt(0).toUpperCase() + inv.severity.slice(1)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-zinc-400 text-xs block max-w-[200px] truncate" title={inv.description || undefined}>
                                {truncateStr(inv.description || "—", 50)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getStatusBadgeClasses(inv.status)}`}>
                                {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-zinc-500 text-xs">
                                {new Date(inv.created_at).toLocaleDateString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {actionTarget === inv.id ? (
                                <div className="flex flex-col items-end gap-2">
                                  <div className="flex items-center gap-2 w-full">
                                    <input
                                      type="text"
                                      placeholder={`${actionType === "resolve" ? "Resolution" : "Dismissal"} note...`}
                                      value={actionNote}
                                      onChange={(e) => setActionNote(e.target.value)}
                                      className="flex-1 bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors"
                                      autoFocus
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => { setActionTarget(null); setActionType(null); setActionNote(""); }}
                                      className="px-2.5 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => actionType && handleAction(inv.id, actionType)}
                                      disabled={actionLoading || !actionNote.trim()}
                                      className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                                        actionType === "resolve"
                                          ? "bg-success/15 text-success border border-emerald-500/20 hover:bg-success/25 disabled:opacity-50"
                                          : "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20 hover:bg-zinc-500/25 disabled:opacity-50"
                                      }`}
                                    >
                                      {actionLoading ? (
                                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <IconCheck />
                                      )}
                                      {actionType === "resolve" ? "Confirm" : "Confirm"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => setViewTarget(inv)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors border border-zinc-700 hover:border-amber-500/20"
                                  >
                                    <IconEye />
                                    View
                                  </button>
                                  {(inv.status === "open" || inv.status === "investigating") && (
                                    <>
                                      <button
                                        onClick={() => { setActionTarget(inv.id); setActionType("resolve"); setActionNote(""); }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-success hover:bg-success/10 transition-colors border border-emerald-500/20"
                                      >
                                        <IconCheck />
                                        Resolve
                                      </button>
                                      <button
                                        onClick={() => { setActionTarget(inv.id); setActionType("dismiss"); setActionNote(""); }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:bg-zinc-500/10 transition-colors border border-zinc-600"
                                      >
                                        <IconX />
                                        Dismiss
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile / Tablet cards */}
                  <div className="lg:hidden divide-y divide-zinc-800/50">
                    {investigations.map((inv) => (
                      <div key={inv.id} className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm font-medium truncate">
                              {inv.user_email || truncateStr(inv.user_id, 12)}
                            </p>
                            <p className="text-zinc-500 text-[10px] mt-0.5">
                              {formatDetectionType(inv.detection_type)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getSeverityBadgeClasses(inv.severity)}`}>
                              {inv.severity.charAt(0).toUpperCase() + inv.severity.slice(1)}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusBadgeClasses(inv.status)}`}>
                              {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                            </span>
                          </div>
                        </div>
                        {inv.description && (
                          <p className="text-zinc-400 text-xs mb-2 line-clamp-2">{inv.description}</p>
                        )}
                        <p className="text-zinc-600 text-[10px] mb-2">
                          {new Date(inv.created_at).toLocaleString()}
                        </p>
                        {actionTarget === inv.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder={`${actionType === "resolve" ? "Resolution" : "Dismissal"} note...`}
                              value={actionNote}
                              onChange={(e) => setActionNote(e.target.value)}
                              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => { setActionTarget(null); setActionType(null); setActionNote(""); }}
                                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => actionType && handleAction(inv.id, actionType)}
                                disabled={actionLoading || !actionNote.trim()}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                  actionType === "resolve"
                                    ? "bg-success/15 text-success border border-emerald-500/20 disabled:opacity-50"
                                    : "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20 disabled:opacity-50"
                                }`}
                              >
                                {actionLoading ? (
                                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <IconCheck />
                                )}
                                Confirm
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setViewTarget(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors border border-zinc-700"
                            >
                              <IconEye />
                              View
                            </button>
                            {(inv.status === "open" || inv.status === "investigating") && (
                              <>
                                <button
                                  onClick={() => { setActionTarget(inv.id); setActionType("resolve"); setActionNote(""); }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-success hover:bg-success/10 transition-colors border border-emerald-500/20"
                                >
                                  <IconCheck />
                                  Resolve
                                </button>
                                <button
                                  onClick={() => { setActionTarget(inv.id); setActionType("dismiss"); setActionNote(""); }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:bg-zinc-500/10 transition-colors border border-zinc-600"
                                >
                                  <IconX />
                                  Dismiss
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {pagination.totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-zinc-800">
                      <div className="text-xs text-zinc-500">
                        Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                          disabled={pagination.page <= 1}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-zinc-700"
                        >
                          <IconChevronLeft />
                          Prev
                        </button>
                        <span className="text-zinc-500 text-xs">
                          Page {pagination.page} of {pagination.totalPages}
                        </span>
                        <button
                          onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                          disabled={pagination.page >= pagination.totalPages}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-zinc-700"
                        >
                          Next
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

      {/* ─── View Detail Modal ──────────────────────────────────────────── */}
      {viewTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
              <h3 className="text-white font-semibold">Investigation Detail</h3>
              <button
                onClick={() => setViewTarget(null)}
                className="text-zinc-400 hover:text-white transition-colors p-1"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">User</p>
                  <p className="text-white text-sm">{viewTarget.user_email || "—"}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getStatusBadgeClasses(viewTarget.status)}`}>
                    {viewTarget.status.charAt(0).toUpperCase() + viewTarget.status.slice(1)}
                  </span>
                </div>
                <div>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Detection Type</p>
                  <p className="text-zinc-300 text-sm">{formatDetectionType(viewTarget.detection_type)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Severity</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getSeverityBadgeClasses(viewTarget.severity)}`}>
                    {viewTarget.severity.charAt(0).toUpperCase() + viewTarget.severity.slice(1)}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Description</p>
                <p className="text-zinc-300 text-sm">{viewTarget.description || "—"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Created At</p>
                  <p className="text-zinc-300 text-xs">{new Date(viewTarget.created_at).toLocaleString()}</p>
                </div>
                {viewTarget.resolved_at && (
                  <div>
                    <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Resolved At</p>
                    <p className="text-zinc-300 text-xs">{new Date(viewTarget.resolved_at).toLocaleString()}</p>
                  </div>
                )}
              </div>
              {viewTarget.resolution_note && (
                <div>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Resolution Note</p>
                  <div className="px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700">
                    <p className="text-zinc-300 text-sm">{viewTarget.resolution_note}</p>
                  </div>
                  {viewTarget.resolved_by_email && (
                    <p className="text-zinc-600 text-[10px] mt-1">by {viewTarget.resolved_by_email}</p>
                  )}
                </div>
              )}
              <div>
                <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Investigation ID</p>
                <p className="text-zinc-400 text-xs font-mono">{viewTarget.id}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">User ID</p>
                <p className="text-zinc-400 text-xs font-mono">{viewTarget.user_id}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast notifications ───────────────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-right ${
              toast.type === "success"
                ? "bg-success/15 text-success border border-emerald-500/20"
                : toast.type === "error"
                ? "bg-red-500/15 text-red-400 border border-red-500/20"
                : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
            }`}
          >
            {toast.type === "success" && <IconCheck />}
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
