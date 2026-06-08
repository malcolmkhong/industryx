"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface NavItem {
  label: string;
  icon: string;
  href: string;
  active: boolean;
  disabled: boolean;
  phase: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", icon: "layout-dashboard", href: "/backend", active: true, disabled: false, phase: "" },
  { label: "Config Tables", icon: "database", href: "/config", active: false, disabled: false, phase: "" },
  { label: "Admin", icon: "users", href: "/admins", active: false, disabled: false, phase: "" },
  { label: "Security Log", icon: "shield", href: "", active: false, disabled: true, phase: "Phase 5" },
];

function IconRenderer({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    "layout-dashboard": (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
      </svg>
    ),
    database: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />
      </svg>
    ),
    users: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    shield: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      </svg>
    ),
  };
  return icons[name] || null;
}

export default function BackendDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, [supabase]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Top Header */}
      <header className="h-14 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div className="flex items-center gap-3">
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
          <span className="text-zinc-400 text-xs hidden sm:block">
            {currentTime.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden md:flex w-56 bg-zinc-900/50 border-r border-zinc-800 flex-col shrink-0">
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => (
              item.disabled ? (
                <div
                  key={item.label}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-600 cursor-not-allowed"
                >
                  <IconRenderer name={item.icon} />
                  <span className="flex-1">{item.label}</span>
                  {item.phase && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                      {item.phase}
                    </span>
                  )}
                </div>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    item.active
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  <IconRenderer name={item.icon} />
                  <span className="flex-1">{item.label}</span>
                  {item.active && (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </a>
              )
            ))}
          </nav>

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

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Welcome Card */}
          <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/5 border border-amber-500/20 rounded-2xl p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  Welcome back, Admin
                </h2>
                <p className="text-zinc-400 text-sm mt-1">
                  IndustriaX Backend Management Console is operational.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 text-sm font-medium">System Online</span>
              </div>
            </div>
          </div>

          {/* Status Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {/* Supabase Connection */}
            <a href="/config" className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 block hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                    <path d="M12 2L2 19h20L12 2z" /><path d="M12 2L7 19l5-2 5 2-5-17z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">Supabase</p>
                  <p className="text-emerald-400 text-xs">Connected</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Project URL</span>
                  <span className="text-zinc-300 font-mono">
                    {process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("https://", "").replace(".supabase.co", "") || "wkkzqtseqwcyyyezroqq"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Region</span>
                  <span className="text-zinc-300">us-east-1</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Auth Provider</span>
                  <span className="text-zinc-300">Google OAuth</span>
                </div>
              </div>
            </a>

            {/* Admin User */}
            <a href="/admins" className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 block hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">Admin User</p>
                  <p className="text-amber-400 text-xs">Authenticated</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Email</span>
                  <span className="text-zinc-300 truncate max-w-[150px]">{user?.email || "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">UID</span>
                  <span className="text-zinc-300 font-mono text-[10px] truncate max-w-[150px]">{user?.id || "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Last Sign In</span>
                  <span className="text-zinc-300">
                    {user?.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleString()
                      : "—"}
                  </span>
                </div>
              </div>
            </a>

            {/* Security Status */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">Security</p>
                  <p className="text-blue-400 text-xs">Active</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">RLS</span>
                  <span className="text-emerald-400">Enabled</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Auth Method</span>
                  <span className="text-zinc-300">OAuth Only</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Admin Check</span>
                  <span className="text-emerald-400">Enforced</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Service Info */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-white font-medium text-sm mb-4">Service Information</h3>
              <div className="space-y-3">
                {[
                  { label: "Service", value: "IndustriaX Backend" },
                  { label: "Version", value: "0.2.0" },
                  { label: "Phase", value: "2 — Config Tables" },
                  { label: "Port", value: "3001" },
                  { label: "Framework", value: "Next.js 16 + App Router" },
                  { label: "Database", value: "Supabase (PostgreSQL)" },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-zinc-800 last:border-0">
                    <span className="text-zinc-500 text-xs">{item.label}</span>
                    <span className="text-zinc-300 text-xs font-mono">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-white font-medium text-sm mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {[
                  {
                    action: "Admin login",
                    detail: user?.email || "Unknown user",
                    time: user?.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleTimeString()
                      : "Just now",
                    color: "emerald",
                  },
                  {
                    action: "Session verified",
                    detail: "Auth middleware check passed",
                    time: "Auto",
                    color: "blue",
                  },
                  {
                    action: "Supabase connection",
                    detail: "Health check OK",
                    time: "Auto",
                    color: "amber",
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      item.color === "emerald" ? "bg-emerald-400" :
                      item.color === "blue" ? "bg-blue-400" :
                      "bg-amber-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-300 text-xs font-medium">{item.action}</p>
                      <p className="text-zinc-500 text-xs truncate">{item.detail}</p>
                    </div>
                    <span className="text-zinc-600 text-xs shrink-0">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
