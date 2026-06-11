"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────

interface PlayerAction {
  id: string;
  user_id: string;
  user_email: string | null;
  action_type: string;
  money_after: number | null;
  is_valid: boolean;
  risk_level: string | null;
  rejection_reason: string | null;
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

const ACTION_TYPE_OPTIONS = [
  "all",
  "tick",
  "build",
  "research",
  "import",
  "export",
  "demolish",
  "upgrade",
  "sell",
  "buy",
  "hire",
  "fire",
  "loan_take",
  "loan_repay",
  "market_buy",
  "market_sell",
  "gift_send",
  "gift_receive",
  "prestige",
  "cheat_detect",
  "admin_action",
  "other",
];

const VALID_OPTIONS = ["all", "true", "false"];

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

function IconScrollText() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" /><path d="M19 3H9v7h14V5a2 2 0 0 0-2-2Z" />
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

function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
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

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconRotateCcw() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function truncateUid(uid: string, max = 8): string {
  if (uid.length <= max * 2 + 3) return uid;
  return uid.slice(0, max) + "..." + uid.slice(-4);
}

function truncateStr(str: string | null, max: number): string {
  if (!str) return "—";
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

function formatActionType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getValidBadgeClasses(isValid: boolean): string {
  return isValid
    ? "bg-success/15 text-success border-success/20"
    : "bg-red-500/15 text-red-400 border-red-500/20";
}

function getRiskBadgeClasses(risk: string | null): string {
  switch (risk) {
    case "critical":
      return "bg-red-500/15 text-red-400 border-red-500/20";
    case "high":
      return "bg-orange-500/15 text-orange-400 border-orange-500/20";
    case "medium":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "low":
      return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    case "none":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  }
}

function formatMoney(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ─── Component ────────────────────────────────────────────────────────────

export default function AuditPage() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data state
  const [actions, setActions] = useState<PlayerAction[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [dataLoading, setDataLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter state
  const [filterUserId, setFilterUserId] = useState("");
  const [filterActionType, setFilterActionType] = useState("all");
  const [filterValid, setFilterValid] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

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

  // ─── Copy to clipboard ─────────────────────────────────────────────────

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      addToast("info", "Copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      addToast("error", "Failed to copy");
    }
  }, [addToast]);

  // ─── Fetch actions ──────────────────────────────────────────────────────

  const fetchActions = useCallback(async () => {
    try {
      setDataLoading(true);
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (filterUserId.trim()) params.set("user_id", filterUserId.trim());
      if (filterActionType !== "all") params.set("action_type", filterActionType);
      if (filterValid === "true") params.set("is_valid", "true");
      else if (filterValid === "false") params.set("is_valid", "false");
      if (filterDateFrom) params.set("date_from", filterDateFrom);
      if (filterDateTo) params.set("date_to", filterDateTo);

      const res = await fetch(`/api/admin/actions?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to fetch actions");
      }
      const data = await res.json();
      setActions(data.data || []);
      setPagination((prev) => ({ ...prev, ...data.pagination }));
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to load actions");
    } finally {
      setDataLoading(false);
    }
  }, [pagination.page, pagination.limit, filterUserId, filterActionType, filterValid, filterDateFrom, filterDateTo, addToast]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchActions();
    }
  }, [authLoading, user, fetchActions]);

  // ─── Computed stats ─────────────────────────────────────────────────────

  const totalActionsToday = actions.length;
  const invalidActionsToday = actions.filter((a) => !a.is_valid).length;
  const highRiskToday = actions.filter((a) => a.risk_level === "high" || a.risk_level === "critical").length;

  const actionTypeCounts: Record<string, number> = {};
  for (const a of actions) {
    actionTypeCounts[a.action_type] = (actionTypeCounts[a.action_type] || 0) + 1;
  }
  const mostCommonAction = Object.entries(actionTypeCounts).sort((a, b) => b[1] - a[1])[0];

  // ─── Reset filters ─────────────────────────────────────────────────────

  const resetFilters = () => {
    setFilterUserId("");
    setFilterActionType("all");
    setFilterValid("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPagination((p) => ({ ...p, page: 1 }));
  };

  // ─── Auth loading ───────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading audit log...</p>
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
            <a
              href="/admin/investigations"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            >
              <IconShield />
              <span>Investigations</span>
            </a>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <IconScrollText />
              <span className="flex-1">Player Actions</span>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            </div>
            <a
              href="/admin/admin-audit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m14.5 12.5 2-2" /><path d="m14 5-8.5 8.5-1.5 5 5-1.5L17.5 3.5a2.12 2.12 0 0 1 3 3Z" /><path d="M2 19h20" />
              </svg>
              <span>Admin Actions</span>
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
            <div className="mb-6">
              <h2 className="text-white text-xl font-bold">Action Audit Log</h2>
              <p className="text-zinc-500 text-sm mt-1">
                Monitor all player actions with validation and risk analysis
              </p>
            </div>

            {/* Filter Bar */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 mb-6">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">User ID</label>
                  <input
                    type="text"
                    placeholder="Enter user UUID..."
                    value={filterUserId}
                    onChange={(e) => setFilterUserId(e.target.value)}
                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors font-mono"
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Action Type</label>
                  <select
                    value={filterActionType}
                    onChange={(e) => { setFilterActionType(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                  >
                    {ACTION_TYPE_OPTIONS.map((at) => (
                      <option key={at} value={at}>{at === "all" ? "All Types" : formatActionType(at)}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Valid</label>
                  <select
                    value={filterValid}
                    onChange={(e) => { setFilterValid(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                  >
                    <option value="all">All</option>
                    <option value="true">Valid Only</option>
                    <option value="false">Invalid Only</option>
                  </select>
                </div>
                <div className="min-w-[140px]">
                  <label className="block text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Date From</label>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => { setFilterDateFrom(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                  />
                </div>
                <div className="min-w-[140px]">
                  <label className="block text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Date To</label>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => { setFilterDateTo(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                  />
                </div>
                <div className="flex items-end gap-2 shrink-0">
                  <button
                    onClick={() => fetchActions()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-medium text-sm rounded-lg transition-colors"
                  >
                    <IconSearch />
                    Search
                  </button>
                  <button
                    onClick={resetFilters}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-400 text-sm rounded-lg hover:bg-zinc-700 hover:text-white transition-colors border border-zinc-700"
                  >
                    <IconRotateCcw />
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <IconScrollText />
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Total Actions</p>
                    <p className="text-white text-2xl font-bold">{pagination.total}</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                      <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Invalid</p>
                    <p className="text-white text-2xl font-bold">{invalidActionsToday}</p>
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
                    <p className="text-zinc-500 text-xs">High Risk</p>
                    <p className="text-white text-2xl font-bold">{highRiskToday}</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                      <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Most Common</p>
                    <p className="text-white text-sm font-bold truncate max-w-[100px]">
                      {mostCommonAction ? formatActionType(mostCommonAction[0]) : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Table */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
              {dataLoading ? (
                <div className="p-8 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-12 bg-zinc-800/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : actions.length === 0 ? (
                <div className="p-12 text-center">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600 mx-auto">
                    <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" /><path d="M19 3H9v7h14V5a2 2 0 0 0-2-2Z" />
                  </svg>
                  <p className="text-zinc-400 text-sm mb-2 mt-3">No actions found</p>
                  <p className="text-zinc-600 text-xs">Adjust your filters and try again.</p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden xl:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Time</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">User ID</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Action Type</th>
                          <th className="px-4 py-3 text-right text-xs text-zinc-500 font-medium">Money After</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Valid</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Risk Level</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Rejection Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {actions.map((action) => (
                          <tr
                            key={action.id}
                            className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <span className="text-zinc-400 text-xs whitespace-nowrap">
                                {new Date(action.created_at).toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <code className="text-zinc-300 text-xs font-mono">
                                  {truncateUid(action.user_id)}
                                </code>
                                <button
                                  onClick={() => copyToClipboard(action.user_id)}
                                  className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5 rounded shrink-0"
                                  title="Copy full ID"
                                >
                                  {copiedId === action.user_id ? (
                                    <span className="text-success"><IconCheck /></span>
                                  ) : (
                                    <IconCopy />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-zinc-300 text-xs">
                                {formatActionType(action.action_type)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-zinc-300 text-xs font-mono">
                                {formatMoney(action.money_after)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getValidBadgeClasses(action.is_valid)}`}>
                                {action.is_valid ? "Valid" : "Invalid"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getRiskBadgeClasses(action.risk_level)}`}>
                                {action.risk_level ? action.risk_level.charAt(0).toUpperCase() + action.risk_level.slice(1) : "None"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-zinc-500 text-xs block max-w-[200px] truncate" title={action.rejection_reason || undefined}>
                                {truncateStr(action.rejection_reason, 40)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile / Tablet cards */}
                  <div className="xl:hidden divide-y divide-zinc-800/50">
                    {actions.map((action) => (
                      <div key={action.id} className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-300 text-xs font-medium">
                                {formatActionType(action.action_type)}
                              </span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getValidBadgeClasses(action.is_valid)}`}>
                                {action.is_valid ? "Valid" : "Invalid"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                              <code className="text-zinc-500 text-[10px] font-mono truncate">
                                {truncateUid(action.user_id, 6)}
                              </code>
                              <button
                                onClick={() => copyToClipboard(action.user_id)}
                                className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5 shrink-0"
                              >
                                {copiedId === action.user_id ? (
                                  <span className="text-success"><IconCheck /></span>
                                ) : (
                                  <IconCopy />
                                )}
                              </button>
                            </div>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${getRiskBadgeClasses(action.risk_level)}`}>
                            {action.risk_level ? action.risk_level.charAt(0).toUpperCase() + action.risk_level.slice(1) : "None"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                          <span>{new Date(action.created_at).toLocaleString()}</span>
                          {action.money_after !== null && (
                            <span className="font-mono">{formatMoney(action.money_after)}</span>
                          )}
                        </div>
                        {action.rejection_reason && (
                          <p className="text-zinc-500 text-[10px] mt-1 truncate">
                            {truncateStr(action.rejection_reason, 60)}
                          </p>
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

      {/* ─── Toast notifications ───────────────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-right ${
              toast.type === "success"
                ? "bg-success/15 text-success border border-success/20"
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
