import type { NextApiRequest, NextApiResponse } from 'next';
import type { GetServerSideProps } from 'next';
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const origin = 'https://lbindex.vip';
  let sellers: any[] = [];
  try {
    const mod = await import('@/lib/indexData');
    if (mod && typeof mod.getSellers === 'function') {
      sellers = await mod.getSellers();
    }
  } catch {}

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  res.write(xml);
  res.end();
  return { props: {} };
};

export default function SiteMapSellers() { return null; }
