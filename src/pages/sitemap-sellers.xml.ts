import type { GetServerSideProps } from 'next';
import { localeFromHost, hostForLocale } from '@/lib/market/routing';
import { localeToMarket } from '@/lib/market/market';

export const getServerSideProps: GetServerSideProps = async ({ res, req }) => {
  const host = req?.headers?.host || 'biggyindex.com';
  const locale = localeFromHost(host);
  const market = localeToMarket(locale);
  const origin = hostForLocale(locale);
  let sellers: any[] = [];
  try {
    const mod = await import('@/lib/data/indexData');
    if (mod && typeof mod.getSellers === 'function') {
      sellers = await mod.getSellers(market);
    }
  } catch { }

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Use consistent 'seller' path across all locales
  const urls = sellers
    .map((s) => {
      const id = s?.id;
      if (id == null) return '';
      const lastmod = s?.lastUpdatedAt || null;
      return `<url><loc>${origin}/seller/${escape(String(id))}</loc>${lastmod ? `<lastmod>${escape(lastmod)}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.6</priority></url>`;
    })
    .filter(Boolean)
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
  res.write(xml);
  res.end();
  return { props: {} };
};

export default function SiteMapSellers() { return null; }
