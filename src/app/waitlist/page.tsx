// src/app/waitlist/page.tsx
// Public waitlist page shown when capacity is reached.
// Server component — fetches capacity status on each request.

import Link from 'next/link';
import { getCapacityStatus } from '@/lib/capacity';
import { WaitlistForm } from '@/components/waitlist/WaitlistForm';

export const dynamic = 'force-dynamic';

export default async function WaitlistPage() {
  // Task 12: surface capacity-fetch failure rather than crashing the
  // whole page. If the platform endpoint is unreachable, show a friendly
  // "check back later" message instead of an error trace.
  let cap: Awaited<ReturnType<typeof getCapacityStatus>>;
  try {
    cap = await getCapacityStatus();
  } catch (err) {
    console.error("[waitlist] getCapacityStatus failed:", err);
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
            Capacity status unavailable
          </h1>
          <p className="text-muted-label text-sm sm:text-base leading-relaxed">
            We could not check capacity right now. The waitlist form is
            temporarily unavailable — please check back in a few minutes.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
            Thank You For Visiting
          </h1>
          <p className="text-muted-label text-sm sm:text-base leading-relaxed">
            The current testing phase has reached capacity
            {cap.total && cap.max ? ` (${cap.total} / ${cap.max} players)` : ''}.
            We are expanding infrastructure and will invite new players soon.
          </p>
          {cap.waitlistCount > 0 && (
            <p className="text-xs text-muted-label/80 mt-3">
              {cap.waitlistCount} {cap.waitlistCount === 1 ? 'person is' : 'people are'} already on the waitlist.
            </p>
          )}
        </div>

        <div className="bg-card border border-muted-label/30 rounded-2xl p-6 sm:p-8 shadow-xl">
          <WaitlistForm />
        </div>

        <p className="text-center text-xs text-muted-label/70 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-brand hover:text-brand/80 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}