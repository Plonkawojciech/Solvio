import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ],
  },
  // Enable compression
  compress: true,
  // Reduce bundle size
  experimental: {
    // Tree-shake icon and component libraries — removes unused named exports from the bundle
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
    ],
    // Optimize CSS output
    optimizeCss: true,
  },
  // Cache static assets aggressively + security headers
  async headers() {
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
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed by Next.js dev; unsafe-inline needed by shadcn/Tailwind
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
              "font-src 'self'",
              "connect-src 'self' https://api.openai.com https://*.cognitiveservices.azure.com https://api.frankfurter.app https://*.inteligo.com.pl https://*.pkobp.pl",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
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
