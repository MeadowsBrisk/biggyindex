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

export function GET(request: NextRequest): NextResponse {
  const market = getMarketFromHost(request.headers.get("host"));
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
