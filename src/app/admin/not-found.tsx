// src/app/admin/not-found.tsx
// Admin 404 page — shown for any /admin/* route that doesn't exist.
// Uses the admin design language (subtle, technical, dark).
// See AUDIT_FIXES_2026_06_18.md P0-#5.

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Compass, Home, ArrowLeft } from 'lucide-react';

export default function AdminNotFound() {
  const router = useRouter();
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-card border border-muted-label/30">
          <Compass className="h-8 w-8 text-muted-label" aria-hidden="true" />
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-2">
          404
        </h1>
        <h2 className="text-base font-semibold text-subtle mb-2">
          Admin page not found
        </h2>
        <p className="text-sm text-muted-label leading-relaxed mb-6">
          The admin route you requested doesn&apos;t exist. It may have been removed, or the URL is incorrect.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/admin"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-research/80 hover:bg-research text-white text-sm font-medium transition-colors"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Admin Dashboard
          </Link>
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-muted-label/30 bg-card hover:bg-card/80 text-white text-sm font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
