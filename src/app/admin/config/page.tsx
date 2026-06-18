"use client";

import { useEffect, useState, useCallback } from "react";
import { TABLE_CONFIGS, getTableConfig, type TableConfig, type ColumnConfig } from "@/lib/config/tables";

// ─── Types ────────────────────────────────────────────────────────────────

interface TableInfo {
  id: string;
  displayName: string;
  icon: string;
  primaryKey: string;
  rowCount: number;
}

interface Category {
  name: string;
  tables: TableInfo[];
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface SortConfig {
  column: string;
  order: "asc" | "desc";
}

type ModalMode = "create" | "edit" | null;

// ─── Inline SVG helpers (used in core content) ────────────────────────────

function IconDatabase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />
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

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function IconChevronUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
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

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
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

function IconExpand() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconCollapse() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

// ─── Helper: format cell value ────────────────────────────────────────────

function formatCellValue(value: unknown, col: ColumnConfig): string {
  if (value === null || value === undefined) return "—";
  if (col.type === "boolean") return String(value);
  if (col.type === "json") {
    const str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return str.length > 100 ? str.slice(0, 100) + "..." : str;
  }
  if (col.type === "date") {
    try {
      return new Date(value as string).toLocaleString();
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function truncateStr(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

// ─── Component ────────────────────────────────────────────────────────────

export default function ConfigTablesPage() {
  // Table list state
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tableListLoading, setTableListLoading] = useState(true);

  // Data state
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: "", order: "asc" });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [dataLoading, setDataLoading] = useState(false);

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [currentRow, setCurrentRow] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [jsonExpanded, setJsonExpanded] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // ─── Fetch table list ──────────────────────────────────────────────────

  useEffect(() => {
    const fetchTables = async () => {
      try {
        setTableListLoading(true);
        const res = await fetch("/api/tables");
        if (!res.ok) throw new Error("Failed to fetch tables");
        const data = await res.json();
        setCategories(data.categories || []);

        if (data.categories?.length > 0 && data.categories[0].tables?.length > 0) {
          setSelectedTable(data.categories[0].tables[0].id);
        }
      } catch (err) {
        showError("Failed to load table list");
      } finally {
        setTableListLoading(false);
      }
    };
    fetchTables();
  }, [showError]);

  // ─── Search debounce ───────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchQuery);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ─── Fetch table data ──────────────────────────────────────────────────

  const fetchTableData = useCallback(async () => {
    if (!selectedTable) return;
    const tableConfig = getTableConfig(selectedTable);
    if (!tableConfig) return;

    try {
      setDataLoading(true);
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sort: sortConfig.column || tableConfig.primaryKey,
        sortOrder: sortConfig.order,
      });
      if (searchDebounced) {
        params.set("search", searchDebounced);
      }

      const res = await fetch(`/api/config/${selectedTable}?${params}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to fetch data");
      }
      const data = await res.json();
      setRows(data.data || []);
      setPagination((prev) => ({ ...prev, ...data.pagination }));
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load data");
      setRows([]);
    } finally {
      setDataLoading(false);
    }
  }, [selectedTable, pagination.page, pagination.pageSize, sortConfig, searchDebounced, showError]);

  useEffect(() => {
    fetchTableData();
  }, [fetchTableData]);

  // ─── Table selection ────────────────────────────────────────────────────

  const handleSelectTable = (tableId: string) => {
    if (tableId === selectedTable) return;
    setSelectedTable(tableId);
    setPagination({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
    setSortConfig({ column: "", order: "asc" });
    setSearchQuery("");
    setSearchDebounced("");
    setSidebarOpen(false);
  };

  // ─── Sort ───────────────────────────────────────────────────────────────

  const handleSort = (columnKey: string) => {
    setSortConfig((prev) => {
      if (prev.column === columnKey) {
        return { column: columnKey, order: prev.order === "asc" ? "desc" : "asc" };
      }
      return { column: columnKey, order: "asc" };
    });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // ─── Modal ──────────────────────────────────────────────────────────────

  const openCreateModal = () => {
    if (!selectedTable) return;
    const tableConfig = getTableConfig(selectedTable);
    if (!tableConfig) return;

    const defaults: Record<string, unknown> = {};
    for (const col of tableConfig.columns) {
      if (col.type === "boolean") defaults[col.key] = false;
      else if (col.type === "integer") defaults[col.key] = 0;
      else if (col.type === "number") defaults[col.key] = 0;
      else if (col.type === "json") defaults[col.key] = "{}";
      else defaults[col.key] = "";
    }
    setFormData(defaults);
    setCurrentRow(null);
    setModalMode("create");
  };

  const openEditModal = (row: Record<string, unknown>) => {
    if (!selectedTable) return;
    const tableConfig = getTableConfig(selectedTable);
    if (!tableConfig) return;

    const formValues: Record<string, unknown> = {};
    for (const col of tableConfig.columns) {
      if (col.type === "json" && row[col.key] !== null && row[col.key] !== undefined) {
        formValues[col.key] = typeof row[col.key] === "string" ? row[col.key] : JSON.stringify(row[col.key], null, 2);
      } else {
        formValues[col.key] = row[col.key] ?? "";
      }
    }
    setFormData(formValues);
    setCurrentRow(row);
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setCurrentRow(null);
    setFormData({});
  };

  const handleSave = async () => {
    if (!selectedTable) return;
    const tableConfig = getTableConfig(selectedTable);
    if (!tableConfig) return;

    const requiredCols = tableConfig.columns.filter((c) => c.required && !c.hidden);
    for (const col of requiredCols) {
      const val = formData[col.key];
      if (val === undefined || val === null || val === "") {
        showError(`Required field "${col.label}" is missing`);
        return;
      }
    }

    const jsonCols = tableConfig.columns.filter((c) => c.type === "json");
    for (const col of jsonCols) {
      const val = formData[col.key];
      if (val && typeof val === "string") {
        try {
          JSON.parse(val);
        } catch {
          showError(`Invalid JSON in "${col.label}"`);
          return;
        }
      }
    }

    try {
      setSaving(true);

      const body: Record<string, unknown> = {};
      for (const col of tableConfig.columns) {
        if (!col.editable && !col.required) continue;
        if (formData[col.key] !== undefined && formData[col.key] !== "") {
          if (col.type === "json" && typeof formData[col.key] === "string") {
            try {
              body[col.key] = JSON.parse(formData[col.key] as string);
            } catch {
              body[col.key] = formData[col.key];
            }
          } else if (col.type === "integer") {
            body[col.key] = parseInt(formData[col.key] as string, 10);
          } else if (col.type === "number") {
            body[col.key] = parseFloat(formData[col.key] as string);
          } else if (col.type === "boolean") {
            body[col.key] = formData[col.key] === true || formData[col.key] === "true";
          } else {
            body[col.key] = formData[col.key];
          }
        }
      }

      if (modalMode === "create") {
        const res = await fetch(`/api/config/${selectedTable}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || "Failed to create row");
        }
        showSuccess("Row created successfully");
      } else if (modalMode === "edit" && currentRow) {
        const pk = tableConfig.primaryKey;
        const pkValue = String(currentRow[pk]);
        const res = await fetch(`/api/config/${selectedTable}/${encodeURIComponent(pkValue)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || "Failed to update row");
        }
        showSuccess("Row updated successfully");
      }

      closeModal();
      fetchTableData();
      refreshTableCounts();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!selectedTable || !deleteTarget) return;
    const tableConfig = getTableConfig(selectedTable);
    if (!tableConfig) return;

    try {
      setDeleting(true);
      const pk = tableConfig.primaryKey;
      const pkValue = String(deleteTarget[pk]);
      const res = await fetch(`/api/config/${selectedTable}/${encodeURIComponent(pkValue)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to delete row");
      }
      showSuccess("Row deleted successfully");
      setDeleteTarget(null);
      fetchTableData();
      refreshTableCounts();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  // ─── Refresh table counts ───────────────────────────────────────────────

  const refreshTableCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/tables");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {
      // Silently ignore
    }
  }, []);

