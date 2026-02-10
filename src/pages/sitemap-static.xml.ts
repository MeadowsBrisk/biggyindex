import type { GetServerSideProps } from 'next';
import { localeFromHost, hostForLocale } from '@/lib/market/routing';
import { HREFLANG_LOCALES } from '@/lib/market/market';
export const getServerSideProps: GetServerSideProps = async ({ res, req }) => {
  const host = req?.headers?.host || 'biggyindex.com';
  const locale = localeFromHost(host);
  const origin = hostForLocale(locale);
  const now = new Date().toISOString();

  // Build xhtml:link alternates for a given path
  const alts = (path: string) => HREFLANG_LOCALES.map(l =>
    `<xhtml:link rel="alternate" hreflang="${l}" href="${hostForLocale(l)}${path}"/>`
  ).concat(`<xhtml:link rel="alternate" hreflang="x-default" href="${hostForLocale('en')}${path}"/>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${origin}/</loc>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
    ${alts('/')}
  </url>
  <url>
    <loc>${origin}/home</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <lastmod>${now}</lastmod>
    ${alts('/home')}
  </url>
  <url>
    <loc>${origin}/sellers</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
    <lastmod>${now}</lastmod>
    ${alts('/sellers')}
  </url>
  <url>
    <loc>${origin}/latest-reviews</loc>
    <changefreq>hourly</changefreq>
    <priority>0.7</priority>
    <lastmod>${now}</lastmod>
    ${alts('/latest-reviews')}
  </url>
</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
  res.write(xml);
  res.end();
  return { props: {} };
};

export default function SiteMapStatic() { return null; }
