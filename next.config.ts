import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ["lh3.googleusercontent.com"],
  },
  // PWA and mobile optimizations
  experimental: {
    optimizePackageImports: ['framer-motion'],
  },
  // Disable tracing to fix EPERM errors
  generateEtags: false,
  trailingSlash: true,
  reactStrictMode: false,
  // Disable telemetry and tracing
  typescript: {
    ignoreBuildErrors: false,
  },
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Disable trace output
  output: 'standalone',
  // Disable Next.js telemetry
  env: {
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_TRACE_PROFILING_DISABLED: '1',
  },
  // Enable service worker support
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
    ];
  },
  // Mobile performance optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // Enable compression and optimization
  compress: true,
  poweredByHeader: false,
  /* config options here */
};

export default nextConfig;