  // ─── Get current table config ───────────────────────────────────────────

  const currentTableConfig = selectedTable ? getTableConfig(selectedTable) : null;

  const visibleColumns = currentTableConfig
    ? currentTableConfig.columns.filter((c) => !c.hidden)
    : [];

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 -m-6" style={{ margin: '-1.5rem' }}>
      {/* Notification banners */}
      {(error || successMsg) && (
        <div className="absolute top-0 left-0 right-0 z-40 p-3">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/15 text-danger border border-danger/20 text-sm font-medium">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success/15 text-success border border-success/20 text-sm font-medium mt-1">
              <IconCheck />
              {successMsg}
            </div>
          )}
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-20"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSidebarOpen(false); }}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
        />
      )}

      {/* ─── Table List Sidebar ────────────────────────────────────────── */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-20 md:z-auto
        w-64 md:w-56 bg-background/80/95 md:bg-background/80/50 border-r border-muted-label/40
        flex flex-col shrink-0 transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        pt-14 md:pt-0
      `}>
        {/* Mobile menu button */}
        <button
          className="md:hidden fixed top-3 left-3 z-30 text-muted-label hover:text-white p-1 bg-background/80/80 rounded"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>

        {/* Table list by category */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {tableListLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 bg-background/60/50 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat.name}>
                <p className="text-[10px] text-muted-label uppercase tracking-wider mb-1.5 px-2">
                  {cat.name}
                </p>
                <div className="space-y-0.5">
                  {cat.tables.map((table) => (
                    <button
                      key={table.id}
                      onClick={() => handleSelectTable(table.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all ${
                        selectedTable === table.id
                          ? "bg-warning/10 text-warning border border-warning/20"
                          : "text-muted-label hover:text-subtle hover:bg-background/60/60"
                      }`}
                    >
                      <span className="text-sm">{table.icon}</span>
                      <span className="flex-1 text-left truncate">{table.displayName}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                        selectedTable === table.id
                          ? "bg-warning/20 text-warning"
                          : "bg-background/60 text-muted-label"
                      }`}>
                        {table.rowCount >= 0 ? table.rowCount : "?"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Phase indicator */}
        <div className="p-3 border-t border-muted-label/40">
          <div className="p-3 bg-background/60/50 rounded-lg">
            <p className="text-[10px] text-muted-label uppercase tracking-wider mb-1">Phase</p>
            <p className="text-xs text-warning font-medium">Phase 3 — Admin & Moderation</p>
            <div className="mt-2 w-full bg-background/40 rounded-full h-1.5">
              <div className="bg-warning h-1.5 rounded-full" style={{ width: "80%" }} />
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ───────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {!selectedTable || !currentTableConfig ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-4">🗄️</div>
              <h2 className="text-white text-lg font-medium mb-2">Select a table</h2>
              <p className="text-muted-label text-sm">Choose a config table from the sidebar to view and manage its data.</p>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            {/* ─── Table Header ─────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{currentTableConfig.icon}</span>
                  <h2 className="text-white text-lg font-semibold">{currentTableConfig.displayName}</h2>
                </div>
                <p className="text-muted-label text-xs mt-1">
                  {currentTableConfig.id} · {pagination.total} row{pagination.total !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-warning hover:bg-warning text-black font-medium text-sm rounded-lg transition-colors shrink-0"
              >
                <IconPlus />
                Add Row
              </button>
            </div>

            {/* ─── Search Bar ───────────────────────────────────────────── */}
            <div className="relative mb-4">
              <label htmlFor="config-search" className="sr-only">Search rows</label>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-label" aria-hidden="true">
                <IconSearch />
              </div>
              <input
                id="config-search"
                type="search"
                name="search"
                autoComplete="off"
                aria-label="Search across all text columns"
                placeholder="Search across all text columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background/80/80 border border-muted-label/40 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-muted-label/80 focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => { setSearchQuery(""); setSearchDebounced(""); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-label hover:text-subtle"
                >
                  <IconX aria-hidden="true" />
                </button>
              )}
            </div>

            {/* ─── Data Table ───────────────────────────────────────────── */}
            <div className="bg-background/80/60 border border-muted-label/40 rounded-xl overflow-hidden">
              {dataLoading ? (
                <div className="p-8 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-10 bg-background/60/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-3xl mb-3">📭</div>
                  <p className="text-muted-label text-sm">
                    {searchDebounced ? "No rows match your search." : "This table is empty."}
                  </p>
                  {!searchDebounced && (
                    <button
                      onClick={openCreateModal}
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-warning/10 text-warning text-sm rounded-lg hover:bg-warning/20 transition-colors border border-warning/20"
                    >
                      <IconPlus />
                      Create first row
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-muted-label/40">
                          <th scope="col" className="px-3 py-3 text-left text-xs text-muted-label font-medium w-20 sticky left-0 bg-background/80/95 z-10">
                            Actions
                          </th>
                          {visibleColumns.map((col) => (
                            <th
                              scope="col"
                              key={col.key}
                              className={`px-3 py-3 text-xs font-medium whitespace-nowrap ${
                                col.type === "number" || col.type === "integer"
                                  ? "text-right"
                                  : "text-left"
                              } ${col.sortable ? "cursor-pointer hover:text-subtle select-none" : "text-muted-label"}`}
                              onClick={() => col.sortable && handleSort(col.key)}
                            >
                              <div className={`flex items-center gap-1 ${col.type === "number" || col.type === "integer" ? "justify-end" : ""}`}>
                                <span className={col.key === currentTableConfig.primaryKey ? "text-warning" : "text-muted-label"}>
                                  {col.label}
                                  {col.key === currentTableConfig.primaryKey && (
                                    <span className="ml-1 text-[9px] text-warning/60">PK</span>
                                  )}
                                </span>
                                {col.sortable && sortConfig.column === col.key && (
                                  <span className="text-warning">
                                    {sortConfig.order === "asc" ? <IconChevronUp /> : <IconChevronDown />}
                                  </span>
                                )}
                                {col.required && (
                                  <span className="text-danger/60 text-[10px]">*</span>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIdx) => (
                          <tr
                            key={String(row[currentTableConfig.primaryKey] ?? rowIdx)}
                            className="border-b border-muted-label/40/50 hover:bg-background/60/30 transition-colors group"
                          >
                            {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- <td> is a table cell, not a control */}
                            <td className="px-3 py-2.5 sticky left-0 bg-background/80/90 group-hover:bg-background/60/40 z-10">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEditModal(row)}
                                  className="p-1.5 rounded text-muted-label hover:text-warning hover:bg-warning/10 transition-colors"
                                  title="Edit row"
                                >
                                  <IconEdit />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(row)}
                                  className="p-1.5 rounded text-muted-label hover:text-danger hover:bg-danger/10 transition-colors"
                                  title="Delete row"
                                >
                                  <IconTrash />
                                </button>
                              </div>
                            </td>
                            {visibleColumns.map((col) => (
                              <td
                                key={col.key}
                                className={`px-3 py-2.5 text-xs ${
                                  col.type === "number" || col.type === "integer"
                                    ? "text-right font-mono"
                                    : ""
                                } ${col.key === currentTableConfig.primaryKey ? "text-warning font-medium" : "text-subtle"}`}
                              >
                                {col.type === "boolean" ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                    row[col.key]
                                      ? "bg-success/15 text-success border border-success/20"
                                      : "bg-danger/15 text-danger border border-danger/20"
                                  }`}>
                                    {row[col.key] ? "true" : "false"}
                                  </span>
                                ) : col.type === "json" ? (
                                  <JsonCell
                                    value={row[col.key]}
                                    colKey={col.key}
                                    expanded={jsonExpanded[`${rowIdx}-${col.key}`] || false}
                                    onToggle={() =>
                                      setJsonExpanded((prev) => ({
                                        ...prev,
                                        [`${rowIdx}-${col.key}`]: !prev[`${rowIdx}-${col.key}`],
                                      }))
                                    }
                                  />
                                ) : (
                                  <span className="block max-w-75 truncate" title={formatCellValue(row[col.key], col)}>
                                    {col.key === "icon" ? (
                                      <span className="inline-flex items-center gap-1">
                                        <span>{String(row[col.key] ?? "")}</span>
                                      </span>
                                    ) : (
                                      truncateStr(formatCellValue(row[col.key], col), 80)
                                    )}
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ─── Pagination ──────────────────────────────────────── */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-muted-label/40">
                    <div className="flex items-center gap-2 text-xs text-muted-label">
                      <span>
                        Showing {((pagination.page - 1) * pagination.pageSize) + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
                      </span>
                      <span className="text-muted-label/30">|</span>
                      <div className="flex items-center gap-1">
                        <span>Rows:</span>
                        {[10, 25, 50, 100].map((size) => (
                          <button
                            key={size}
                            onClick={() => {
                              setPagination((prev) => ({ ...prev, pageSize: size, page: 1 }));
                            }}
                            className={`px-2 py-0.5 rounded text-xs transition-colors ${
                              pagination.pageSize === size
                                ? "bg-warning/20 text-warning"
                                : "text-muted-label hover:text-subtle hover:bg-background/60"
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                        disabled={pagination.page <= 1}
                        className="p-1.5 rounded text-muted-label hover:text-white hover:bg-background/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <IconChevronLeft />
                      </button>
                      {generatePageNumbers(pagination.page, pagination.totalPages).map((p, i) =>
                        p === "..." ? (
                          <span key={`dots-${i}`} className="px-1 text-muted-label/80 text-xs">...</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPagination((prev) => ({ ...prev, page: p as number }))}
                            className={`w-8 h-8 rounded text-xs transition-colors ${
                              pagination.page === p
                                ? "bg-warning/20 text-warning font-medium"
                                : "text-muted-label hover:text-white hover:bg-background/60"
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                      <button
                        onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                        disabled={pagination.page >= pagination.totalPages}
                        className="p-1.5 rounded text-muted-label hover:text-white hover:bg-background/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <IconChevronRight />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── Create/Edit Modal ──────────────────────────────────────────── */}
      {modalMode && currentTableConfig && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] sm:pt-[10vh]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="config-modal-title"
        >
          <div className="absolute inset-0 bg-black/70" onClick={closeModal} onKeyDown={(e) => { if (e.key === 'Escape') closeModal(); }} role="button" tabIndex={0} aria-label="Close" />
          <div className="relative w-full max-w-2xl mx-4 bg-background/80 border border-muted-label/40 rounded-xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-muted-label/40 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden="true">{currentTableConfig.icon}</span>
                <h3 id="config-modal-title" className="text-white font-semibold">
                  {modalMode === "create" ? "Add Row" : "Edit Row"} — {currentTableConfig.displayName}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close dialog"
                className="p-1.5 rounded text-muted-label hover:text-white hover:bg-background/60 transition-colors"
              >
                <IconX aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {currentTableConfig.columns
                .filter((col) => col.editable || (modalMode === "create" && col.required))
                .map((col) => (
                  <div key={col.key}>
                    <label
                      htmlFor={`config-field-${col.key}`}
                      className="flex items-center gap-1 text-xs font-medium text-muted-label mb-1.5"
                    >
                      {col.label}
                      {col.required && <span className="text-danger" aria-hidden="true">*</span>}
                      {col.key === currentTableConfig.primaryKey && (
                        <span className="text-[9px] text-warning/60 ml-1">PK</span>
                      )}
                    </label>

                    {col.type === "boolean" ? (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={formData[col.key] === true || formData[col.key] === "true"}
                          aria-label={`Toggle ${col.label}`}
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              [col.key]: !(prev[col.key] === true || prev[col.key] === "true"),
                            }))
                          }
                          className={`relative w-10 h-5.5 rounded-full transition-colors ${
                            formData[col.key] === true || formData[col.key] === "true"
                              ? "bg-warning"
                              : "bg-background/40"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 rounded-full bg-white transition-transform ${
                              formData[col.key] === true || formData[col.key] === "true"
                                ? "translate-x-4.5"
                                : "translate-x-0"
                            }`}
                            style={{ width: 18, height: 18 }}
                          />
                        </button>
                        <span className="text-xs text-muted-label">
                          {formData[col.key] === true || formData[col.key] === "true" ? "Yes" : "No"}
                        </span>
                      </div>
                    ) : col.type === "json" ? (
                      <div>
                        <textarea
                          id={`config-field-${col.key}`}
                          aria-label={col.label}
                          aria-required={col.required ? "true" : undefined}
                          value={(() => { const v = formData[col.key]; return typeof v === "string" ? v : JSON.stringify(v, null, 2) ?? ""; })()}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, [col.key]: e.target.value }))
                          }
                          rows={6}
                          className="w-full bg-background/60 border border-muted-label/30 rounded-lg px-3 py-2 text-xs text-subtle font-mono focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 resize-y transition-colors"
                          placeholder="{}"
                        />
                        <JsonPreview value={formData[col.key]} />
                      </div>
                    ) : col.type === "integer" || col.type === "number" ? (
                      <input
                        id={`config-field-${col.key}`}
                        aria-label={col.label}
                        aria-required={col.required ? "true" : undefined}
                        type="number"
                        value={String(formData[col.key] ?? "")}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [col.key]: e.target.value }))
                        }
                        step={col.type === "integer" ? "1" : "0.01"}
                        className="w-full bg-background/60 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors"
                      />
                    ) : col.type === "date" ? (
                      <input
                        id={`config-field-${col.key}`}
                        aria-label={col.label}
                        aria-required={col.required ? "true" : undefined}
                        type="date"
                        value={formData[col.key] ? String(formData[col.key]).split("T")[0] : ""}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [col.key]: e.target.value }))
                        }
                        className="w-full bg-background/60 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors"
                      />
                    ) : (
                      <input
                        id={`config-field-${col.key}`}
                        aria-label={col.label}
                        aria-required={col.required ? "true" : undefined}
                        type="text"
                        value={String(formData[col.key] ?? "")}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [col.key]: e.target.value }))
                        }
                        className="w-full bg-background/60 border border-muted-label/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors"
                        placeholder={col.required ? "Required" : "Optional"}
                      />
                    )}
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-muted-label/40 shrink-0">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-muted-label hover:text-white bg-background/60 hover:bg-background/40 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-black bg-warning hover:bg-warning disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                {saving && (
                  <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                )}
                {saving ? "Saving..." : modalMode === "create" ? "Create" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Dialog ─────────────────────────────────── */}
      {deleteTarget && currentTableConfig && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="config-delete-title"
          aria-describedby="config-delete-desc"
        >
          <div className="absolute inset-0 bg-black/70" onClick={() => setDeleteTarget(null)} onKeyDown={(e) => { if (e.key === 'Escape') setDeleteTarget(null); }} role="button" tabIndex={0} aria-label="Close" />
          <div className="relative w-full max-w-md mx-4 bg-background/80 border border-muted-label/40 rounded-xl shadow-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shrink-0" aria-hidden="true">
                <IconTrash />
              </div>
              <div>
                <h3 id="config-delete-title" className="text-white font-semibold mb-1">Delete Row</h3>
                <p id="config-delete-desc" className="text-muted-label text-sm">
                  Are you sure you want to delete this record? This action cannot be undone.
                </p>
                <div className="mt-3 px-3 py-2 bg-background/60/50 rounded-lg text-xs font-mono text-muted-label">
                  {currentTableConfig.primaryKey} = {String(deleteTarget[currentTableConfig.primaryKey])}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-muted-label hover:text-white bg-background/60 hover:bg-background/40 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-danger hover:bg-danger disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                {deleting && (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── JSON Cell Component ──────────────────────────────────────────────────

function JsonCell({
  value,
  colKey,
  expanded,
  onToggle,
}: {
  value: unknown;
  colKey: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (value === null || value === undefined) {
    return <span className="text-muted-label/80">null</span>;
  }

  const str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const isShort = str.length <= 100;

  return (
    <div className="max-w-75">
      <div
        className={`text-[11px] font-mono text-muted-label bg-background/60/50 rounded px-2 py-1 ${
          expanded ? "max-h-64 overflow-y-auto" : "max-h-8 overflow-hidden"
        }`}
      >
        <pre className="whitespace-pre-wrap break-all">{expanded ? str : truncateStr(str, 100)}</pre>
      </div>
      {!isShort && (
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-[10px] text-warning/70 hover:text-warning mt-0.5"
        >
          {expanded ? <IconCollapse /> : <IconExpand />}
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}

// ─── JSON Preview Component ───────────────────────────────────────────────

function JsonPreview({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <p className="text-[10px] text-muted-label/80 mt-1">Empty JSON</p>;
  }

  let formatted = "";
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    formatted = JSON.stringify(parsed, null, 2);
  } catch {
    return (
      <p className="text-[10px] text-danger/70 mt-1">⚠ Invalid JSON</p>
    );
  }
  return (
    <div className="mt-1 px-2 py-1 bg-background/60/30 rounded text-[10px] font-mono text-muted-label max-h-24 overflow-y-auto">
      <pre className="whitespace-pre-wrap">{formatted}</pre>
    </div>
  );
}

// ─── Pagination Helper ────────────────────────────────────────────────────

function generatePageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}
