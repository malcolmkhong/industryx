// src/app/not-found.tsx
// Root 404 page — shown when a route outside /admin doesn't exist.
// Matches the waitlist/admin/monitoring style: bg-card, brand text, subtle accents.
// See AUDIT_FIXES_2026_06_18.md P0-#5.
//
// Marked 'use client' because the shadcn <Button> and the back-button
// require onClick. Not-found pages are special in Next.js: they can be
// either server or client components; the rule is no event handlers in
// server components.

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Compass, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  const router = useRouter();
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-card border border-muted-label/30">
          <Compass className="h-10 w-10 text-muted-label" aria-hidden="true" />
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-3">
          404
        </h1>
        <h2 className="text-lg font-semibold text-subtle mb-2">
          Page not found
        </h2>
        <p className="text-sm text-muted-label leading-relaxed mb-8">
          The page you&apos;re looking for doesn&apos;t exist, or it may have been moved.
          Check the URL, or head back to your empire.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md bg-research hover:bg-research/80 text-white text-sm font-medium transition-colors"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Back to Factory
          </Link>
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md border border-muted-label/30 bg-card hover:bg-card/80 text-white text-sm font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go Back
          </button>
        </div>
      </div>
    </main>
  );
}
