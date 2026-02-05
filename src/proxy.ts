import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getMarketFromHost, getMarketFromPath, isHostBasedEnv } from '@/lib/market/market';

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
  
  // Derive market from host when on subdomains (fr.biggyindex.com, etc);
  // otherwise fall back to path prefix (e.g., /fr on apex or previews)
  const market = isHostBasedEnv(host) ? getMarketFromHost(host) : getMarketFromPath(url.pathname);

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
  matcher: ['/api/index/:path*'],
};
