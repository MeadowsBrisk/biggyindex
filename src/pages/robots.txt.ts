import type { GetServerSideProps } from 'next';
import { hostForLocale, localeFromHost } from '@/lib/routing';

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const host = String(req?.headers?.host || 'biggyindex.com');
  const locale = localeFromHost(host);
  const origin = hostForLocale(locale);
  const lines = [
    'User-agent: *',
    'Allow: /',
    '',
    // Reduce crawl noise from accidental or templated query strings like ?q=...
    'Disallow: /*?*q=',
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
