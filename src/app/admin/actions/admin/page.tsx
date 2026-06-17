"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

interface AdminAction {
  id: string;
  admin_user_id: string;
  admin_email: string | null;
  target_user_id: string | null;
  target_email: string | null;
  action_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const ADMIN_ACTION_TYPE_OPTIONS = [
  "all",
  "lock_account",
  "unlock_account",
  "reset_state",
  "resolve_investigation",
  "dismiss_investigation",
  "edit_state",
];

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

function IconRotateCcw() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
    </svg>
  );
}

function IconGavel() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m14.5 12.5 2-2" /><path d="m14 5-8.5 8.5-1.5 5 5-1.5L17.5 3.5a2.12 2.12 0 0 1 3 3Z" /><path d="M2 19h20" /><path d="m17 15 4 4" />
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

// ─── Helpers ──────────────────────────────────────────────────────────────

function truncateUid(uid: string | null, max = 8): string {
  if (!uid) return "—";
  if (uid.length <= max * 2 + 3) return uid;
  return uid.slice(0, max) + "..." + uid.slice(-4);
}

function formatActionType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getActionTypeBadge(type: string): string {
  switch (type) {
    case "lock_account":
      return "bg-danger/15 text-danger border-danger/20";
    case "unlock_account":
      return "bg-success/15 text-success border-success/20";
    case "reset_state":
      return "bg-domain/15 text-domain border-domain/20";
    case "resolve_investigation":
      return "bg-warning/15 text-warning border-warning/20";
    case "dismiss_investigation":
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
    case "edit_state":
      return "bg-research/15 text-research border-research/20";
    default:
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
  }
}

function getActionIcon(type: string): string {
  switch (type) {
    case "lock_account": return "🔒";
    case "unlock_account": return "🔓";
    case "reset_state": return "🔄";
    case "resolve_investigation": return "✅";
    case "dismiss_investigation": return "❌";
    case "edit_state": return "✏️";
    default: return "📋";
  }
}

// ─── Component ────────────────────────────────────────────────────────────

