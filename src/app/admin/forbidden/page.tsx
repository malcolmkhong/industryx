"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { Lock, Ban, User, LogIn, ArrowLeft, Info } from "lucide-react";

export default function ForbiddenPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setEmail(user.email);
      }
    });
  }, []);

  const handleSignOut = async () => {
    setLoading(true);
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    window.location.href = "/admin/login";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-danger/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-warning/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-danger/20/3 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-6 rounded-2xl bg-linear-to-br from-danger to-danger/80 shadow-lg shadow-danger/20">
            <Lock size={40} color="white" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Access Denied
          </h1>
          <p className="text-muted-label mt-2 text-sm">
            You are not authorized to access the IndustriaX Backend
          </p>
        </div>

        {/* Forbidden Card */}
        <div className="bg-background/80/80 backdrop-blur-xl border border-muted-label/40 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-xl bg-danger/10">
              <Ban className="w-6 h-6 text-danger" />
            </div>
            <h2 className="text-xl font-semibold text-white">Restricted Area</h2>
            <p className="text-muted-label text-sm mt-2">
              Your Google account is signed in but does not have admin
              privileges. If you believe this is an error, contact the system
              administrator.
            </p>
          </div>

          {/* Account info */}
          {email && (
            <div className="mb-6 p-4 bg-background/60/50 border border-muted-label/30 rounded-xl">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-muted-label shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-muted-label text-xs">Signed in as</p>
                  <p className="text-subtle text-sm font-medium truncate">
                    {email}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-background/60 hover:bg-background/40 disabled:bg-background/60/50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-200 border border-muted-label/30 active:scale-[0.98]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-muted-label/10 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              <span>{loading ? "Signing out..." : "Sign out & try again"}</span>
            </button>

            <Link
              href="/"
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-transparent hover:bg-background/60/50 text-muted-label hover:text-subtle font-medium rounded-xl transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to game</span>
            </Link>
          </div>

          {/* Info notice */}
          <div className="mt-8 pt-6 border-t border-muted-label/40">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-muted-label mt-0.5 shrink-0" />
              <div>
                <p className="text-subtle text-xs font-medium">
                  Why am I seeing this?
                </p>
                <p className="text-muted-label text-xs mt-1">
                  Admin access is granted only to pre-approved accounts. Your
                  sign-in attempt was successful, but this account is not on the
                  admin allowlist. This incident has been logged.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-muted-label/80 text-xs">
            IndustriaX Backend v0.1.0 &middot; Secure Infrastructure
          </p>
        </div>
      </div>
    </div>
  );
}
