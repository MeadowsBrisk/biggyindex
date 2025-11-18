import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetServerSideProps, NextPage } from 'next';
import { useRouter } from 'next/router';
import StandaloneSellerDetail from '@/components/StandaloneSellerDetail';
import { useSetAtom } from 'jotai';
import { expandedSellerIdAtom } from '@/store/atoms';
import { fetchSellerDetail } from '@/lib/sellerDetails';
import { useTranslations, useLocale } from 'next-intl';
import { buildSellerUrl } from '@/lib/routing';
import { hostForLocale } from '@/lib/routing';
import { getMarketFromHost, getMarketFromPath, getLocaleForMarket, isHostBasedEnv, localeToOgFormat } from '@/lib/market';

interface SellerSEO {
  id: number;
  sellerName?: string | null;
  itemsCount?: number | null;
  sellerImageUrl?: string | null;
  shareLink?: string | null;
}

interface SellerIdPageProps {
  seo: SellerSEO | null;
  detail: any | null;
  items: any[];
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
    
    const detail = await fetchSellerDetail(sellerId);
    if (!detail) return { notFound: true };

    // Fetch items for this seller
    let items: any[] = [];
    try {
      const { getAllItems } = await import('@/lib/indexData');
      const all = await getAllItems(market);
      // Filter by seller ID (or name if ID missing in item, but ID is safer)
      // Items usually have `sellerId` or `s` (minified) or `seller: { id }`
      // The unified crawler output usually has `sellerId` or `sid` or `seller` object.
      // Let's check a few properties.
      items = all.filter((it: any) => {
        const sId = it.sellerId || (it.seller && it.seller.id) || it.sid;
        if (sId) return Number(sId) === sellerId;
        // Fallback to name match if needed, but ID is preferred
        return false;
      });
    } catch (e) {
      console.error('Error fetching seller items:', e);
    }

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
      id: sellerId,
      sellerName: detail.sellerName || null,
      itemsCount: typeof detail.overview?.itemsCount === 'number' ? detail.overview.itemsCount : null,
      sellerImageUrl: detail.sellerImageUrl || detail.imageUrl || null,
      shareLink: detail.share || detail.sellerUrl || null,
    };
    return { props: { seo, detail, items, messages, locale: shortLocale } };
  } catch {
    return { notFound: true };
  }
};

const SellerIdPage: NextPage<SellerIdPageProps> = ({ seo, detail, items, locale: serverLocale }) => {
  const router = useRouter();
  const setSellerId = useSetAtom(expandedSellerIdAtom);

  const sellerId = parseSellerId(router.query.id);

  useEffect(() => {
    // Clear any expanded state since we are on a standalone page
    setSellerId(null);
  }, [setSellerId]);

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
        <meta property="og:type" content="profile" />
        <meta property="og:site_name" content="Biggy Index" />
        <meta property="og:locale" content={localeToOgFormat(serverLocale)} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        {description && <meta name="twitter:description" content={description} />}
        {seo?.sellerImageUrl && <meta property="og:image" content={seo.sellerImageUrl} />}
        {seo?.sellerImageUrl && <meta name="twitter:image" content={seo.sellerImageUrl} />}
        <script
          // JSON-LD: ProfilePage
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ProfilePage',
              mainEntity: {
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
      <StandaloneSellerDetail detail={detail} sellerId={effectiveId} items={items} />
    </>
  );
};

export default SellerIdPage;
