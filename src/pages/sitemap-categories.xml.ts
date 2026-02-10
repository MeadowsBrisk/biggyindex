import type { GetServerSideProps } from 'next';
import { localeFromHost, hostForLocale } from '@/lib/market/routing';
import { HREFLANG_LOCALES } from '@/lib/market/market';

const CATEGORIES = ['flower', 'hash', 'prerolls', 'vapes', 'edibles', 'concentrates', 'psychedelics', 'tincture', 'other'];

export const getServerSideProps: GetServerSideProps = async ({ res, req }) => {
  const host = req?.headers?.host || 'biggyindex.com';
  const locale = localeFromHost(host);
  const origin = hostForLocale(locale);
  const now = new Date().toISOString();

  const alts = (path: string) => HREFLANG_LOCALES.map(l =>
    `<xhtml:link rel="alternate" hreflang="${l}" href="${hostForLocale(l)}${path}"/>`
  ).concat(`<xhtml:link rel="alternate" hreflang="x-default" href="${hostForLocale('en')}${path}"/>`).join('');

  const urls = CATEGORIES.map(slug => `
  <url>
    <loc>${origin}/category/${slug}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
    ${alts(`/category/${slug}`)}
  </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
  res.write(xml);
  res.end();
  return { props: {} };
};

export default function SiteMapCategories() { return null; }
