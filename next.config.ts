import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use a custom dist directory to avoid Windows file locks on .next/trace
  distDir: '.next-build',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
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
  eslint: {
    // Allow production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Disable trace output
  output: 'standalone',
  // Disable Next.js telemetry
  env: {
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_TRACE_PROFILING_DISABLED: '1',
  },
  // Webpack configuration to handle Node.js polyfills
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Disable Node.js polyfills for client-side bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        querystring: false,
        util: false,
        buffer: false,
        child_process: false,
        cluster: false,
        console: false,
        constants: false,
        dgram: false,
        dns: false,
        domain: false,
        events: false,
        http2: false,
        module: false,
        perf_hooks: false,
        process: false,
        punycode: false,
        readline: false,
        repl: false,
        string_decoder: false,
        sys: false,
        timers: false,
        tty: false,
        v8: false,
        vm: false,
        worker_threads: false,
      };
    }
    return config;
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
