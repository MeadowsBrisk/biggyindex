import type { NextApiRequest, NextApiResponse } from 'next';
import type { GetServerSideProps } from 'next';
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const origin = 'https://lbindex.vip';
  let items: any[] = [];
  try {
    const mod = await import('@/lib/indexData');
    if (mod && typeof mod.getAllItems === 'function') {
      items = await mod.getAllItems();
    }
  } catch {}

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const urls = items.map((it) => {
    const ref = String(it?.refNum || it?.id || '');
    if (!ref) return '';
    const lastmod = it?.lastUpdatedAt || it?.firstSeenAt || null;
    return `<url><loc>${origin}/item/${escape(ref)}</loc>${lastmod ? `<lastmod>${escape(lastmod)}</lastmod>` : ''}<changefreq>daily</changefreq><priority>0.7</priority></url>`;
  }).filter(Boolean).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  res.write(xml);
  res.end();
  return { props: {} };
};

export default function SiteMapItems() { return null; }
