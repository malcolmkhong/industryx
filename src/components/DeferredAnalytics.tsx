'use client';

import dynamic from 'next/dynamic';

const DeferredAnalytics = dynamic(() => import('./AnalyticsWrapper'), {
  ssr: false,
});

export default function DeferredAnalyticsClient() {
  return <DeferredAnalytics />;
}
