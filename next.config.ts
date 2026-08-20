import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  turbopack: {
    // Pin Turbopack's root to THIS project. The parent directory carries its
    // own package.json + yarn.lock, so without an explicit root Turbopack
    // infers the whole enclosing workspace and watches/resolves across all of
    // it, making dev compiles slow and thrashing the watcher. Must be absolute
    // (Turbopack warns otherwise).
    root: __dirname,
  },
  experimental: {
    // Client-side cache for visited routes (needs Cache Components).
    // There is no `viewTransition` flag on Next >= 16.3: navigation
    // cross-fades come from React's <ViewTransition> (components/
    // PageTransition.tsx), and `prefetchInlining` is the default.
    cachedNavigations: true,
  },
  // Keep the AWS SDK external instead of bundling it into server routes —
  // lib/r2-server.ts pulls it in for the authenticated R2 API routes.
  serverExternalPackages: ["@aws-sdk/client-s3"],
  // DO NOT set `htmlLimitedBots` to a catch-all. Item/seller pages are
  // param-less PPR fallback shells; a catch-all regex makes their resumed
  // renders disagree with the exported shell about streamed-vs-blocking
  // metadata, React aborts the boundary, and pages get cached WITHOUT any
  // <title>/canonical/og:* for every non-JS consumer (the CDN cache does not
  // vary on user-agent). Upstream: vercel/next.js#93401, #95406.
  // If social previews ever need blocking metadata, give scrapers their own
  // cache entry (UA-detect in proxy.ts → marker param + Netlify-Vary).
  cacheComponents: true,
  // `partialPrefetching` is deliberately OFF: with a `[locale]` root param
  // the layout must await `params`, which excludes every route from instant
  // shells, and the fix (next/root-params) doesn't resolve under Turbopack
  // as of 16.3.1. Revisit together when that lands.
  cacheLife: {
    /** Browse pages — stale 1h, revalidate daily, expire weekly */
    items: { stale: 3600, revalidate: 86400, expire: 604800 },
    /** Item detail pages — stale 12h, revalidate 48h, expire weekly */
    "item-detail": { stale: 43200, revalidate: 172800, expire: 604800 },
    /** Seller pages — stale 12h, revalidate 48h, expire weekly */
    sellers: { stale: 43200, revalidate: 172800, expire: 604800 },
    /** Site config — effectively immutable until redeploy */
    config: { stale: 600, revalidate: 86400, expire: 604800 },
    /**
     * Live Little Biggy status — short profile so the /littlebiggy-status
     * "last checked X ago" indicator stays honest. Revalidates every 5 min;
     * the crawler writes shared/status.json roughly every ~30 min.
     */
    status: { stale: 60, revalidate: 300, expire: 3600 },
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
      // v1 localized item/seller paths. /producto has no v1 counterpart and is
      // here only so the Spanish pair matches the other locales.
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
      {
        source: "/sitemap-categories.xml",
        destination: "/sitemap/categories.xml",
        permanent: true,
      },
    ];
  },

  async headers() {
    // On Netlify, proxy.ts (edge middleware) REWRITES every page request to
    // its locale-prefixed internal path (host → /en-GB/…, /de-DE/…) BEFORE the
    // origin's router matches these header sources. In dev the unified server
    // matches the ORIGINAL path instead. So every rule needs both the bare
    // source (dev + any unrewritten request) and the locale-prefixed variant
    // (prod). Locale list must track src/i18n/routing.ts.
    const LOCALE_SEG =
      ":locale(en-GB|en-IE|de-DE|fr-FR|pt-PT|it-IT|es-ES|el-GR|cs-CZ|pl-PL)";

    // Never emit query-conditional headers on /browse — no X-Robots noindex
    // matched on filter params. The CDN caches /browse under ONE key that
    // ignores those queries (netlify-vary covers only __nextDataReq|_rsc), so
    // a header matched for /browse?cat=… gets cached and served for the bare
    // hub too. This is unsafe in any layer at or behind the CDN. The /browse
    // canonical tag carries the dedup burden instead.

    // ── Durable-CDN fallback for the PPR-postponed long tail ──────────────
    // The framework path cannot cache these on Netlify: under cacheComponents
    // every route is PPR, and a runtime render that postpones emits
    // `private,no-store`, which the Netlify adapter copies verbatim into
    // netlify-cdn-cache-control. The CDN then stores nothing, so every bot hit
    // on the ~23k item/seller/category URLs is a billed function invocation.
    //
    // Safe for healthy responses: the adapter only applies its own mapping to a
    // response carrying `x-nextjs-cache` or lacking netlify-cdn-cache-control.
    // Prerendered/ISR responses carry it, so their native tag-purgeable caching
    // still overrides this header; postponed responses don't, so it survives.
    //
    // TRADEOFF: TTL-based, not tag-based — revalidateTag will NOT purge these
    // entries, so worst-case HTML staleness is s-maxage plus the SWR refresh.
    // The item overlay re-fetches live data via /api/item-detail, so stale SSR
    // prices are cosmetic. Unknown-ref responses cache too, deliberately: dead
    // URLs are otherwise a pure invocation firehose — note a ref probed before
    // its item existed keeps 404ing for the full window, and revalidateTag
    // can't clear it.
    //
    // Any hit past s-maxage still fires one billed background revalidation, so
    // the fresh window — not SWR — is the lever on invocation count.
    const durable =
      "public, durable, s-maxage=21600, stale-while-revalidate=86400";
    const durableRules = [
      "/item/:ref*",
      "/seller/:id*",
      "/category/:slug*",
      `/${LOCALE_SEG}/item/:ref*`,
      `/${LOCALE_SEG}/seller/:id*`,
      `/${LOCALE_SEG}/category/:slug*`,
    ].map((source) => ({
      source,
      headers: [{ key: "Netlify-CDN-Cache-Control", value: durable }],
    }));

    // /robots.txt needs no rule here: it is a route handler
    // (src/app/robots.txt/route.ts) that sets its own cacheable headers, in
    // the same shape as sitemap.xml. See that file for why it must not become
    // a metadata route.

    return durableRules;
  },
};

export default withNextIntl(nextConfig);
