import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MARKETS, getLocaleForMarket, getMarketFromHost, getMarketFromPath, isHostBasedEnv, type Market } from '@/lib/market/market';

const NON_GB_MARKETS = MARKETS.filter((market) => market !== 'GB');
const PREFIX_TO_MARKET: Record<string, Market> = Object.fromEntries(
  NON_GB_MARKETS.map((market) => [getLocaleForMarket(market).split('-')[0].toLowerCase(), market])
);
const LOCALE_PREFIX_RE = new RegExp(`^/(${Object.keys(PREFIX_TO_MARKET).join('|')})(?=/|$)`, 'i');

function normalizeHost(host: string): string {
  return host.split(':')[0].toLowerCase();
}

function marketToHost(market: Market): string {
  return market === 'GB' ? 'biggyindex.com' : `${market.toLowerCase()}.biggyindex.com`;
}

/**
 * Next.js 16 Proxy (formerly Middleware)
 * 
 * Normalizes API calls to include ?mkt based on hostname:
 * - On biggyindex.com (and subdomains) and lbindex.vip, derive market from host
 *   and rewrite /api/index/* to include ?mkt=XX when missing.
 * - Leaves localhost and other environments untouched if ?mkt is already present.
 *
 * This removes the need for client code to remember appending ?mkt in production
 * and keeps server-side inference consistent.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get('host') || '';
  const normalizedHost = normalizeHost(host);
  const pathname = url.pathname;

  // Skip static/internal assets early
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/sitemap') ||
    pathname === '/robots.txt' ||
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Production canonicalization: never serve locale prefixes on biggyindex.com hosts.
  // Example: biggyindex.com/fr/home -> fr.biggyindex.com/home
  //          fr.biggyindex.com/fr/home -> fr.biggyindex.com/home
  if (isHostBasedEnv(normalizedHost)) {
    const prefixed = pathname.match(LOCALE_PREFIX_RE);
    if (prefixed) {
      const pref = prefixed[1].toLowerCase();
      const prefMarket = PREFIX_TO_MARKET[pref];
      if (!prefMarket) return NextResponse.next();
      const hostMarket = getMarketFromHost(normalizedHost);
      const canonicalHost = marketToHost(prefMarket);
      const strippedPath = pathname.replace(LOCALE_PREFIX_RE, '') || '/';

      // If host market doesn't match the URL prefix, move to the right subdomain.
      // If it does match (e.g. fr.biggyindex.com/fr), just strip the prefix.
      const targetHost = hostMarket === prefMarket ? marketToHost(hostMarket) : canonicalHost;
      const redirectUrl = new URL(request.url);
      redirectUrl.hostname = targetHost;
      redirectUrl.pathname = strippedPath;
      return NextResponse.redirect(redirectUrl, 308);
    }
  }
  
  // Derive market from host when on subdomains (fr.biggyindex.com, etc);
  // otherwise fall back to path prefix (e.g., /fr on apex or previews)
  const market = isHostBasedEnv(host) ? getMarketFromHost(host) : getMarketFromPath(url.pathname);

  // Only normalize ?mkt for index API routes.
  if (!pathname.startsWith('/api/index/')) {
    const response = NextResponse.next();
    try { response.cookies.set('mkt', market, { path: '/', sameSite: 'lax' }); } catch {}
    return response;
  }

  // If ?mkt is missing, rewrite the URL to include it
  if (!url.searchParams.has('mkt')) {
    url.searchParams.set('mkt', market);
    const res = NextResponse.rewrite(url);
    try { res.cookies.set('mkt', market, { path: '/', sameSite: 'lax' }); } catch {}
    return res;
  }

  // Pass through with market cookie for downstream server logic
  const response = NextResponse.next();
  try { response.cookies.set('mkt', market, { path: '/', sameSite: 'lax' }); } catch {}
  return response;
}

export const config = {
  matcher: [
    '/api/index/:path*',
    '/:locale([a-z]{2})',
    '/:locale([a-z]{2})/:path*',
  ],
};
