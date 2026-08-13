import { type NextRequest, NextResponse } from "next/server";
import { getMarketFromHost } from "@/lib/market/market";

/**
 * Market-aware robots.txt — blocks known bad bots and disallows
 * filter query param URLs to avoid duplicate content.
 *
 * ── Why a route handler and not src/app/robots.ts (MetadataRoute.Robots) ──
 * This WAS a metadata route calling `await headers()` for the Host. Under
 * cacheComponents that dynamic access made the route fully no-store, and the
 * Netlify runtime forwarded EVERY robots.txt hit to the origin function —
 * measured 2026-07-21/22: consecutive GETs each returned `cache-status:
 * "Netlify Durable"; fwd=bypass` with distinct x-nf-request-ids, on all 10
 * hosts. One billed invocation per crawler politeness-check, forever.
 * /sitemap.xml (this exact route-handler shape, reading the Host from the
 * request object instead of the headers() API) is the proven control: it
 * caches durably per host (`"Netlify Durable"; hit; ttl=43199`). Mirror it.
 * Output is byte-identical to what the metadata route rendered.
 */

const DOMAINS: Record<string, string> = {
  GB: "https://biggyindex.com",
  IE: "https://ie.biggyindex.com",
  DE: "https://de.biggyindex.com",
  FR: "https://fr.biggyindex.com",
  PT: "https://pt.biggyindex.com",
  IT: "https://it.biggyindex.com",
  ES: "https://es.biggyindex.com",
  GR: "https://gr.biggyindex.com",
  CZ: "https://cz.biggyindex.com",
  PL: "https://pl.biggyindex.com",
};

// Explicit /api allows so the WRS renderer can fetch the browse dataset +
// rates and render the full catalog during the rendering wave. Google
// resolves by most-specific path, but explicit Allow entries above the
// blanket /api/ disallow make the intent clear.
//
// "/browse?cat=" re-opens ONLY the category-filter form for crawling. Under
// Google's longest-match rule the allow's 12 literal chars beat the
// "/browse?*" disallow's 8 ("/browse?"), so /browse?cat=Flower is fetchable
// while every other filter combo (q/pmin/pmax/sellers/sub/excl) stays
// blocked. Crawlable != indexable: filtered URLs canonicalise to /browse,
// so Googlebot follows the links and passes equity without indexing them.
const BODY_RULES = `User-Agent: *
Allow: /
Allow: /api/browse
Allow: /api/exchange-rates
Allow: /browse?cat=
Disallow: /api/
Disallow: /browse?*
Disallow: /*?q=*
Disallow: /*?ref=*
Disallow: /*?pmin=*
Disallow: /*?pmax=*
Disallow: /*?sellers=*
Disallow: /*?sub=*
Disallow: /*?excl=*

User-Agent: BabbarBot
User-Agent: Barkrowler
User-Agent: PetalBot
Disallow: /
`;

// Hosts that are allowed to advertise themselves to crawlers. Anything else —
// *.vercel.app, *.netlify.app, staging, deploy previews — gets a blanket
// Disallow instead of the real ruleset.
//
// WHY: getMarketFromHost() falls back to "GB" for unrecognised hosts, so every
// mirror of this app used to serve `Allow: /` and was fully crawlable. During
// the July 2026 Vercel bridge that meant biggyindex-frontend.vercel.app was a
// publicly indexable duplicate of the whole site. Pages do emit a canonical
// pointing at biggyindex.com, which limits the damage, but canonical is a hint
// and robots is a directive — and Vercel's free "Standard Protection" does NOT
// cover a project's production *.vercel.app URL (that needs a paid plan), so
// this route is the only lever we actually control. Keeping the mirror
// reachable-but-unindexable is deliberate: the Vercel project stays a working
// escape hatch we can verify against before flipping DNS.
const CRAWLABLE_HOSTS = new Set<string>([
  "biggyindex.com",
  "www.biggyindex.com",
  "ie.biggyindex.com",
  "de.biggyindex.com",
  "fr.biggyindex.com",
  "pt.biggyindex.com",
  "it.biggyindex.com",
  "es.biggyindex.com",
  "gr.biggyindex.com",
  "cz.biggyindex.com",
  "pl.biggyindex.com",
]);

const MIRROR_BODY = `User-Agent: *
Disallow: /
`;

function isCrawlableHost(hostHeader: string | null): boolean {
  const h = String(hostHeader ?? "")
    .toLowerCase()
    .split(":")[0];
  if (!h) return false;
  // Local development should behave like production, not like a mirror.
  if (h === "localhost" || h === "127.0.0.1") return true;
  return CRAWLABLE_HOSTS.has(h);
}

export function GET(request: NextRequest): NextResponse {
  const host = request.headers.get("host");

  if (!isCrawlableHost(host)) {
    return new NextResponse(MIRROR_BODY, {
      headers: {
        "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  const market = getMarketFromHost(host);
  const baseUrl = DOMAINS[market] ?? DOMAINS.GB;

  return new NextResponse(`${BODY_RULES}\nSitemap: ${baseUrl}/sitemap.xml\n`, {
    headers: {
      // Same proven shape as sitemap.xml/route.ts — the Netlify runtime maps
      // the s-maxage into netlify-cdn-cache-control and stores it durably per
      // host. Content only changes on deploy; 12h keeps a robots edit
      // propagating within half a day (a deploy does not reliably purge
      // TTL-based durable entries).
      "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
