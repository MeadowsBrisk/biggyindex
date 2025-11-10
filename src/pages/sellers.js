import React, { useEffect } from 'react';
import Head from 'next/head';
import Home from './index';
import { useSetAtom } from 'jotai';
import { sellerAnalyticsOpenAtom } from '@/store/atoms';
import { useLocale, useTranslations } from 'next-intl';
import { hostForLocale } from '@/lib/routing';

export async function getStaticProps() {
  return { props: {}, revalidate: 900 };
}

export default function SellersPage() {
  const setOpen = useSetAtom(sellerAnalyticsOpenAtom);
  const locale = useLocale();
  const origin = hostForLocale(locale);
  const tMeta = useTranslations('Meta');

  useEffect(() => {
    // Open the Sellers Analytics modal on mount
    setOpen(true);
  }, [setOpen]);

  const canonical = `${origin}/sellers`;
  const title = tMeta('sellersTitle');
  const description = tMeta('sellersDescription');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Sellers — Analytics & stats',
    url: canonical,
  inLanguage: locale,
  };
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
  { '@type': 'ListItem', position: 1, name: 'Home', item: origin + '/' },
      { '@type': 'ListItem', position: 2, name: 'Sellers', item: canonical },
    ],
  };

  return (
    <>
      <Head>
  <title>{title}</title>
  <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      </Head>
      <Home suppressDefaultHead />
    </>
  );
}
