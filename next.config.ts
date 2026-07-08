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
  // v1 → v2 redirect map. Host-relative, so each market subdomain redirects
  // its own legacy paths. Runs before the next-intl middleware.
  async redirects() {
    return [
      // v1 page renames
      { source: "/home", destination: "/", permanent: true },
      { source: "/latest-reviews", destination: "/reviews", permanent: true },
      // Deliberate 302: real /category/[slug] pages return in Phase 2 and we
      // want Google to keep the source URLs indexed. DELETE this rule when
      // category pages ship.
      { source: "/category/:slug", destination: "/browse", permanent: false },
      // v1 localized item/seller paths (ported from v1 netlify.toml 301s;
      // /producto added for symmetry — v1 only had the seller-side /vendedor)
      { source: "/produit/:ref", destination: "/item/:ref", permanent: true },
      { source: "/produkt/:ref", destination: "/item/:ref", permanent: true },
      {
        source: "/prodotto/:ref",
        destination: "/item/:ref",
        permanent: true,
      },
      { source: "/produto/:ref", destination: "/item/:ref", permanent: true },
      {
        source: "/producto/:ref",
        destination: "/item/:ref",
        permanent: true,
      },
      { source: "/vendeur/:id", destination: "/seller/:id", permanent: true },
      {
        source: "/verkaeufer/:id",
        destination: "/seller/:id",
        permanent: true,
      },
      {
        source: "/venditore/:id",
        destination: "/seller/:id",
        permanent: true,
      },
      {
        source: "/vendedor/:id",
        destination: "/seller/:id",
        permanent: true,
      },
      // v1 apex locale-prefix paths (/de/home, /it/home, …) → market
      // subdomains. Explicit /home rules first so the commonest legacy URL
      // resolves in one hop instead of chaining through /{prefix}/home →
      // subdomain /home → subdomain /. `:path*` also matches the bare
      // prefix. Two-letter prefixes can't collide with v2 locale codes
      // (/de-DE) or any v2 top-level route.
      ...["de", "fr", "pt", "it", "es"].flatMap((prefix) => [
        {
          source: `/${prefix}/home`,
          destination: `https://${prefix}.biggyindex.com/`,
          permanent: true,
        },
        {
          source: `/${prefix}/:path*`,
          destination: `https://${prefix}.biggyindex.com/:path*`,
          permanent: true,
        },
      ]),
      // v1 sitemap children → v2 /sitemap/[id] routes
      {
        source: "/sitemap-static.xml",
        destination: "/sitemap/static.xml",
        permanent: true,
      },
      {
        source: "/sitemap-items.xml",
        destination: "/sitemap/items.xml",
        permanent: true,
      },
      {
        source: "/sitemap-sellers.xml",
        destination: "/sitemap/sellers.xml",
        permanent: true,
      },
      // No categories sitemap child yet — retarget when category pages ship
      {
        source: "/sitemap-categories.xml",
        destination: "/sitemap/static.xml",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
