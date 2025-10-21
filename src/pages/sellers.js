import React, { useEffect } from 'react';
import Head from 'next/head';
import Home from './index';
import { useSetAtom } from 'jotai';
import { sellerAnalyticsOpenAtom } from '@/store/atoms';

export async function getStaticProps() {
  return { props: {}, revalidate: 900 };
}

export default function SellersPage() {
  const setOpen = useSetAtom(sellerAnalyticsOpenAtom);

  useEffect(() => {
    // Open the Sellers Analytics modal on mount
    setOpen(true);
  }, [setOpen]);

  const canonical = 'https://lbindex.vip/sellers';
  const title = 'Sellers | Biggy Index';
  const description = 'Explore LittleBiggy seller performance: total reviews, positive rate, negatives, perfect 10/10s, average rating, and shipping times.';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Sellers — Analytics & stats',
    url: canonical,
    inLanguage: 'en-GB',
  };
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lbindex.vip/' },
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
