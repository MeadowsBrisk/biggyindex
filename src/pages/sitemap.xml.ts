import type { NextApiRequest, NextApiResponse } from 'next';
import type { GetServerSideProps } from 'next';
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const origin = 'https://lbindex.vip';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${origin}/sitemap-static.xml</loc></sitemap>
  <sitemap><loc>${origin}/sitemap-items.xml</loc></sitemap>
  <sitemap><loc>${origin}/sitemap-sellers.xml</loc></sitemap>
</sitemapindex>`;
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  res.write(xml);
  res.end();
  return { props: {} };
};

export default function SiteMapIndex() { return null; }
