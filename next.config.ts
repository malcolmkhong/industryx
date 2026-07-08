import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Security headers
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://vercel.live; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.workers.dev https://api.simplesvg.com https://api.iconify.design https://api.unisvg.com; frame-src 'self' https://vercel.live; frame-ancestors 'none'",
          },
        ],
      },
      {
        // Cache headers for static assets
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Cache headers for images
        source: "/:path*\.(png|jpg|jpeg|gif|ico|svg|webp|avif)",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
      {
        // Cache headers for fonts
        source: "/:path*\.(woff|woff2|ttf|eot)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // API routes - shorter cache, stale-while-revalidate
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "s-maxage=60, stale-while-revalidate=30",
          },
        ],
      },
    ];
  },
  // Optimize font and image loading
  experimental: {
    optimizePackageImports: ["@radix-ui/react-icons", "lucide-react"],
    // NOTE: instrumentationHook is enabled by default in Next.js 16+.
    // See root-level instrumentation.ts (auto-discovered) which pre-warms
    // the game config cache at server startup.
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "utfs.io" }, // UploadThing if used
    ],
    // Optimize image loading
    deviceSizes: [640, 768, 1024, 1280, 1600],
    imageSizes: [16, 32, 48, 64, 96],
    path: "/_next/image",
    loader: "default",
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Add empty turbopack config to avoid warning
  turbopack: {},
};

export default nextConfig;
