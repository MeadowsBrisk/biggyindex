import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  // Optimize package imports for better tree-shaking
  experimental: {
    optimizePackageImports: ['framer-motion', 'motion', 'lucide-react', 'jotai', '@radix-ui/react-slider'],
    // Optional: Test this for faster client navigation
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },

  // Internationalization with domain-based routing
  // Production: subdomains (de.biggyindex.com, fr.biggyindex.com)
  // Local dev: path-based fallback (/de, /fr)
  //
  // Note: Each defaultLocale can only be assigned to ONE domain in Next.js.
  // Since biggyindex.com, www.biggyindex.com, and lbindex.vip all use en-GB,
  // we only specify the main domain here. The others are handled by:
  // 1. www → non-www redirect at CDN/DNS level
  // 2. lbindex.vip → biggyindex.com redirect at CDN/DNS level
  i18n: {
    locales: ['en-GB', 'de-DE', 'fr-FR', 'pt-PT', 'it-IT'],
    defaultLocale: 'en-GB',
    // Disable automatic locale detection - we handle this via host/path in proxy.ts
    localeDetection: false,
    // Domain routing for production subdomains
    domains: [
      { domain: 'biggyindex.com', defaultLocale: 'en-GB' },
      { domain: 'de.biggyindex.com', defaultLocale: 'de-DE' },
      { domain: 'fr.biggyindex.com', defaultLocale: 'fr-FR' },
      { domain: 'pt.biggyindex.com', defaultLocale: 'pt-PT' },
      { domain: 'it.biggyindex.com', defaultLocale: 'it-IT' },
    ],
  },
  images: {
    // 4 hours - matches Next.js 16 default, explicit for clarity
    minimumCacheTTL: 14400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i2.littlebiggy.net",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "lbindex.vip",
      },
      {
        protocol: "https",
        hostname: "biggyindex.com",
      },
    ],
  },
};

export default nextConfig;
