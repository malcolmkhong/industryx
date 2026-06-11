import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["21.0.17.206", "127.0.0.1", "localhost", ".space-z.ai"],
  images: {
    unoptimized: true,
  },
};

// Only apply Sentry plugin when all required env vars are set.
// If any are missing, the Sentry build plugin throws and fails the entire Vercel build.
// This defensive guard lets the build complete when Sentry is not yet configured
// in the Vercel project environment variables.
const sentryEnabled = Boolean(
  process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT &&
    process.env.SENTRY_AUTH_TOKEN
);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,

      // Suppress build output noise
      silent: true,

      // Upload larger set of source maps for better stack traces
      widenClientFileUpload: true,

      // Don't expose source maps in the browser bundle
      hideSourceMaps: true,

      // Remove Sentry debug logging via treeshake (replaces deprecated disableLogger)
      webpack: {
        treeshake: {
          removeDebugLogging: true,
        },
      },
    })
  : nextConfig;