export default function AdminAuditPage() {
  // Data state
  const [adminActions, setAdminActions] = useState<AdminAction[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [dataLoading, setDataLoading] = useState(true);

  // Filter state
  const [filterActionType, setFilterActionType] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Detail modal
  const [detailAction, setDetailAction] = useState<AdminAction | null>(null);

  // Error display
  const [error, setError] = useState<string | null>(null);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }, []);

  // ─── Fetch admin actions ────────────────────────────────────────────────

  const fetchAdminActions = useCallback(async () => {
    try {
      setDataLoading(true);
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (filterActionType !== "all") params.set("action_type", filterActionType);
      if (filterDateFrom) params.set("date_from", filterDateFrom);
      if (filterDateTo) params.set("date_to", filterDateTo);

      const res = await fetch(`/api/admin/admin-actions?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to fetch admin actions");
      }
      const data = await res.json();
      setAdminActions(data.data || []);
      setPagination((prev) => ({ ...prev, ...data.pagination }));
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load admin actions");
    } finally {
      setDataLoading(false);
    }
  }, [pagination.page, pagination.limit, filterActionType, filterDateFrom, filterDateTo, showError]);

  useEffect(() => {
    fetchAdminActions();
  }, [fetchAdminActions]);

  // ─── Computed stats ─────────────────────────────────────────────────────

  const lockCount = adminActions.filter((a) => a.action_type === "lock_account").length;
  const unlockCount = adminActions.filter((a) => a.action_type === "unlock_account").length;
  const resolveCount = adminActions.filter((a) => a.action_type === "resolve_investigation" || a.action_type === "dismiss_investigation").length;

  // ─── Reset filters ─────────────────────────────────────────────────────

  const resetFilters = () => {
    setFilterActionType("all");
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-white text-xl font-bold">Admin Action Log</h2>
          <p className="text-muted-label text-sm mt-1">
            Audit trail of all admin moderation actions (locks, unlocks, resolves, etc.)
          </p>
        </div>
        <a
          href="/admin/audit"
          className="inline-flex items-center gap-2 px-4 py-2 bg-background/60 text-muted-label text-sm rounded-lg hover:bg-background/40 hover:text-white transition-colors border border-muted-label/30 shrink-0"
        >
          <IconScrollText />
          View Player Actions
        </a>
      </div>

      {/* Filter Bar */}
      <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-muted-label text-[10px] uppercase tracking-wider mb-1.5">Action Type</label>
            <select
              value={filterActionType}
              onChange={(e) => { setFilterActionType(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            >
              {ADMIN_ACTION_TYPE_OPTIONS.map((at) => (
                <option key={at} value={at}>{at === "all" ? "All Types" : formatActionType(at)}</option>
              ))}
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
              onClick={() => fetchAdminActions()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-warning hover:bg-warning text-black font-medium text-sm rounded-lg transition-colors"
            >
              <IconRotateCcw />
              Refresh
            </button>
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-2 px-4 py-2 bg-background/60 text-muted-label text-sm rounded-lg hover:bg-background/40 hover:text-white transition-colors border border-muted-label/30"
            >
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
              <IconGavel />
            </div>
            <div>
              <p className="text-muted-label text-xs">Total Admin Actions</p>
              <p className="text-white text-2xl font-bold">{pagination.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-danger/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Locks</p>
              <p className="text-white text-2xl font-bold">{lockCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Unlocks</p>
              <p className="text-white text-2xl font-bold">{unlockCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center">
              <IconShield />
            </div>
            <div>
              <p className="text-muted-label text-xs">Investigations</p>
              <p className="text-white text-2xl font-bold">{resolveCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Actions Table */}
      <div className="bg-background/80/60 border border-muted-label/40 rounded-xl overflow-hidden">
        {dataLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-background/60/50 rounded animate-pulse" />
            ))}
          </div>
        ) : adminActions.length === 0 ? (
          <div className="p-12 text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-label/80 mx-auto">
              <path d="m14.5 12.5 2-2" /><path d="m14 5-8.5 8.5-1.5 5 5-1.5L17.5 3.5a2.12 2.12 0 0 1 3 3Z" /><path d="M2 19h20" />
            </svg>
            <p className="text-muted-label text-sm mb-2 mt-3">No admin actions found</p>
            <p className="text-muted-label/80 text-xs">Admin operations will appear here when performed.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted-label/40">
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Time</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Admin</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Action</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Target User</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Details</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-label font-medium">View</th>
                  </tr>
                </thead>
                <tbody>
                  {adminActions.map((action) => (
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
                        <span className="text-white text-xs">
                          {action.admin_email || truncateUid(action.admin_user_id)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${getActionTypeBadge(action.action_type)}`}>
                          <span className="text-[10px]">{getActionIcon(action.action_type)}</span>
                          {formatActionType(action.action_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {action.target_user_id ? (
                          <a
                            href={`/admin/players/${action.target_user_id}`}
                            className="text-warning/80 hover:text-warning text-xs transition-colors"
                          >
                            {action.target_email || truncateUid(action.target_user_id)}
                          </a>
                        ) : (
                          <span className="text-muted-label/80 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-muted-label text-xs block max-w-[200px] truncate">
                          {action.details?.reason
                            ? String(action.details.reason)
                            : action.details?.note
                            ? String(action.details.note)
                            : action.details?.investigation_id
                            ? `Inv: ${String(action.details.investigation_id).slice(0, 8)}...`
                            : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDetailAction(action)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-label hover:text-warning hover:bg-warning/10 transition-colors border border-muted-label/30 hover:border-warning/20"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile / Tablet cards */}
            <div className="lg:hidden divide-y divide-background/60/50">
              {adminActions.map((action) => (
                <div key={action.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${getActionTypeBadge(action.action_type)}`}>
                          <span className="text-[9px]">{getActionIcon(action.action_type)}</span>
                          {formatActionType(action.action_type)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-subtle text-[10px]">
                          by {action.admin_email || "Admin"}
                        </span>
                      </div>
                    </div>
                    <span className="text-muted-label/80 text-[10px] shrink-0">
                      {new Date(action.created_at).toLocaleString()}
                    </span>
                  </div>
                  {action.target_user_id && (
                    <div className="mt-1">
                      <span className="text-muted-label text-[10px]">Target: </span>
                      <a
                        href={`/admin/players/${action.target_user_id}`}
                        className="text-warning/80 hover:text-warning text-[10px] transition-colors"
                      >
                        {action.target_email || truncateUid(action.target_user_id, 6)}
                      </a>
                    </div>
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

      {/* ─── Detail Modal ───────────────────────────────────────────────── */}
      {detailAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetailAction(null)} />
          <div className="relative bg-background/80 border border-muted-label/40 rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-muted-label/40">
              <h3 className="text-white font-medium text-sm">Action Details</h3>
              <button
                onClick={() => setDetailAction(null)}
                className="text-muted-label hover:text-white transition-colors p-1"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${getActionTypeBadge(detailAction.action_type)}`}>
                  <span className="text-[11px]">{getActionIcon(detailAction.action_type)}</span>
                  {formatActionType(detailAction.action_type)}
                </span>
                <span className="text-muted-label text-xs">
                  {new Date(detailAction.created_at).toLocaleString()}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b border-muted-label/40">
                  <span className="text-muted-label text-xs">Admin</span>
                  <span className="text-white text-xs">{detailAction.admin_email || truncateUid(detailAction.admin_user_id)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-muted-label/40">
                  <span className="text-muted-label text-xs">Target User</span>
                  <span className="text-white text-xs">
                    {detailAction.target_user_id ? (
                      <a href={`/admin/players/${detailAction.target_user_id}`} className="text-warning hover:text-warning transition-colors">
                        {detailAction.target_email || truncateUid(detailAction.target_user_id)}
                      </a>
                    ) : "—"}
                  </span>
                </div>
              </div>
              {detailAction.details && Object.keys(detailAction.details).length > 0 && (
                <div>
                  <p className="text-muted-label text-[10px] uppercase tracking-wider mb-2">Action Details</p>
                  <div className="bg-background/60/50 rounded-lg p-3 overflow-x-auto">
                    <pre className="text-muted-label text-xs font-mono leading-relaxed whitespace-pre-wrap">
                      {JSON.stringify(detailAction.details, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
