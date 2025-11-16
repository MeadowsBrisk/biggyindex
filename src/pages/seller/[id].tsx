import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetServerSideProps, NextPage } from 'next';
import { useRouter } from 'next/router';
import Home from '../index';
import { useSetAtom } from 'jotai';
import { expandedSellerIdAtom } from '@/store/atoms';
import { loadSellerForSEO } from '@/lib/seo';
import { useTranslations, useLocale } from 'next-intl';
import { buildSellerUrl } from '@/lib/routing';
import { hostForLocale } from '@/lib/routing';
import { getMarketFromHost, getMarketFromPath, getLocaleForMarket, isHostBasedEnv } from '@/lib/market';

interface SellerSEO {
  id: number;
  sellerName?: string | null;
  itemsCount?: number | null;
  sellerImageUrl?: string | null;
  shareLink?: string | null;
}

interface SellerIdPageProps {
  seo: SellerSEO | null;
  messages: Record<string, any>;
  locale: string;
}

function parseSellerId(idParam: string | string[] | undefined): number | null {
  if (!idParam) return null;
  const raw = Array.isArray(idParam) ? idParam[0] : idParam;
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export const getServerSideProps: GetServerSideProps<SellerIdPageProps> = async (ctx) => {
  try {
    const sellerId = parseSellerId(ctx.params?.id as string | string[] | undefined);
    if (!sellerId) return { notFound: true };
    
    // Derive market and locale from host or path for proper SEO meta
    const host = ctx.req.headers.host || '';
    const pathname = ctx.resolvedUrl || '/';
    const market = isHostBasedEnv(host) ? getMarketFromHost(host) : getMarketFromPath(pathname);
    
    const seller = await loadSellerForSEO(sellerId, market);
    if (!seller) return { notFound: true };
    const serverLocale = getLocaleForMarket(market);
    const shortLocale = serverLocale.split('-')[0];
    
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
    
    const seo: SellerSEO = {
      id: seller.id,
      sellerName: seller.sellerName || null,
      itemsCount: typeof seller.itemsCount === 'number' ? seller.itemsCount : null,
      sellerImageUrl: seller.sellerImageUrl || null,
      shareLink: seller.shareLink || null,
    };
    return { props: { seo, messages, locale: shortLocale } };
  } catch {
    return { notFound: true };
  }
};

const SellerIdPage: NextPage<SellerIdPageProps> = ({ seo, locale: serverLocale }) => {
  const router = useRouter();
  const setSellerId = useSetAtom(expandedSellerIdAtom);

  const sellerId = parseSellerId(router.query.id);

  useEffect(() => {
    if (!router.isReady) return;
    setSellerId(sellerId);
  }, [router.isReady, sellerId, setSellerId]);

  const title = seo?.sellerName ? `${seo.sellerName} – Sellers | Biggy Index` : `Sellers | Biggy Index`;
  const description = [
    seo?.sellerName || null,
    typeof seo?.itemsCount === 'number' ? `${seo.itemsCount} items` : null,
  ].filter(Boolean).join(' • ');
  const effectiveId = String(seo?.id ?? sellerId ?? '');
  const canonical = buildSellerUrl(effectiveId, serverLocale);
  const altLocales = ['en','de','fr','it','pt'];

  return (
    <>
      <Head>
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
        <link rel="canonical" href={canonical} />
        {altLocales.map(l => (
          <link key={l} rel="alternate" href={buildSellerUrl(effectiveId, l)} hrefLang={l} />
        ))}
        <link rel="alternate" href={buildSellerUrl(effectiveId, 'en')} hrefLang="x-default" />
        <meta property="og:url" content={canonical} />
        <meta property="og:title" content={title} />
        {description && <meta property="og:description" content={description} />}
        <meta name="twitter:title" content={title} />
        {description && <meta name="twitter:description" content={description} />}
        {seo?.sellerImageUrl && <meta property="og:image" content={seo.sellerImageUrl} />}
        <script
          // JSON-LD: ProfilePage
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ProfilePage',
              about: {
                '@type': 'Organization',
                name: seo?.sellerName || '',
                url: seo?.shareLink || undefined,
                image: seo?.sellerImageUrl || undefined,
              },
            }),
          }}
        />
        <script
          // JSON-LD: BreadcrumbList
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: hostForLocale(serverLocale) + '/' },
                { '@type': 'ListItem', position: 2, name: 'Sellers', item: hostForLocale(serverLocale) + '/home' },
                { '@type': 'ListItem', position: 3, name: seo?.sellerName || 'Sellers', item: canonical },
              ],
            }),
          }}
        />
      </Head>
      {seo && (
        <section className="mx-auto max-w-2xl px-4 py-6 border-b border-gray-200 dark:border-gray-700" itemScope itemType="https://schema.org/Organization">
          <h1 className="text-2xl font-semibold mb-2" itemProp="name">{seo.sellerName || title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
            {typeof seo.itemsCount === 'number' && (
              <span itemProp="description">{seo.itemsCount} items</span>
            )}
            {seo.shareLink && (
              <a href={seo.shareLink} rel="nofollow noopener" className="underline text-emerald-600 dark:text-emerald-400" itemProp="url">LB profile</a>
            )}
          </div>
          {seo.sellerImageUrl && (
            <div className="mt-3">
              <img src={seo.sellerImageUrl} alt={seo.sellerName || 'Seller'} loading="lazy" className="max-h-64 w-auto rounded" itemProp="image" />
            </div>
          )}
        </section>
      )}
      <Home suppressDefaultHead />
    </>
  );
};

export default SellerIdPage;
