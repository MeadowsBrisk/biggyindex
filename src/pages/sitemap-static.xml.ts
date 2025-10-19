import type { NextApiRequest, NextApiResponse } from 'next';
import type { GetServerSideProps } from 'next';
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const origin = 'https://lbindex.vip';
  const now = new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>${origin}/home</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <lastmod>${now}</lastmod>
  </url>
</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  res.write(xml);
  res.end();
  return { props: {} };
};

export default function SiteMapStatic() { return null; }
