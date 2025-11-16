import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetServerSideProps, NextPage } from 'next';
import { useRouter } from 'next/router';
import Home from '../index';
import { useSetAtom } from 'jotai';
import { expandedRefNumAtom } from '@/store/atoms';
import { loadItemForSEO } from '@/lib/seo';
import { useTranslations, useLocale } from 'next-intl';
import { buildItemUrl, hostForLocale } from '@/lib/routing';
import { getMarketFromHost, getMarketFromPath, getLocaleForMarket, isHostBasedEnv } from '@/lib/market';

interface ItemSEO {
  ref: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  sellerName?: string | null;
}

interface ItemRefPageProps {
  seo: ItemSEO | null;
  messages: Record<string, any>;
  locale: string;
}

export const getServerSideProps: GetServerSideProps<ItemRefPageProps> = async (ctx) => {
  try {
    const ref = typeof ctx.params?.ref === 'string' ? ctx.params.ref : null;
    if (!ref) return { notFound: true };
    
    // Derive market and locale from host or path for proper SEO meta
    const host = ctx.req.headers.host || '';
    const pathname = ctx.resolvedUrl || '/';
    const market = isHostBasedEnv(host) ? getMarketFromHost(host) : getMarketFromPath(pathname);
    const serverLocale = getLocaleForMarket(market);
    const shortLocale = serverLocale.split('-')[0];
    
    const item = await loadItemForSEO(ref, market);
    if (!item) return { notFound: true };
    
    // Load messages for server-side translation
    let messages: Record<string, any> = {};
    try {
      const coreMessages = await import(`@/messages/${serverLocale}.json`);
      const homeMessages = await import(`@/home-messages/${serverLocale}.json`);
      messages = { ...coreMessages.default, ...homeMessages.default };
    } catch {
      const coreMessages = await import('@/messages/en-GB.json');
      const homeMessages = await import('@/home-messages/en-GB.json');
      messages = { ...coreMessages.default, ...homeMessages.default };
    }
    
    const seo: ItemSEO = {
      ref,
      name: item.name || '',
      description: item.description || null,
      imageUrl: item.imageUrl || null,
      sellerName: item.sellerName || null,
    };
    return { props: { seo, messages, locale: shortLocale } };
  } catch {
    return { notFound: true };
  }
};

const ItemRefPage: NextPage<ItemRefPageProps> = ({ seo, locale: serverLocale }) => {
  const router = useRouter();
  const setExpanded = useSetAtom(expandedRefNumAtom);
  const tReviews = useTranslations('Reviews');
  const ref = typeof router.query.ref === 'string' ? router.query.ref : null;

  useEffect(() => {
    if (!router.isReady) return;
    setExpanded(ref || null);
  }, [router.isReady, ref, setExpanded]);

  const titleBase = seo?.name ? seo.name : 'Items';
  const bySuffix = seo?.sellerName ? ` ${tReviews('soldBy')} ${seo.sellerName}` : '';
  const title = `${titleBase}${bySuffix} | Biggy Index`;

  const rawDesc = typeof seo?.description === 'string' ? seo.description : '';
  const cleanDesc = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const baseDesc = cleanDesc ? cleanDesc : (seo?.name ? `${seo.name}` : 'Items');
  const sellerPrefix = seo?.sellerName ? `${seo.sellerName} · ` : '';
  const desc = (sellerPrefix + baseDesc).slice(0, 160);

  const effectiveRef = String(seo?.ref || ref || '');
  const canonical = buildItemUrl(effectiveRef, serverLocale);
  const altLocales = ['en','de','fr','it','pt'];

  return (
    <>
      <Head>
        <title>{title}</title>
        {desc && <meta name="description" content={desc} />}
        {desc && <meta property="og:description" content={desc} />}
        <meta property="og:title" content={title} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        {desc && <meta name="twitter:description" content={desc} />}
        <link rel="canonical" href={canonical} />
        {altLocales.map(l => (
          <link key={l} rel="alternate" href={buildItemUrl(effectiveRef, l)} hrefLang={l} />
        ))}
        <link rel="alternate" href={buildItemUrl(effectiveRef, 'en')} hrefLang="x-default" />
        {seo?.imageUrl && <meta property="og:image" content={seo.imageUrl} />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemPage',
              mainEntity: {
                '@type': 'Thing',
                name: seo?.name || '',
                description: desc || '',
                image: seo?.imageUrl || undefined,
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: hostForLocale(serverLocale) + '/' },
                { '@type': 'ListItem', position: 2, name: 'Items', item: hostForLocale(serverLocale) + '/home' },
                { '@type': 'ListItem', position: 3, name: seo?.name || 'Items', item: canonical },
              ],
            }),
          }}
        />
      </Head>
      {seo && (
        <article className="mx-auto max-w-2xl px-4 py-6 border-b border-gray-200 dark:border-gray-700" itemScope itemType="https://schema.org/Product">
          <h1 className="text-2xl font-semibold mb-2" itemProp="name">{seo.name}</h1>
          {seo.sellerName && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
              {tReviews('soldBy')} <span itemProp="brand">{seo.sellerName}</span>
            </p>
          )}
          {desc && <p className="text-sm text-gray-700 dark:text-gray-400" itemProp="description">{desc}</p>}
          {seo.imageUrl && (
            <div className="mt-3">
              <img src={seo.imageUrl} alt={seo.name} loading="lazy" className="max-h-64 w-auto rounded" itemProp="image" />
            </div>
          )}
        </article>
      )}
      <Home suppressDefaultHead />
    </>
  );
};

export default ItemRefPage;
