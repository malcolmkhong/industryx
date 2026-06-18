"use client";

import { useEffect, useState, useCallback } from "react";

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

// ─── Inline SVG helpers (used in core content) ────────────────────────────

function IconClipboardList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />
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

// ─── Helpers ──────────────────────────────────────────────────────────────

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "open":
      return "bg-danger/15 text-danger border-danger/20";
    case "investigating":
      return "bg-warning/15 text-warning border-warning/20";
    case "resolved":
      return "bg-success/15 text-success border-success/20";
    case "dismissed":
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
    default:
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
  }
}

function getSeverityBadgeClasses(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-danger/15 text-danger border-danger/20";
    case "high":
      return "bg-domain/15 text-domain border-domain/20";
    case "medium":
      return "bg-warning/15 text-warning border-warning/20";
    case "low":
      return "bg-brand/15 text-brand border-brand/20";
    default:
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
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
  // Data state
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [dataLoading, setDataLoading] = useState(true);

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

  // Error display
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }, []);

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
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
      showError(err instanceof Error ? err.message : "Failed to load investigations");
    } finally {
      setDataLoading(false);
    }
  }, [pagination.page, pagination.limit, filterStatus, filterSeverity, filterDetectionType, showError]);

  useEffect(() => {
    fetchInvestigations();
  }, [fetchInvestigations]);

  // ─── Handle action (resolve/dismiss) ────────────────────────────────────

  const handleAction = async (investigationId: string, action: "resolve" | "dismiss") => {
    if (!actionNote.trim()) {
      showError("A note is required");
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
      showSuccess(`Investigation ${action === "resolve" ? "resolved" : "dismissed"} successfully`);
      setActionTarget(null);
      setActionType(null);
      setActionNote("");
      fetchInvestigations();
    } catch (err) {
      showError(err instanceof Error ? err.message : `Failed to ${action} investigation`);
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

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Notification banners */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/15 text-danger border border-danger/20 text-sm font-medium">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-success/15 text-success border border-success/20 text-sm font-medium">
          <IconCheck />
          {successMsg}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-white text-xl font-bold">Cheat Investigations</h2>
          <p className="text-muted-label text-sm mt-1">
            Monitor and manage cheat detection investigations
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-35">
            <label htmlFor="filter-status" className="block text-muted-label text-[10px] uppercase tracking-wider mb-1.5">Status</label>
            <select
              id="filter-status"
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-35">
            <label htmlFor="filter-severity" className="block text-muted-label text-[10px] uppercase tracking-wider mb-1.5">Severity</label>
            <select
              id="filter-severity"
              value={filterSeverity}
              onChange={(e) => { setFilterSeverity(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            >
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All Severities" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label htmlFor="filter-detection-type" className="block text-muted-label text-[10px] uppercase tracking-wider mb-1.5">Detection Type</label>
            <select
              id="filter-detection-type"
              value={filterDetectionType}
              onChange={(e) => { setFilterDetectionType(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            >
              {DETECTION_TYPE_OPTIONS.map((dt) => (
                <option key={dt} value={dt}>{dt === "all" ? "All Types" : formatDetectionType(dt)}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => fetchInvestigations()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-warning/10 text-warning text-sm rounded-lg hover:bg-warning/20 transition-colors border border-warning/20 shrink-0"
          >
            <IconRefresh />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-danger/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Open Count</p>
              <p className="text-white text-2xl font-bold">{openCount}</p>
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
              <p className="text-muted-label text-xs">Critical</p>
              <p className="text-white text-2xl font-bold">{criticalCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Resolved Today</p>
              <p className="text-white text-2xl font-bold">{resolvedToday}</p>
            </div>
          </div>
        </div>

        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center">
              <IconClipboardList />
            </div>
            <div>
              <p className="text-muted-label text-xs">Total</p>
              <p className="text-white text-2xl font-bold">{totalInvestigations}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Investigations Table */}
      <div className="bg-background/80/60 border border-muted-label/40 rounded-xl overflow-hidden">
        {dataLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-background/60/50 rounded animate-pulse" />
            ))}
          </div>
        ) : investigations.length === 0 ? (
          <div className="p-12 text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-label/80 mx-auto">
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            </svg>
            <p className="text-muted-label text-sm mb-2 mt-3">No investigations found</p>
            <p className="text-muted-label/80 text-xs">Adjust filters or wait for new detections.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted-label/40">
                    <th scope="col" className="px-4 py-3 text-left text-xs text-muted-label font-medium">User Email</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-muted-label font-medium">Detection Type</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-muted-label font-medium">Severity</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-muted-label font-medium">Description</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-muted-label font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-muted-label font-medium">Created</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs text-muted-label font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {investigations.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-muted-label/40/50 hover:bg-background/60/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-white text-sm truncate max-w-45 block">
                          {inv.user_email || truncateStr(inv.user_id, 12)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-subtle text-xs">
                          {formatDetectionType(inv.detection_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getSeverityBadgeClasses(inv.severity)}`}>
                          {inv.severity.charAt(0).toUpperCase() + inv.severity.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-muted-label text-xs block max-w-50 truncate" title={inv.description || undefined}>
                          {truncateStr(inv.description || "—", 50)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getStatusBadgeClasses(inv.status)}`}>
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-muted-label text-xs">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {actionTarget === inv.id ? (
                          <div
                            className="flex flex-col items-end gap-2"
                            role="dialog"
                            aria-label={actionType === "resolve" ? "Resolve investigation" : "Dismiss investigation"}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <label htmlFor={`action-note-${inv.id}`} className="sr-only">
                                {actionType === "resolve" ? "Resolution note" : "Dismissal note"}
                              </label>
                              <input
                                id={`action-note-${inv.id}`}
                                type="text"
                                name="actionNote"
                                required
                                aria-required="true"
                                aria-label={actionType === "resolve" ? "Resolution note (required)" : "Dismissal note (required)"}
                                placeholder={`${actionType === "resolve" ? "Resolution" : "Dismissal"} note...`}
                                value={actionNote}
                                onChange={(e) => setActionNote(e.target.value)}
                                aria-invalid={!actionNote.trim() ? "true" : undefined}
                                className="flex-1 bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-muted-label/80 focus:outline-none focus:border-warning/50 transition-colors"
                                autoFocus
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => { setActionTarget(null); setActionType(null); setActionNote(""); }}
                                aria-label={`Cancel ${actionType} action`}
                                className="px-2.5 py-1 text-xs text-muted-label hover:text-white hover:bg-background/60 rounded-lg transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => actionType && handleAction(inv.id, actionType)}
                                disabled={actionLoading || !actionNote.trim()}
                                aria-label={actionType === "resolve" ? `Confirm resolve for investigation ${inv.id}` : `Confirm dismiss for investigation ${inv.id}`}
                                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                                  actionType === "resolve"
                                    ? "bg-success/15 text-success border border-success/20 hover:bg-success/25 disabled:opacity-50"
                                    : "bg-background/20/15 text-muted-label border border-muted-label/10/20 hover:bg-background/20/25 disabled:opacity-50"
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
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-label hover:text-warning hover:bg-warning/10 transition-colors border border-muted-label/30 hover:border-warning/20"
                            >
                              <IconEye />
                              View
                            </button>
                            {(inv.status === "open" || inv.status === "investigating") && (
                              <>
                                <button
                                  onClick={() => { setActionTarget(inv.id); setActionType("resolve"); setActionNote(""); }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-success hover:bg-success/10 transition-colors border border-success/20"
                                >
                                  <IconCheck />
                                  Resolve
                                </button>
                                <button
                                  onClick={() => { setActionTarget(inv.id); setActionType("dismiss"); setActionNote(""); }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-label hover:bg-background/20/10 transition-colors border border-muted-label/20"
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
            <div className="lg:hidden divide-y divide-background/60/50">
              {investigations.map((inv) => (
                <div key={inv.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">
                        {inv.user_email || truncateStr(inv.user_id, 12)}
                      </p>
                      <p className="text-muted-label text-[10px] mt-0.5">
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
                    <p className="text-muted-label text-xs mb-2 line-clamp-2">{inv.description}</p>
                  )}
                  <p className="text-muted-label/80 text-[10px] mb-2">
                    {new Date(inv.created_at).toLocaleString()}
                  </p>
                  {actionTarget === inv.id ? (
                    <div className="space-y-2">
                      <label htmlFor={`mobile-action-note-${inv.id}`} className="sr-only">
                        {actionType === "resolve" ? "Resolution note (required)" : "Dismissal note (required)"}
                      </label>
                      <input
                        id={`mobile-action-note-${inv.id}`}
                        type="text"
                        aria-required="true"
                        aria-label={actionType === "resolve" ? "Resolution note (required)" : "Dismissal note (required)"}
                        placeholder={`${actionType === "resolve" ? "Resolution" : "Dismissal"} note...`}
                        value={actionNote}
                        onChange={(e) => setActionNote(e.target.value)}
                        className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-muted-label/80 focus:outline-none focus:border-warning/50 transition-colors"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setActionTarget(null); setActionType(null); setActionNote(""); }}
                          aria-label="Cancel action"
                          className="px-3 py-1.5 text-xs text-muted-label hover:text-white hover:bg-background/60 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => actionType && handleAction(inv.id, actionType)}
                          disabled={actionLoading || !actionNote.trim()}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                            actionType === "resolve"
                              ? "bg-success/15 text-success border border-success/20 disabled:opacity-50"
                              : "bg-background/20/15 text-muted-label border border-muted-label/10/20 disabled:opacity-50"
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
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-label hover:text-warning hover:bg-warning/10 transition-colors border border-muted-label/30"
                      >
                        <IconEye />
                        View
                      </button>
                      {(inv.status === "open" || inv.status === "investigating") && (
                        <>
                          <button
                            onClick={() => { setActionTarget(inv.id); setActionType("resolve"); setActionNote(""); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-success hover:bg-success/10 transition-colors border border-success/20"
                          >
                            <IconCheck />
                            Resolve
                          </button>
                          <button
                            onClick={() => { setActionTarget(inv.id); setActionType("dismiss"); setActionNote(""); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-label hover:bg-background/20/10 transition-colors border border-muted-label/20"
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

      {/* ─── View Detail Modal ──────────────────────────────────────────── */}
      {viewTarget && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="investigation-detail-title"
        >
          <div className="bg-background/80 border border-muted-label/40 rounded-xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-muted-label/40 sticky top-0 bg-background/80 z-10">
              <h3 id="investigation-detail-title" className="text-white font-semibold">Investigation Detail</h3>
              <button
                type="button"
                onClick={() => setViewTarget(null)}
                aria-label="Close details"
                className="text-muted-label hover:text-white transition-colors p-1"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-label text-[10px] uppercase tracking-wider mb-1">User</p>
                  <p className="text-white text-sm">{viewTarget.user_email || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-label text-[10px] uppercase tracking-wider mb-1">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getStatusBadgeClasses(viewTarget.status)}`}>
                    {viewTarget.status.charAt(0).toUpperCase() + viewTarget.status.slice(1)}
                  </span>
                </div>
                <div>
                  <p className="text-muted-label text-[10px] uppercase tracking-wider mb-1">Detection Type</p>
                  <p className="text-subtle text-sm">{formatDetectionType(viewTarget.detection_type)}</p>
                </div>
                <div>
                  <p className="text-muted-label text-[10px] uppercase tracking-wider mb-1">Severity</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getSeverityBadgeClasses(viewTarget.severity)}`}>
                    {viewTarget.severity.charAt(0).toUpperCase() + viewTarget.severity.slice(1)}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-muted-label text-[10px] uppercase tracking-wider mb-1">Description</p>
                <p className="text-subtle text-sm">{viewTarget.description || "—"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-label text-[10px] uppercase tracking-wider mb-1">Created At</p>
                  <p className="text-subtle text-xs">{new Date(viewTarget.created_at).toLocaleString()}</p>
                </div>
                {viewTarget.resolved_at && (
                  <div>
                    <p className="text-muted-label text-[10px] uppercase tracking-wider mb-1">Resolved At</p>
                    <p className="text-subtle text-xs">{new Date(viewTarget.resolved_at).toLocaleString()}</p>
                  </div>
                )}
              </div>
              {viewTarget.resolution_note && (
                <div>
                  <p className="text-muted-label text-[10px] uppercase tracking-wider mb-1">Resolution Note</p>
                  <div className="px-3 py-2 rounded-lg bg-background/60/50 border border-muted-label/30">
                    <p className="text-subtle text-sm">{viewTarget.resolution_note}</p>
                  </div>
                  {viewTarget.resolved_by_email && (
                    <p className="text-muted-label/80 text-[10px] mt-1">by {viewTarget.resolved_by_email}</p>
                  )}
                </div>
              )}
              <div>
                <p className="text-muted-label text-[10px] uppercase tracking-wider mb-1">Investigation ID</p>
                <p className="text-muted-label text-xs font-mono">{viewTarget.id}</p>
              </div>
              <div>
                <p className="text-muted-label text-[10px] uppercase tracking-wider mb-1">User ID</p>
                <p className="text-muted-label text-xs font-mono">{viewTarget.user_id}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
