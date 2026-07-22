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
  // ── DO NOT set htmlLimitedBots to a catch-all. ─────────────────────────────
  // REVERTED 2026-07-21. We briefly ran `htmlLimitedBots: /.*/` (2026-07-14) to
  // force BLOCKING metadata for every UA, trying to fix social share previews
  // (og:image was streaming at byte ~428k, past where WhatsApp/Telegram stop
  // parsing). It made things strictly worse: item/seller are param-less
  // fallback shells, so every render is a PPR *resume*, and Next hard-codes
  // `serveStreamingMetadata: true` at export time (next/dist/export/worker.js)
  // while the runtime honoured our regex and used the blocking variant. The two
  // render different elements in the same slot (next/dist/lib/metadata/metadata.js
  // — `<div hidden>` when streaming vs `<__next_metadata_boundary__>` when not),
  // so React aborted the boundary:
  //   "Expected the resume to render <div> ... instead it rendered
  //    <__next_metadata_boundary__>"  → $RX() → client-rendered metadata.
  // Measured live on 2026-07-21: item/seller pages served `</head>` at byte 4837
  // with NO <title>, NO canonical, NO og:* for any non-JS consumer — and because
  // netlify-vary does NOT include user-agent, that one metadata-less copy was
  // cached and served to Googlebot/Bingbot/WhatsApp alike. Upstream bugs:
  // vercel/next.js#93401 and #95406 (both open as of 16.2.10).
  // Streamed metadata (late in body, but PRESENT) beats blocking metadata that
  // gets dropped. If social previews need fixing again, give scrapers their own
  // cache entry (UA-detect in proxy.ts → marker query param + Netlify-Vary),
  // do NOT reach for htmlLimitedBots.
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

    // ── REMOVED (2026-07-13): query-conditioned X-Robots noindex on /browse.
    // Netlify's CDN caches /browse under ONE key that IGNORES filter queries
    // (netlify-vary only includes __nextDataReq|_rsc). A `has`-matched
    // noindex response for /browse?cat=… therefore gets CACHED and served for
    // the BARE hub too — observed live: bare /browse returned
    // `x-robots-tag: noindex` minutes after a filtered request populated the
    // entry. Query-conditional headers are structurally unsafe for any
    // query-ignoring cache key; do NOT reintroduce in any layer that runs at
    // or behind the CDN. The /browse canonical tag carries the dedup burden
    // (filtered URLs canonicalise to /browse), which GSC shows working.

    // ── Durable-CDN fallback for the PPR-postponed long tail ──────────────
    // ACTIVATED 2026-07-13 (was the prepared fallback below round 3). Source
    // dive confirmed why the framework path cannot cache these on Netlify:
    // under cacheComponents every route is PPR; a runtime render that
    // postpones (x-nextjs-postponed) emits `private,no-store`
    // (next/dist/server/lib/cache-control.js maps revalidate:0), the
    // fallback-shell/upgrade recovery paths never run on this stack, and
    // @netlify/plugin-nextjs run/headers.js copies that no-store verbatim to
    // netlify-cdn-cache-control → the CDN never stores it → EVERY bot hit on
    // ~23k item/seller/category/archive URLs was a billed function invocation
    // (the July 2026 usage blowout).
    //
    // Why this is safe for healthy responses: run/headers.js only applies its
    // own mapping when the response has `x-nextjs-cache` OR lacks a
    // pre-existing netlify-cdn-cache-control. Prerendered/ISR responses carry
    // x-nextjs-cache → the runtime still derives their native tag-purgeable
    // caching and OVERRIDES this header. Postponed responses carry no
    // x-nextjs-cache → this header survives → the CDN stores them. Net effect:
    // the TTL applies exactly where the framework fails, nowhere else.
    //
    // TRADEOFF: TTL-based, NOT tag-based. revalidateTag will not purge these
    // entries — worst-case HTML staleness is s-maxage + SWR background
    // refresh. The item overlay re-fetches live data via /api/item-detail, so
    // stale SSR prices are cosmetic. Unknown-ref 404s also cache — deliberate:
    // the GSC validation bucket (2k dead URLs) was a pure invocation firehose.
    //
    // s-maxage raised 3600 → 21600 (6h) on 07-14: most long-tail URLs get hit
    // by bots roughly once a day, and any hit past s-maxage serves stale but
    // still fires ONE background revalidation (= a billed invocation). A
    // longer fresh window is the only lever that removes those — day-1 post-
    // fix usage (~4k/day) still projected too close to the 125k cap.
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
    // (src/app/robots.txt/route.ts) that sets its own cacheable headers —
    // the sitemap.xml shape. It was BRIEFLY a metadata route (robots.ts)
    // whose `await headers()` call made every hit a billed origin invocation
    // on all 10 hosts; see the route file's comment for the history.

    return durableRules;
  },
};

export default withNextIntl(nextConfig);
