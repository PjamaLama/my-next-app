import type { NextConfig } from "next";

const isWindows = process.platform === 'win32';
const isCI = Boolean(process.env.CI) || Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  // Image optimization settings for better LCP
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
    // Optimize image loading
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Enable image optimization
    unoptimized: false,
    // Improve loading performance
    minimumCacheTTL: 31536000, // 1 year
  },
  // Performance optimizations
  experimental: {
    optimizePackageImports: ['framer-motion', 'lucide-react', 'firebase', '@firebase'],
    optimizeCss: true,
    scrollRestoration: true,
    // Improve Core Web Vitals
    webVitalsAttribution: ['CLS', 'LCP'],
  },
  // Output optimization for better caching
  output: 'standalone',
  // Turbopack configuration for faster builds (replaces experimental.turbo)
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  // Disable tracing to fix EPERM errors
  generateEtags: false,
  trailingSlash: true,
  reactStrictMode: false,
  // Disable telemetry and tracing
  typescript: {
    ignoreBuildErrors: false,
  },
  // Optimize page loading
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Build optimizations enabled through other settings
  eslint: {
    // Allow production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Enable production optimizations
  productionBrowserSourceMaps: false,
  // Disable Next.js telemetry
  env: {
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_TRACE_PROFILING_DISABLED: '1',
  },
  // Webpack configuration to handle Node.js polyfills and exclude functions
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
    
    // Exclude functions directory from webpack compilation
    config.resolve.alias = {
      ...config.resolve.alias,
      'functions': false
    };
    
    return config;
  },
  // Enable service worker support
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()'
          }
        ],
      },
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
      {
        source: '/_next/static/css/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
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
