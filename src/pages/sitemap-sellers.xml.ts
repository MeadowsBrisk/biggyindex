import type { GetServerSideProps } from 'next';
import { localeFromHost, hostForLocale } from '@/lib/market/routing';
import { localeToMarket, getLocaleForMarket, MARKETS } from '@/lib/market/market';

export const getServerSideProps: GetServerSideProps = async ({ res, req }) => {
  const host = req?.headers?.host || 'biggyindex.com';
  const locale = localeFromHost(host);
  const market = localeToMarket(locale);
  const origin = hostForLocale(locale);

  const mod = await import('@/lib/data/indexData');

  // Load all market seller lists in parallel to build presence map
  const allMarketSellers = await Promise.all(
    MARKETS.map(async (m) => {
      try {
        const sellers = await mod.getSellers(m);
        return { market: m, sellers };
      } catch { return { market: m, sellers: [] as any[] }; }
    })
  );

  // Build presence map: sellerId → Set<Market>
  const presence = new Map<string, Set<string>>();
  for (const { market: m, sellers } of allMarketSellers) {
    for (const s of sellers) {
      const id = s?.id != null ? String(s.id) : '';
      if (!id) continue;
      if (!presence.has(id)) presence.set(id, new Set());
      presence.get(id)!.add(m);
    }
  }

  // Get sellers for current market
  const currentSellers = allMarketSellers.find(ms => ms.market === market)?.sellers || [];

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const urls = currentSellers
    .map((s) => {
      const id = s?.id;
      if (id == null) return '';
      const escapedId = escape(String(id));
      const path = `/seller/${escapedId}`;
      // Only emit hreflang for markets where this seller exists
      const sellerMarkets = presence.get(String(id)) || new Set([market]);
      const alts = Array.from(sellerMarkets).map(m => {
        const hreflang = getLocaleForMarket(m as any).toLowerCase();
        return `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${hostForLocale(hreflang)}${path}"/>`;
      });
      const xDefault = sellerMarkets.has('GB') ? 'en' : locale;
      alts.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${hostForLocale(xDefault)}${path}"/>`);

      return `<url><loc>${origin}${path}</loc><changefreq>weekly</changefreq><priority>0.6</priority>${alts.join('')}</url>`;
    })
    .filter(Boolean)
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
  res.write(xml);
  res.end();
  return { props: {} };
};

export default function SiteMapSellers() { return null; }
