"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string | null;
  userId: string;
  email: string | null;
  role: string;
  addedBy: string | null;
  createdAt: string | null;
  source: "env" | "db" | "env+db";
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function truncateUid(uid: string, max = 8): string {
  if (uid.length <= max * 2 + 3) return uid;
  return uid.slice(0, max) + "..." + uid.slice(-4);
}

function getRoleBadgeClasses(role: string): string {
  switch (role) {
    case "super_admin":
      return "bg-warning/15 text-warning border-warning/20";
    case "viewer":
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
    default:
      return "bg-success/15 text-success border-success/20";
  }
}

function getRoleLabel(role: string): string {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "viewer":
      return "Viewer";
    default:
      return "Admin";
  }
}

function getSourceBadgeClasses(source: string): string {
  switch (source) {
    case "env":
      return "bg-research/15 text-research border-research/20";
    case "env+db":
      return "bg-brand/15 text-brand border-brand/20";
    default:
      return "bg-background/20/15 text-muted-label border-muted-label/10/20";
  }
}

// ─── Inline SVG helpers (used in core content) ────────────────────────────

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5v14" />
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

function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
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

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export default function AdminManagementPage() {
  // Data state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Add admin modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [formUserId, setFormUserId] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState("admin");
  const [adding, setAdding] = useState(false);

  // Remove confirmation
  const [removeTarget, setRemoveTarget] = useState<AdminUser | null>(null);
  const [removing, setRemoving] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ─── Error display ──────────────────────────────────────────────────────

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // ─── Fetch admins ───────────────────────────────────────────────────────

  const fetchAdmins = useCallback(async () => {
    try {
      setDataLoading(true);
      const res = await fetch("/api/admin/admins");
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to fetch admins");
      }
      const data = await res.json();
      setAdmins(data.data || []);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load admins");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  // ─── Add admin ──────────────────────────────────────────────────────────

  const handleAddAdmin = async () => {
    if (!formUserId.trim()) {
      showError("User UUID is required");
      return;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(formUserId.trim())) {
      showError("Invalid UUID format");
      return;
    }
    if (!formEmail.trim()) {
      showError("Email is required");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formEmail.trim())) {
      showError("Invalid email format");
      return;
    }

    try {
      setAdding(true);
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: formUserId.trim(),
          email: formEmail.trim(),
          role: formRole,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to add admin");
      }
      showSuccess("Admin added successfully");
      setShowAddModal(false);
      setFormUserId("");
      setFormEmail("");
      setFormRole("admin");
      fetchAdmins();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to add admin");
    } finally {
      setAdding(false);
    }
  };

  // ─── Remove admin ───────────────────────────────────────────────────────

  const handleRemoveAdmin = async () => {
    if (!removeTarget || !removeTarget.id) return;

    try {
      setRemoving(true);
      const res = await fetch(`/api/admin/admins/${removeTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to remove admin");
      }
      showSuccess("Admin removed successfully");
      setRemoveTarget(null);
      fetchAdmins();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to remove admin");
    } finally {
      setRemoving(false);
    }
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

  // ─── Computed stats ─────────────────────────────────────────────────────

  const totalAdmins = admins.length;
  const superAdminCount = admins.filter((a) => a.role === "super_admin").length;
  const isCurrentUser = (admin: AdminUser) => admin.userId === admins.find((a) => a.email)?.userId;
  const isEnvAdmin = (admin: AdminUser) => admin.source === "env" || admin.source === "env+db";

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-white text-xl font-bold">Admin Users</h2>
          <p className="text-muted-label text-sm mt-1">
            Manage admin access and roles for the IndustriaX Backend
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-warning hover:bg-warning text-black font-medium text-sm rounded-lg transition-colors shrink-0"
        >
          <IconPlus />
          Add Admin
        </button>
      </div>

      {/* Inline notifications */}
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-warning">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Total Admins</p>
              <p className="text-white text-2xl font-bold">{totalAdmins}</p>
            </div>
          </div>
        </div>

        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Active Sessions</p>
              <p className="text-white text-2xl font-bold">1</p>
            </div>
          </div>
        </div>

        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-domain/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-domain">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-muted-label text-xs">Super Admins</p>
              <p className="text-white text-2xl font-bold">{superAdminCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Users Table */}
      <div className="bg-background/80/60 border border-muted-label/40 rounded-xl overflow-hidden">
        {dataLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-background/60/50 rounded animate-pulse" />
            ))}
          </div>
        ) : admins.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-3xl mb-3">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-label/80 mx-auto">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="text-muted-label text-sm mb-2">No admin users found</p>
            <p className="text-muted-label/80 text-xs">Add an admin user to get started.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-warning/10 text-warning text-sm rounded-lg hover:bg-warning/20 transition-colors border border-warning/20"
            >
              <IconPlus />
              Add Admin
            </button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted-label/40">
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">User</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">User ID</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Role</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Source</th>
                    <th className="px-4 py-3 text-left text-xs text-muted-label font-medium">Added</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-label font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => {
                    const isMe = isCurrentUser(admin);
                    const isEnv = isEnvAdmin(admin);
                    const canRemove = !isMe && admin.id !== null && !isEnv;

                    return (
                      <tr
                        key={admin.userId}
                        className="border-b border-muted-label/40/50 hover:bg-background/60/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-background/40 flex items-center justify-center text-subtle text-sm font-medium shrink-0">
                              {(admin.email || "U")[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-white text-sm truncate max-w-[200px]">
                                  {admin.email || "No email"}
                                </span>
                                {isMe && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-warning/15 text-warning border border-warning/20 font-medium">
                                    You
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="text-muted-label text-xs font-mono">
                              {truncateUid(admin.userId)}
                            </code>
                            <button
                              onClick={() => copyToClipboard(admin.userId)}
                              className="text-muted-label/80 hover:text-subtle transition-colors p-0.5 rounded"
                              title="Copy full ID"
                            >
                              {copiedId === admin.userId ? (
                                <span className="text-success"><IconCheck /></span>
                              ) : (
                                <IconCopy />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getRoleBadgeClasses(admin.role)}`}>
                            {getRoleLabel(admin.role)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getSourceBadgeClasses(admin.source)}`}>
                            {admin.source === "env" ? "ENV" : admin.source === "env+db" ? "ENV+DB" : "Database"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-muted-label text-xs">
                            {admin.createdAt
                              ? new Date(admin.createdAt).toLocaleDateString()
                              : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canRemove ? (
                            <button
                              onClick={() => setRemoveTarget(admin)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-danger hover:text-danger hover:bg-danger/10 transition-colors border border-danger/20"
                            >
                              <IconTrash />
                              Remove
                            </button>
                          ) : isMe ? (
                            <span className="text-muted-label/80 text-xs">Current user</span>
                          ) : isEnv ? (
                            <span className="text-muted-label/80 text-xs">ENV-defined</span>
                          ) : (
                            <span className="text-muted-label/80 text-xs">Protected</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-background/60/50">
              {admins.map((admin) => {
                const isMe = isCurrentUser(admin);
                const isEnv = isEnvAdmin(admin);
                const canRemove = !isMe && admin.id !== null && !isEnv;

                return (
                  <div key={admin.userId} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-background/40 flex items-center justify-center text-subtle text-sm font-medium shrink-0">
                        {(admin.email || "U")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white text-sm font-medium truncate">
                            {admin.email || "No email"}
                          </span>
                          {isMe && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-warning/15 text-warning border border-warning/20 font-medium">
                              You
                            </span>
                          )}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getRoleBadgeClasses(admin.role)}`}>
                            {getRoleLabel(admin.role)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <code className="text-muted-label text-[10px] font-mono truncate">
                            {truncateUid(admin.userId, 6)}
                          </code>
                          <button
                            onClick={() => copyToClipboard(admin.userId)}
                            className="text-muted-label/80 hover:text-subtle transition-colors p-0.5"
                          >
                            {copiedId === admin.userId ? (
                              <span className="text-success"><IconCheck /></span>
                            ) : (
                              <IconCopy />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getSourceBadgeClasses(admin.source)}`}>
                            {admin.source === "env" ? "ENV" : admin.source === "env+db" ? "ENV+DB" : "Database"}
                          </span>
                          {admin.createdAt && (
                            <span className="text-muted-label/80 text-[10px]">
                              Added {new Date(admin.createdAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {canRemove && (
                          <button
                            onClick={() => setRemoveTarget(admin)}
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-danger hover:text-danger hover:bg-danger/10 transition-colors border border-danger/20"
                          >
                            <IconTrash />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ─── Add Admin Modal ──────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-background/80 border border-muted-label/40 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-muted-label/40">
              <h3 className="text-white font-semibold">Add Admin User</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setFormUserId("");
                  setFormEmail("");
                  setFormRole("admin");
                }}
                className="text-muted-label hover:text-white transition-colors p-1"
              >
                <IconX />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-muted-label text-xs font-medium mb-1.5">
                  User UUID <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-muted-label/80 focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors font-mono"
                />
                <p className="text-muted-label/80 text-[10px] mt-1">
                  The Supabase Auth user ID (UUID format)
                </p>
              </div>

              <div>
                <label className="block text-muted-label text-xs font-medium mb-1.5">
                  Email <span className="text-danger">*</span>
                </label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-muted-label/80 focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors"
                />
              </div>

              <div>
                <label className="block text-muted-label text-xs font-medium mb-1.5">
                  Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                >
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <div className="flex gap-3 mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-muted-label text-[10px]">Admin — Full access</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-warning" />
                    <span className="text-muted-label text-[10px]">Super — Can manage admins</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-background/10" />
                    <span className="text-muted-label text-[10px]">Viewer — Read only</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-muted-label/40">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setFormUserId("");
                  setFormEmail("");
                  setFormRole("admin");
                }}
                className="px-4 py-2 text-sm text-muted-label hover:text-white hover:bg-background/60 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAdmin}
                disabled={adding}
                className="inline-flex items-center gap-2 px-4 py-2 bg-warning hover:bg-warning disabled:bg-warning/50 text-black font-medium text-sm rounded-lg transition-colors"
              >
                {adding ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-transparent rounded-full animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <IconPlus />
                    Add Admin
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Remove Confirmation Modal ────────────────────────────────────── */}
      {removeTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-background/80 border border-muted-label/40 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">Remove Admin</h3>
              <p className="text-muted-label text-sm mb-1">
                Are you sure you want to remove this admin?
              </p>
              <p className="text-muted-label text-xs">
                {removeTarget.email || removeTarget.userId}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 px-6 pb-6">
              <button
                onClick={() => setRemoveTarget(null)}
                className="px-4 py-2 text-sm text-muted-label hover:text-white hover:bg-background/60 rounded-lg transition-colors border border-muted-label/30"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveAdmin}
                disabled={removing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-danger hover:bg-danger disabled:bg-danger/50 text-white font-medium text-sm rounded-lg transition-colors"
              >
                {removing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <IconTrash />
                    Remove
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
