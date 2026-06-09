import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ['21.0.17.206', '127.0.0.1', 'localhost', '.space-z.ai'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
