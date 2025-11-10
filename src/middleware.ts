import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getMarketFromHost, getMarketFromPath, isHostBasedEnv } from '@/lib/market';

// Middleware: normalize API calls to include ?mkt based on hostname.
// - On biggyindex.com (and subdomains) and lbindex.vip, derive market from host and
//   rewrite /api/index/* to include ?mkt=XX when missing.
// - Leaves localhost and other environments untouched if ?mkt is already present.
//
// This removes the need for client code to remember appending ?mkt in production
// and keeps server-side inference consistent.

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const host = req.headers.get('host') || '';
  // Derive market from host when on subdomains (fr.biggyindex.com, etc);
  // otherwise fall back to path prefix (e.g., /fr on apex or previews)
  const market = isHostBasedEnv(host) ? getMarketFromHost(host) : getMarketFromPath(url.pathname);

  if (!url.searchParams.has('mkt')) {
    url.searchParams.set('mkt', market);
    return NextResponse.rewrite(url);
  }

  // Also drop a lightweight cookie for other server logic if needed
  const res = NextResponse.next();
  try {
    res.cookies.set('mkt', market, { path: '/', sameSite: 'lax' });
  } catch {}
  return res;
}

export const config = {
  matcher: ['/api/index/:path*'],
};
