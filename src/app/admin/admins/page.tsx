"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, X, Copy, Trash2, Check, Users, ShieldCheck, Shield } from "lucide-react";

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
      const res = await fetch("/api/admin/users/admins");
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
      const res = await fetch("/api/admin/users/admins", {
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
      const res = await fetch(`/api/admin/users/admins/${removeTarget.id}`, {
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
          type="button"
          onClick={() => setShowAddModal(true)}
          aria-label="Open add admin dialog"
          className="inline-flex items-center gap-2 px-4 py-2 bg-warning hover:bg-warning text-black font-medium text-sm rounded-lg transition-colors shrink-0"
        >
          <Plus aria-hidden="true" size={16} />
          Add Admin
        </button>
      </div>

      {/* Inline notifications */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/15 text-danger border border-danger/20 text-sm font-medium"
        >
          {error}
        </div>
      )}
      {successMsg && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-success/15 text-success border border-success/20 text-sm font-medium"
        >
          <Check size={14} />
          {successMsg}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-background/80/80 border border-muted-label/40 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center">
              <Users size={18} className="text-warning" />
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
              <Shield size={18} className="text-success" />
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
              <ShieldCheck size={18} className="text-domain" />
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
              <Users size={48} strokeWidth={1.5} className="text-muted-label/80 mx-auto" />
            </div>
            <p className="text-muted-label text-sm mb-2">No admin users found</p>
            <p className="text-muted-label/80 text-xs">Add an admin user to get started.</p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              aria-label="Open add admin dialog"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-warning/10 text-warning text-sm rounded-lg hover:bg-warning/20 transition-colors border border-warning/20"
            >
              <Plus aria-hidden="true" size={16} />
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
                    <th scope="col" className="px-4 py-3 text-left text-xs text-muted-label font-medium">User</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-muted-label font-medium">User ID</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-muted-label font-medium">Role</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-muted-label font-medium">Source</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-muted-label font-medium">Added</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs text-muted-label font-medium">Actions</th>
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
                        {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- <td> is a table cell, not a control */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-background/40 flex items-center justify-center text-subtle text-sm font-medium shrink-0">
                              {(admin.email || "U")[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-white text-sm truncate max-w-50">
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
                              type="button"
                              onClick={() => copyToClipboard(admin.userId)}
                              className="text-muted-label/80 hover:text-subtle transition-colors p-0.5 rounded"
                              aria-label={`Copy full user ID for ${admin.email ?? "this admin"}`}
                              title="Copy full ID"
                            >
                              {copiedId === admin.userId ? (
                                <span className="text-success" aria-label="Copied"><Check size={14} /></span>
                              ) : (
                                <Copy aria-hidden="true" size={14} />
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
                              type="button"
                              onClick={() => setRemoveTarget(admin)}
                              aria-label={`Remove admin ${admin.email ?? admin.userId}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-danger hover:text-danger hover:bg-danger/10 transition-colors border border-danger/20"
                            >
                              <Trash2 aria-hidden="true" size={14} />
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
                            type="button"
                            onClick={() => copyToClipboard(admin.userId)}
                            className="text-muted-label/80 hover:text-subtle transition-colors p-0.5"
                            aria-label={`Copy full user ID for ${admin.email ?? "this admin"}`}
                          >
                            {copiedId === admin.userId ? (
                              <span className="text-success" aria-label="Copied"><Check size={14} /></span>
                            ) : (
                              <Copy aria-hidden="true" size={14} />
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
                            type="button"
                            onClick={() => setRemoveTarget(admin)}
                            aria-label={`Remove admin ${admin.email ?? admin.userId}`}
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-danger hover:text-danger hover:bg-danger/10 transition-colors border border-danger/20"
                          >
                            <Trash2 aria-hidden="true" size={14} />
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
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-admin-title"
        >
          <div className="bg-background/80 border border-muted-label/40 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-muted-label/40">
              <h3 id="add-admin-title" className="text-white font-semibold">Add Admin User</h3>
              {/* id matches aria-labelledby on the modal wrapper below */}
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setFormUserId("");
                  setFormEmail("");
                  setFormRole("admin");
                }}
                aria-label="Close add admin dialog"
                className="text-muted-label hover:text-white transition-colors p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="add-admin-userid" className="block text-muted-label text-xs font-medium mb-1.5">
                  User UUID <span className="text-danger" aria-hidden="true">*</span>
                </label>
                {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
                <input
                  id="add-admin-userid"
                  name="userId"
                  type="text"
                  required
                  autoComplete="off"
                  inputMode="text"
                  aria-required="true"
                  aria-describedby="add-admin-userid-hint"
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-muted-label/80 focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors font-mono"
                />
                <p id="add-admin-userid-hint" className="text-muted-label/80 text-[10px] mt-1">
                  The Supabase Auth user ID (UUID format)
                </p>
              </div>

              <div>
                <label htmlFor="add-admin-email" className="block text-muted-label text-xs font-medium mb-1.5">
                  Email <span className="text-danger" aria-hidden="true">*</span>
                </label>
                {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
                <input
                  id="add-admin-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  aria-required="true"
                  placeholder="user@example.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-muted-label/80 focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="add-admin-role" className="block text-muted-label text-xs font-medium mb-1.5">
                  Role
                </label>
                <select
                  id="add-admin-role"
                  name="role"
                  aria-describedby="add-admin-role-hint"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full bg-background/60/80 border border-muted-label/30 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-warning/50 focus:ring-1 focus:ring-warning/60/20 transition-colors appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                >
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <div id="add-admin-role-hint" className="flex gap-3 mt-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-success" aria-hidden="true" />
                    <span className="text-muted-label text-[10px]">Admin — Full access</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-warning" aria-hidden="true" />
                    <span className="text-muted-label text-[10px]">Super — Can manage admins</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-muted-label/40" aria-hidden="true" />
                    <span className="text-muted-label text-[10px]">Viewer — Read only</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-muted-label/40">
              <button
                type="button"
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
                type="button"
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
                    <Plus size={16} />
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
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="remove-admin-title"
          aria-describedby="remove-admin-desc"
        >
          <div className="bg-background/80 border border-muted-label/40 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-4" aria-hidden="true">
                <Trash2 size={24} className="text-danger" />
              </div>
              <h3 id="remove-admin-title" className="text-white font-semibold text-lg mb-2">Remove Admin</h3>
              <p id="remove-admin-desc" className="text-muted-label text-sm mb-1">
                Are you sure you want to remove this admin?
              </p>
              <p className="text-muted-label text-xs" aria-hidden="true">
                {removeTarget.email || removeTarget.userId}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 px-6 pb-6">
              <button
                type="button"
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
                    <Trash2 size={14} />
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
