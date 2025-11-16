import React, { useEffect } from 'react';
import Head from 'next/head';
import Home from './index';
import { useSetAtom } from 'jotai';
import { sellerAnalyticsOpenAtom } from '@/store/atoms';
import { useTranslations } from 'next-intl';
import { hostForLocale } from '@/lib/routing';
import { getMarketFromHost, getMarketFromPath, getLocaleForMarket, isHostBasedEnv } from '@/lib/market';

export async function getServerSideProps(ctx) {
  // Derive locale from host or path
  const host = ctx.req.headers.host || '';
  const pathname = ctx.resolvedUrl || '/';
  const market = isHostBasedEnv(host) ? getMarketFromHost(host) : getMarketFromPath(pathname);
  const serverLocale = getLocaleForMarket(market);
  const shortLocale = serverLocale.split('-')[0];
  
  // Load messages for translations
  let messages = {};
  try {
    const coreMessages = await import(`@/messages/${serverLocale}.json`);
    const homeMessages = await import(`@/home-messages/${serverLocale}.json`);
    messages = { ...coreMessages.default, ...homeMessages.default };
  } catch {
    const coreMessages = await import('@/messages/en-GB.json');
    const homeMessages = await import('@/home-messages/en-GB.json');
    messages = { ...coreMessages.default, ...homeMessages.default };
  }
  
  return { props: { locale: shortLocale, messages } };
}

export default function SellersPage({ locale: serverLocale, messages }) {
  const setOpen = useSetAtom(sellerAnalyticsOpenAtom);
  const origin = hostForLocale(serverLocale);
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
  inLanguage: serverLocale,
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
        {['en','de','fr','it','pt'].map(l => (
          <link key={l} rel="alternate" href={`${hostForLocale(l)}/sellers`} hrefLang={l} />
        ))}
        <link rel="alternate" href={`${hostForLocale('en')}/sellers`} hrefLang="x-default" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      </Head>
      <Home suppressDefaultHead />
    </>
  );
}
