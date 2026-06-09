"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  // Check for error param
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "unauthorized" && !error) {
      setError(
        "Your account is not authorized to access the IndustriaX Backend. Contact the system administrator."
      );
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/admin/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-900/3 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 20h20" />
              <path d="M5 20V8l7-5 7 5v12" />
              <path d="M9 20v-6h6v6" />
              <path d="M9 12h6" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            IndustriaX
          </h1>
          <p className="text-zinc-400 mt-2 text-sm">
            Backend Management Console
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-white">Sign In</h2>
            <p className="text-zinc-400 text-sm mt-1">
              Authenticate with your authorized Google account
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-red-400 mt-0.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <div>
                  <p className="text-red-300 text-sm font-medium">
                    Access Denied
                  </p>
                  <p className="text-red-400/80 text-xs mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed text-gray-800 font-medium rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl active:scale-[0.98]"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            <span>{loading ? "Connecting..." : "Sign in with Google"}</span>
          </button>

          {/* Security Notice */}
          <div className="mt-8 pt-6 border-t border-zinc-800">
            <div className="flex items-start gap-3">
              <svg
                className="w-4 h-4 text-amber-500 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <div>
                <p className="text-zinc-300 text-xs font-medium">
                  Authorized personnel only
                </p>
                <p className="text-zinc-500 text-xs mt-1">
                  All access is logged and monitored. Password authentication is
                  disabled for security. Only pre-approved Google accounts can
                  access this system.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 mt-4">
              <svg
                className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="text-zinc-400 text-xs font-medium">
                  Session timeout
                </p>
                <p className="text-zinc-500 text-xs mt-1">
                  Sessions expire after 1 hour of inactivity. You will be
                  automatically signed out.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-zinc-600 text-xs">
            IndustriaX Backend v0.1.0 &middot; Secure Infrastructure
          </p>
        </div>
      </div>
    </div>
  );
}
