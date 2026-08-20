import { type NextRequest, NextResponse } from "next/server";
import { getMarketFromHost } from "@/lib/market/market";

/**
 * Market-aware robots.txt — blocks known bad bots and disallows
 * filter query param URLs to avoid duplicate content.
 *
 * Must stay a route handler; do NOT port it to src/app/robots.ts
 * (MetadataRoute.Robots). A metadata route needs `await headers()` to read the
 * Host, and under cacheComponents that dynamic access makes the route no-store,
 * so the Netlify runtime forwards every hit to the origin function — one billed
 * invocation per crawler politeness-check. Reading the Host off the request
 * object instead keeps the response cacheable durably per host, the same shape
 * sitemap.xml/route.ts uses.
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

// Explicit /api allows so the renderer can fetch the browse dataset + rates
// and render the full catalog. Google resolves by most-specific path, but
// listing them above the blanket /api/ disallow makes the intent clear.
//
// "/browse?cat=" opens ONLY the category-filter form for crawling: under
// Google's longest-match rule the allow's 12 literal chars beat the
// "/browse?*" disallow's 8 ("/browse?"), so /browse?cat=Flower is fetchable
// while every other filter combo (q/pmin/pmax/sellers/sub/excl) stays blocked.
// Crawlable != indexable — filtered URLs canonicalise to /browse, so links are
// followed and pass equity without being indexed.
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

// Hosts allowed to advertise themselves to crawlers. Anything else — platform
// subdomains, staging, deploy previews — gets a blanket Disallow instead of
// the real ruleset. Without this list, getMarketFromHost()'s fallback to "GB"
// makes every mirror serve `Allow: /`, i.e. a fully crawlable duplicate of the
// whole site. Pages emit a canonical at the apex, but canonical is a hint and
// robots is a directive, and platform-side protection generally cannot be
// applied to a production preview URL. Mirrors stay reachable-but-unindexable
// on purpose, so they remain usable for verification.
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
      // The Netlify runtime maps this s-maxage into netlify-cdn-cache-control
      // and stores the response durably per host. Content only changes on
      // deploy, and a deploy does not reliably purge TTL-based durable
      // entries, so 12h bounds how long a robots edit takes to propagate.
      "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
