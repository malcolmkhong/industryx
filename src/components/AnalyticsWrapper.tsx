'use client';

// Wrapped in dynamic({ ssr: false }) — only loads after hydration.
// Vercel Analytics and Speed Insights SDK scripts never block LCP.
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

export default function AnalyticsWrapper() {
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
