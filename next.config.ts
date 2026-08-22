import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Keep Next's file tracing scoped to this app. Without this, Next sees
  // the parent /Users/wojciechplonka/package-lock.json and guesses the
  // workspace root incorrectly during dev/build.
  outputFileTracingRoot: path.resolve(process.cwd()),
  // Remove X-Powered-By header
  poweredByHeader: false,
  // Catch React issues early
  reactStrictMode: true,
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
      {
        // GoCardless serves bank institution logos from this CDN; the
        // connect-bank-sheet uses them in the institutions list.
        protocol: 'https',
        hostname: 'cdn.gocardless.com',
      },
    ],
  },
  // Enable compression
  compress: true,
  // Reduce bundle size
  experimental: {
    // Tree-shake icon and component libraries — removes unused named exports from the bundle.
    // Round 3 (A1): added 6 missing Radix packages that grep'd up across components/ui +
    // sonner + @hookform/resolvers. Each Radix package re-exports many primitives; without
    // optimizePackageImports the whole barrel lands in the route bundle even if only one is
    // imported.
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'framer-motion',
      'recharts',
      'date-fns',
      'react-day-picker',
      'react-hook-form',
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
      '@radix-ui/react-popover',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-accordion',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      'sonner',
      '@hookform/resolvers',
    ],
    // Optimize CSS output
    optimizeCss: true,
  },
  // Cache static assets aggressively + security headers
  async headers() {
    // SECURITY: scope `unsafe-eval` to dev only — Next dev tooling (HMR, source maps,
    // React refresh) needs it; production runtime should not. `unsafe-inline` is still
    // required for Next inline runtime + Tailwind/shadcn bootstrap until we adopt nonces.
    const isDev = process.env.NODE_ENV !== 'production'
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'"
    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            // X-XSS-Protection is deprecated and can be harmful on legacy
            // browsers; modern browsers ignore it. Setting `0` explicitly
            // disables the broken auditor (recommended by OWASP / Mozilla).
            key: 'X-XSS-Protection',
            value: '0',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            // Tightened: explicitly deny features Solvio doesn't use to
            // shrink the attack surface for any embedded third-party scripts.
            key: 'Permissions-Policy',
            value: [
              'camera=()',
              'microphone=()',
              'geolocation=(self)',  // /shopping/optimize uses location for nearby store hints
              'payment=()',
              'usb=()',
              'accelerometer=()',
              'gyroscope=()',
              'magnetometer=()',
              'autoplay=()',
              'fullscreen=(self)',
              'picture-in-picture=()',
              'midi=()',
              'sync-xhr=()',
              'interest-cohort=()',
            ].join(', '),
          },
          {
            // Cross-Origin policies — keep responses isolated from cross-origin readers.
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            // CSP: allow self + Vercel Blob CDN for images, OpenAI + Azure for API calls
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://cdn.gocardless.com",
              "font-src 'self'",
              "connect-src 'self' https://api.openai.com https://*.cognitiveservices.azure.com https://api.frankfurter.app https://*.inteligo.com.pl https://*.pkobp.pl",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
      {
        source: '/:path*.ico',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000, immutable' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  // Enforce TypeScript checks during build
  typescript: {
    ignoreBuildErrors: false,
  },
  // Enforce ESLint checks during build
  eslint: {
    ignoreDuringBuilds: false,
  },
  // To naprawia błędy z Mindee SDK (canvas, pdf-parse, sharp)
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        canvas: "commonjs canvas",
        "pdf-parse": "commonjs pdf-parse",
        sharp: "commonjs sharp",
      });
    }
    return config;
  },
};

export default nextConfig;
