import type { GetServerSideProps } from 'next';
import { MARKETS, getLocaleForMarket } from '@/lib/market/market';
import { hostForLocale, localeFromHost } from '@/lib/market/routing';

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const host = String(req?.headers?.host || 'biggyindex.com');
  const normalizedHost = host.split(':')[0].toLowerCase();
  const isGbApexHost = normalizedHost === 'biggyindex.com' || normalizedHost === 'www.biggyindex.com';
  const locale = localeFromHost(host);
  const origin = hostForLocale(locale);
  const localePrefixes = MARKETS
    .filter((market) => market !== 'GB')
    .map((market) => getLocaleForMarket(market).split('-')[0].toLowerCase());
  const localePrefixDisallow = isGbApexHost
    ? localePrefixes.map((prefix) => `Disallow: /${prefix}`)
    : [];
  const lines = [
    'User-agent: BabbarBot',
    'Disallow: /',
    'User-agent: Barkrowler',
    'Disallow: /',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    // Reduce crawl noise from accidental or templated query strings like ?q=...
    'Disallow: /*?*q=',

    'Disallow: /*?*ref=',
    'Disallow: /*?*cat=',
    'Disallow: /*?*sub=',
    'Disallow: /*?*excl=',
    ...localePrefixDisallow,
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.write(lines);
  res.end();
  return { props: {} } as any;
};

export default function Robots() { return null; }
