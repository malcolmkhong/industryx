"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

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

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
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

// ─── Helpers ──────────────────────────────────────────────────────────────

function truncateUid(uid: string, max = 8): string {
  if (uid.length <= max * 2 + 3) return uid;
  return uid.slice(0, max) + "..." + uid.slice(-4);
}

function getRoleBadgeClasses(role: string): string {
  switch (role) {
    case "super_admin":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "viewer":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
    default:
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
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
      return "bg-purple-500/15 text-purple-400 border-purple-500/20";
    case "env+db":
      return "bg-sky-500/15 text-sky-400 border-sky-500/20";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  }
}

// ─── Component ────────────────────────────────────────────────────────────

export default function AdminManagementPage() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    window.location.href = "/login";
  };

  // ─── Toast system ───────────────────────────────────────────────────────

  const addToast = useCallback((type: ToastMessage["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // ─── Fetch admins ───────────────────────────────────────────────────────

  const fetchAdmins = useCallback(async () => {
    try {
      setDataLoading(true);
      const res = await fetch("/api/admins");
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to fetch admins");
      }
      const data = await res.json();
      setAdmins(data.data || []);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to load admins");
    } finally {
      setDataLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchAdmins();
    }
  }, [authLoading, user, fetchAdmins]);

  // ─── Add admin ──────────────────────────────────────────────────────────

  const handleAddAdmin = async () => {
    // Validate
    if (!formUserId.trim()) {
      addToast("error", "User UUID is required");
      return;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(formUserId.trim())) {
      addToast("error", "Invalid UUID format");
      return;
    }
    if (!formEmail.trim()) {
      addToast("error", "Email is required");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formEmail.trim())) {
      addToast("error", "Invalid email format");
      return;
    }

    try {
      setAdding(true);
      const res = await fetch("/api/admins", {
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
      addToast("success", "Admin added successfully");
      setShowAddModal(false);
      setFormUserId("");
      setFormEmail("");
      setFormRole("admin");
      fetchAdmins();
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to add admin");
    } finally {
      setAdding(false);
    }
  };

  // ─── Remove admin ───────────────────────────────────────────────────────

  const handleRemoveAdmin = async () => {
    if (!removeTarget || !removeTarget.id) return;

    try {
      setRemoving(true);
      const res = await fetch(`/api/admins/${removeTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Failed to remove admin");
      }
      addToast("success", "Admin removed successfully");
      setRemoveTarget(null);
      fetchAdmins();
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to remove admin");
    } finally {
      setRemoving(false);
    }
  };

  // ─── Copy to clipboard ─────────────────────────────────────────────────

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      addToast("info", "Copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      addToast("error", "Failed to copy");
    }
  };

  // ─── Computed stats ─────────────────────────────────────────────────────

  const totalAdmins = admins.length;
  const superAdminCount = admins.filter((a) => a.role === "super_admin").length;
  const envAdminUids = (typeof window !== "undefined" ? "" : "").split(",").filter(Boolean);
  // We check current user against ADMIN_UIDS on the server side
  const isCurrentUser = (admin: AdminUser) => user?.id === admin.userId;
  const isEnvAdmin = (admin: AdminUser) => admin.source === "env" || admin.source === "env+db";

  // ─── Auth loading ───────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading admin page...</p>
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
          {/* Nav items */}
          <nav className="p-3 space-y-1 border-b border-zinc-800">
            <a
              href="/backend"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            >
              <IconDashboard />
              <span>Dashboard</span>
            </a>
            <a
              href="/config"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            >
              <IconDatabase />
              <span>Config Tables</span>
            </a>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <IconUsers />
              <span className="flex-1">Admin</span>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-600 cursor-not-allowed">
              <IconShield />
              <span className="flex-1">Security Log</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">Phase 5</span>
            </div>
          </nav>

          {/* Admin info */}
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

          {/* Phase indicator */}
          <div className="p-3 border-t border-zinc-800">
            <div className="p-3 bg-zinc-800/50 rounded-lg">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Phase</p>
              <p className="text-xs text-amber-400 font-medium">Phase 2 — Config Tables</p>
              <div className="mt-2 w-full bg-zinc-700 rounded-full h-1.5">
                <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: "60%" }} />
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
                <h2 className="text-white text-xl font-bold">Admin Users</h2>
                <p className="text-zinc-500 text-sm mt-1">
                  Manage admin access and roles for the IndustriaX Backend
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-medium text-sm rounded-lg transition-colors shrink-0"
              >
                <IconPlus />
                Add Admin
              </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Total Admins</p>
                    <p className="text-white text-2xl font-bold">{totalAdmins}</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Active Sessions</p>
                    <p className="text-white text-2xl font-bold">1</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-400">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Super Admins</p>
                    <p className="text-white text-2xl font-bold">{superAdminCount}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Users Table */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
              {dataLoading ? (
                <div className="p-8 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-14 bg-zinc-800/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : admins.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-3xl mb-3">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600 mx-auto">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <p className="text-zinc-400 text-sm mb-2">No admin users found</p>
                  <p className="text-zinc-600 text-xs">Add an admin user to get started.</p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 text-sm rounded-lg hover:bg-amber-500/20 transition-colors border border-amber-500/20"
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
                        <tr className="border-b border-zinc-800">
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">User</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">User ID</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Role</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Source</th>
                          <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">Added</th>
                          <th className="px-4 py-3 text-right text-xs text-zinc-500 font-medium">Actions</th>
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
                              className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                            >
                              {/* Avatar + Email */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-sm font-medium shrink-0">
                                    {(admin.email || "U")[0].toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-white text-sm truncate max-w-[200px]">
                                        {admin.email || "No email"}
                                      </span>
                                      {isMe && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">
                                          You
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              {/* User ID */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <code className="text-zinc-400 text-xs font-mono">
                                    {truncateUid(admin.userId)}
                                  </code>
                                  <button
                                    onClick={() => copyToClipboard(admin.userId)}
                                    className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5 rounded"
                                    title="Copy full ID"
                                  >
                                    {copiedId === admin.userId ? (
                                      <span className="text-emerald-400"><IconCheck /></span>
                                    ) : (
                                      <IconCopy />
                                    )}
                                  </button>
                                </div>
                              </td>
                              {/* Role */}
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getRoleBadgeClasses(admin.role)}`}>
                                  {getRoleLabel(admin.role)}
                                </span>
                              </td>
                              {/* Source */}
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getSourceBadgeClasses(admin.source)}`}>
                                  {admin.source === "env" ? "ENV" : admin.source === "env+db" ? "ENV+DB" : "Database"}
                                </span>
                              </td>
                              {/* Added date */}
                              <td className="px-4 py-3">
                                <span className="text-zinc-500 text-xs">
                                  {admin.createdAt
                                    ? new Date(admin.createdAt).toLocaleDateString()
                                    : "—"}
                                </span>
                              </td>
                              {/* Actions */}
                              <td className="px-4 py-3 text-right">
                                {canRemove ? (
                                  <button
                                    onClick={() => setRemoveTarget(admin)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors border border-red-500/20"
                                  >
                                    <IconTrash />
                                    Remove
                                  </button>
                                ) : isMe ? (
                                  <span className="text-zinc-600 text-xs">Current user</span>
                                ) : isEnv ? (
                                  <span className="text-zinc-600 text-xs">ENV-defined</span>
                                ) : (
                                  <span className="text-zinc-600 text-xs">Protected</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-zinc-800/50">
                    {admins.map((admin) => {
                      const isMe = isCurrentUser(admin);
                      const isEnv = isEnvAdmin(admin);
                      const canRemove = !isMe && admin.id !== null && !isEnv;

                      return (
                        <div key={admin.userId} className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-sm font-medium shrink-0">
                              {(admin.email || "U")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white text-sm font-medium truncate">
                                  {admin.email || "No email"}
                                </span>
                                {isMe && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">
                                    You
                                  </span>
                                )}
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getRoleBadgeClasses(admin.role)}`}>
                                  {getRoleLabel(admin.role)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1.5">
                                <code className="text-zinc-500 text-[10px] font-mono truncate">
                                  {truncateUid(admin.userId, 6)}
                                </code>
                                <button
                                  onClick={() => copyToClipboard(admin.userId)}
                                  className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5"
                                >
                                  {copiedId === admin.userId ? (
                                    <span className="text-emerald-400"><IconCheck /></span>
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
                                  <span className="text-zinc-600 text-[10px]">
                                    Added {new Date(admin.createdAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              {canRemove && (
                                <button
                                  onClick={() => setRemoveTarget(admin)}
                                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors border border-red-500/20"
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
          </div>
        </main>
      </div>

      {/* ─── Add Admin Modal ──────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-white font-semibold">Add Admin User</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setFormUserId("");
                  setFormEmail("");
                  setFormRole("admin");
                }}
                className="text-zinc-400 hover:text-white transition-colors p-1"
              >
                <IconX />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-4">
              {/* User UUID */}
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">
                  User UUID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors font-mono"
                />
                <p className="text-zinc-600 text-[10px] mt-1">
                  The Supabase Auth user ID (UUID format)
                </p>
              </div>

              {/* Email */}
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">
                  Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                >
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <div className="flex gap-3 mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-zinc-500 text-[10px]">Admin — Full access</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-zinc-500 text-[10px]">Super — Can manage admins</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-400" />
                    <span className="text-zinc-500 text-[10px]">Viewer — Read only</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-800">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setFormUserId("");
                  setFormEmail("");
                  setFormRole("admin");
                }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAdmin}
                disabled={adding}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-black font-medium text-sm rounded-lg transition-colors"
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
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">Remove Admin</h3>
              <p className="text-zinc-400 text-sm mb-1">
                Are you sure you want to remove this admin?
              </p>
              <p className="text-zinc-500 text-xs">
                {removeTarget.email || removeTarget.userId}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 px-6 pb-6">
              <button
                onClick={() => setRemoveTarget(null)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors border border-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveAdmin}
                disabled={removing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-400 disabled:bg-red-500/50 text-white font-medium text-sm rounded-lg transition-colors"
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

      {/* ─── Toast notifications ───────────────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-right ${
              toast.type === "success"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
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
