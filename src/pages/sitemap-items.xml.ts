import type { GetServerSideProps } from 'next';
import { localeFromHost, hostForLocale } from '@/lib/market/routing';
import { localeToMarket, getLocaleForMarket, MARKETS } from '@/lib/market/market';

export const getServerSideProps: GetServerSideProps = async ({ res, req }) => {
  const host = req?.headers?.host || 'biggyindex.com';
  const locale = localeFromHost(host);
  const market = localeToMarket(locale);
  const origin = hostForLocale(locale);

  const mod = await import('@/lib/data/indexData');

  // Load all market indexes in parallel to build a ref → markets presence map
  const allMarketItems = await Promise.all(
    MARKETS.map(async (m) => {
      try {
        const items = await mod.getAllItems(m);
        return { market: m, items };
      } catch { return { market: m, items: [] as any[] }; }
    })
  );

  // Build presence map: refNum → Set<Market>
  const presence = new Map<string, Set<string>>();
  for (const { market: m, items } of allMarketItems) {
    for (const it of items) {
      const ref = String(it?.refNum || it?.id || '');
      if (!ref) continue;
      if (!presence.has(ref)) presence.set(ref, new Set());
      presence.get(ref)!.add(m);
    }
  }

  // Get items for current market
  const currentItems = allMarketItems.find(mi => mi.market === market)?.items || [];

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const urls = currentItems.map((it) => {
    const ref = String(it?.refNum || it?.id || '');
    if (!ref) return '';
    const escapedRef = escape(ref);
    const path = `/item/${escapedRef}`;
    const lastmod = it?.lua || it?.fsa || null;

    // Only emit hreflang for markets where this item exists
    const itemMarkets = presence.get(ref) || new Set([market]);
    const alts = Array.from(itemMarkets).map(m => {
      const hreflang = getLocaleForMarket(m as any).toLowerCase();
      return `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${hostForLocale(hreflang)}${path}"/>`;
    });
    // x-default: prefer GB if available, otherwise current market
    const xDefault = itemMarkets.has('GB') ? 'en' : locale;
    alts.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${hostForLocale(xDefault)}${path}"/>`);

    return `<url><loc>${origin}${path}</loc>${lastmod ? `<lastmod>${escape(lastmod)}</lastmod>` : ''}<changefreq>daily</changefreq><priority>0.7</priority>${alts.join('')}</url>`;
  }).filter(Boolean).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
  res.write(xml);
  res.end();
  return { props: {} };
};

export default function SiteMapItems() { return null; }
