import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  turbopack: {
    // Pin Turbopack's root to THIS project. The workspace root
    // (E:\my-sites\biggy-index-v2) has its own package.json + yarn.lock for
    // the `r2` CLI, so without an explicit root Turbopack infers the whole
    // ~9 GB workspace (old-biggyindex, dashboard, food-aggregator-example,
    // …) as root and watches/resolves across all of it — which makes every
    // dev compile take 10-20s and the watcher thrash. food-aggregator has no
    // parent lockfile, so it gets a correctly-scoped root for free; we have
    // to pin it. Must be absolute (Turbopack warns otherwise).
    root: __dirname,
  },
  experimental: {
    viewTransition: true,
    prefetchInlining: true,
    cachedNavigations: true,
  },
  // Keep the AWS SDK external instead of bundling it into server routes
  // (matches food-aggregator). lib/r2-server.ts pulls it in for the
  // authenticated R2 API routes.
  serverExternalPackages: ["@aws-sdk/client-s3"],
  cacheComponents: true,
  cacheLife: {
    /** Browse pages — stale 1h, revalidate daily, expire weekly */
    items: { stale: 3600, revalidate: 86400, expire: 604800 },
    /** Item detail pages — stale 12h, revalidate 48h, expire weekly */
    "item-detail": { stale: 43200, revalidate: 172800, expire: 604800 },
    /** Seller pages — stale 12h, revalidate 48h, expire weekly */
    sellers: { stale: 43200, revalidate: 172800, expire: 604800 },
    /** Site config — effectively immutable until redeploy */
    config: { stale: 600, revalidate: 86400, expire: 604800 },
  },
  images: {
    remotePatterns: [{ hostname: "img.biggyindex.com" }],
  },
};

export default withNextIntl(nextConfig);
