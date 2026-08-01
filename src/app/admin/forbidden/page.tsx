"use client";

/**
 * /admin/forbidden — shown when proxy.ts redirects an authenticated-but-not-
 * admin user to a forbidden state. The proxy redirects to /admin/login?error=unauthorized,
 * but a dedicated forbidden surface gives admins a clearer landing page.
 *
 * Client component so we can use next/link and a back-button. Same chrome as
 * /admin/login so users recognize it as part of the admin surface.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';

export default function ForbiddenPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        <div className="bg-background/80 backdrop-blur-xl border border-muted-label/40 rounded-2xl p-8 shadow-2xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-2xl bg-danger/10 border border-danger/30">
            <ShieldAlert className="w-8 h-8 text-danger" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
            Access denied
          </h1>
          <p className="text-muted-label text-sm leading-relaxed mb-6">
            Your account is signed in but does not have administrator
            privileges. If you believe this is wrong, contact the system
            administrator.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/admin/login"
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-research hover:bg-research/80 text-white text-sm font-medium transition-colors"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Sign in with another account
            </Link>
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-muted-label/30 bg-card hover:bg-card/80 text-white text-sm font-medium transition-colors"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Go back
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-muted-label/80 mt-6">
          IndustriaX Backend v0.1.0
        </p>
      </div>
    </div>
  );
}