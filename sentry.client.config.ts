import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Capture all errors, but only 10% of performance transactions.
  // The game tick loop runs at 1-10 Hz - do NOT raise tracesSampleRate
  // or you will flood Sentry with thousands of transactions per session.
  sampleRate: 1.0,
  tracesSampleRate: 0.1,

  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    'Network request failed',
    'Failed to fetch',
    'Load failed',
  ],

  initialScope: {
    tags: { app: 'industriax' },
  },
});
