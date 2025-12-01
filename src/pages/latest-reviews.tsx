import React, { useEffect } from 'react';
import Head from 'next/head';
import Home from './index';
import { useSetAtom } from 'jotai';
import { latestReviewsModalOpenAtom } from '@/store/atoms';
import { useTranslations } from 'next-intl';
import { hostForLocale } from '@/lib/market/routing';
import { getMarketFromHost, getMarketFromPath, getLocaleForMarket, isHostBasedEnv, localeToOgFormat } from '@/lib/market/market';
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

interface LatestReviewsPageProps {
  locale: string;
  messages: Record<string, unknown>;
}

export async function getServerSideProps(ctx: GetServerSidePropsContext): Promise<GetServerSidePropsResult<LatestReviewsPageProps>> {
  // Derive locale from host or path
  const host = ctx.req.headers.host || '';
  const pathname = ctx.resolvedUrl || '/';
  const market = isHostBasedEnv(host) ? getMarketFromHost(host) : getMarketFromPath(pathname);
  const serverLocale = getLocaleForMarket(market);
  const shortLocale = serverLocale.split('-')[0];
  
  // Load messages for translations (core only - no home messages needed)
  let messages: Record<string, unknown> = {};
  try {
    const coreMessages = await import(`@/messages/${serverLocale}/index.json`);
    messages = { ...coreMessages.default };
  } catch {
    const coreMessages = await import('@/messages/en-GB/index.json');
    messages = { ...coreMessages.default };
  }
  
  return { props: { locale: shortLocale, messages } };
}

export default function LatestReviewsPage({ locale: serverLocale }: LatestReviewsPageProps) {
  const setOpen = useSetAtom(latestReviewsModalOpenAtom);
  const origin = hostForLocale(serverLocale);
  const tMeta = useTranslations('Meta');

  useEffect(() => {
    // Open the Latest Reviews modal on mount
    setOpen(true);
  }, [setOpen]);

  const canonical = `${origin}/latest-reviews`;
  const title = tMeta('latestReviewsTitle');
  const description = tMeta('latestReviewsDescription');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Latest Reviews',
    url: canonical,
    inLanguage: serverLocale,
  };
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: origin + '/' },
      { '@type': 'ListItem', position: 2, name: 'Latest Reviews', item: canonical },
    ],
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Biggy Index" />
        <meta property="og:locale" content={localeToOgFormat(serverLocale)} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <link rel="canonical" href={canonical} />
        {['en','de','fr','it','pt'].map(l => (
          <link key={l} rel="alternate" href={`${hostForLocale(l)}/latest-reviews`} hrefLang={l} />
        ))}
        <link rel="alternate" href={`${hostForLocale('en')}/latest-reviews`} hrefLang="x-default" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      </Head>
      <Home suppressDefaultHead />
    </>
  );
}
