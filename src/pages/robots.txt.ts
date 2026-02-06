import type { GetServerSideProps } from 'next';
import { hostForLocale, localeFromHost } from '@/lib/market/routing';

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const host = String(req?.headers?.host || 'biggyindex.com');
  const locale = localeFromHost(host);
  const origin = hostForLocale(locale);
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
    // BUG-011: Block SPA modal/filter URL params that Google reports as
    // "Alternative page with proper canonical tag" — these are client-side
    // overlay states, not distinct pages
    'Disallow: /*?*ref=',
    'Disallow: /*?*cat=',
    'Disallow: /*?*sub=',
    'Disallow: /*?*excl=',
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
