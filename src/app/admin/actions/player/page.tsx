"use client";

import { useEffect, useState, useCallback } from "react";

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

// ─── Inline SVG helpers (used in core content) ────────────────────────────

function IconScrollText() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" /><path d="M19 3H9v7h14V5a2 2 0 0 0-2-2Z" />
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
    : "bg-danger/15 text-danger border-danger/20";
}

function getRiskBadgeClasses(risk: string | null): string {
  switch (risk) {
    case "critical":
      return "bg-danger/15 text-danger border-danger/20";
    case "high":
      return "bg-domain/15 text-domain border-domain/20";
    case "medium":
      return "bg-warning/15 text-warning border-warning/20";
    case "low":
      return "bg-brand/15 text-brand border-brand/20";
    case "none":
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
    default:
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
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
  // Data state
  const [actions, setActions] = useState<PlayerAction[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [dataLoading, setDataLoading] = useState(true);

  // Filter state
  const [filterUserId, setFilterUserId] = useState("");
  const [filterActionType, setFilterActionType] = useState("all");
  const [filterValid, setFilterValid] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Error display
  const [error, setError] = useState<string | null>(null);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }, []);

  // ─── Copy to clipboard ─────────────────────────────────────────────────

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showError("Failed to copy");
    }
  }, [showError]);

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
      showError(err instanceof Error ? err.message : "Failed to load actions");
    } finally {
      setDataLoading(false);
    }
  }, [pagination.page, pagination.limit, filterUserId, filterActionType, filterValid, filterDateFrom, filterDateTo, showError]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  // ─── Computed stats ─────────────────────────────────────────────────────

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
      <div className="mb-6">
        <h2 className="text-white text-xl font-bold">Action Audit Log</h2>
        <p className="text-muted-label text-sm mt-1">
          Monitor all player actions with validation and risk analysis
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-muted-label text-[10px] uppercase tracking-wider mb-1.5">User ID</label>
            <input
              type="text"
              placeholder="Enter user UUID..."
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted-label/80 focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors font-mono"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-muted-label text-[10px] uppercase tracking-wider mb-1.5">Action Type</label>
            <select
              value={filterActionType}
              onChange={(e) => { setFilterActionType(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            >
              {ACTION_TYPE_OPTIONS.map((at) => (
                <option key={at} value={at}>{at === "all" ? "All Types" : formatActionType(at)}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[120px]">
            <label className="block text-muted-label text-[10px] uppercase tracking-wider mb-1.5">Valid</label>
            <select
              value={filterValid}
              onChange={(e) => { setFilterValid(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            >
              <option value="all">All</option>
              <option value="true">Valid Only</option>
              <option value="false">Invalid Only</option>
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-muted-label text-[10px] uppercase tracking-wider mb-1.5">Date From</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-muted-label text-[10px] uppercase tracking-wider mb-1.5">Date To</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors"
            />
          </div>
          <div className="flex items-end gap-2 shrink-0">
            <button
              onClick={() => fetchActions()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-warning hover:bg-warning text-black font-medium text-sm rounded-lg transition-colors"
            >
              <IconSearch />
              Search
            </button>
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-2 px-4 py-2 bg-background/60 text-muted-label text-sm rounded-lg hover:bg-background/40 hover:text-white transition-colors border border-muted-label/30"
            >
              <IconRotateCcw />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center">
              <IconScrollText />
            </div>
            <div>
              <p className="text-muted-label text-xs">Total Actions</p>
              <p className="text-white text-2xl font-bold">{pagination.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-danger/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
                <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Invalid</p>
              <p className="text-white text-2xl font-bold">{invalidActionsToday}</p>
            </div>
          </div>
        </div>

        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-domain/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-domain">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">High Risk</p>
              <p className="text-white text-2xl font-bold">{highRiskToday}</p>
            </div>
          </div>
        </div>

        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand">
                <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Most Common</p>
              <p className="text-white text-sm font-bold truncate max-w-[100px]">
                {mostCommonAction ? formatActionType(mostCommonAction[0]) : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions Table */}
      <div className="bg-background/80/60 border border-muted-label/40 rounded-xl overflow-hidden">
        {dataLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-background/60/50 rounded animate-pulse" />
            ))}
          </div>
        ) : actions.length === 0 ? (
          <div className="p-12 text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-label/80 mx-auto">
              <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" /><path d="M19 3H9v7h14V5a2 2 0 0 0-2-2Z" />
            </svg>
            <p className="text-muted-label text-sm mb-2 mt-3">No actions found</p>
            <p className="text-muted-label/80 text-xs">Adjust your filters and try again.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden xl:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted-label/40">
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Time</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">User ID</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Action Type</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-label font-medium">Money After</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Valid</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Risk Level</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Rejection Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((action) => (
                    <tr
                      key={action.id}
                      className="border-b border-muted-label/40/50 hover:bg-background/60/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-muted-label text-xs whitespace-nowrap">
                          {new Date(action.created_at).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="text-subtle text-xs font-mono">
                            {truncateUid(action.user_id)}
                          </code>
                          <button
                            onClick={() => copyToClipboard(action.user_id)}
                            className="text-muted-label/80 hover:text-subtle transition-colors p-0.5 rounded shrink-0"
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
                        <span className="text-subtle text-xs">
                          {formatActionType(action.action_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-subtle text-xs font-mono">
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
                        <span className="text-muted-label text-xs block max-w-[200px] truncate" title={action.rejection_reason || undefined}>
                          {truncateStr(action.rejection_reason, 40)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile / Tablet cards */}
            <div className="xl:hidden divide-y divide-background/60/50">
              {actions.map((action) => (
                <div key={action.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-subtle text-xs font-medium">
                          {formatActionType(action.action_type)}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getValidBadgeClasses(action.is_valid)}`}>
                          {action.is_valid ? "Valid" : "Invalid"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <code className="text-muted-label text-[10px] font-mono truncate">
                          {truncateUid(action.user_id, 6)}
                        </code>
                        <button
                          onClick={() => copyToClipboard(action.user_id)}
                          className="text-muted-label/80 hover:text-subtle transition-colors p-0.5 shrink-0"
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
                  <div className="flex items-center gap-3 text-[10px] text-muted-label">
                    <span>{new Date(action.created_at).toLocaleString()}</span>
                    {action.money_after !== null && (
                      <span className="font-mono">{formatMoney(action.money_after)}</span>
                    )}
                  </div>
                  {action.rejection_reason && (
                    <p className="text-muted-label text-[10px] mt-1 truncate">
                      {truncateStr(action.rejection_reason, 60)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-muted-label/40">
                <div className="text-xs text-muted-label">
                  Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                    disabled={pagination.page <= 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-muted-label hover:text-white bg-background/60/50 hover:bg-background/60 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-muted-label/30"
                  >
                    <IconChevronLeft />
                    Prev
                  </button>
                  <span className="text-muted-label text-xs">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-muted-label hover:text-white bg-background/60/50 hover:bg-background/60 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-muted-label/30"
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
    </>
  );
}
