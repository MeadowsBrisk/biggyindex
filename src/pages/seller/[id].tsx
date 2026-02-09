import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetServerSideProps, NextPage } from 'next';
import { useRouter } from 'next/router';
import StandaloneSellerDetail from '@/components/seller/StandaloneSellerDetail';
import SlugPageFooter from '@/components/common/SlugPageFooter';
import SlugPageHeader from '@/components/common/SlugPageHeader';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { useSetAtom } from 'jotai';
import { expandedSellerIdAtom } from '@/store/atoms';
import { fetchSellerDetail } from '@/lib/data/sellerDetails';
import { useTranslations, useLocale } from 'next-intl';
import { buildSellerUrl } from '@/lib/market/routing';
import { hostForLocale } from '@/lib/market/routing';
import { getMarketFromHost, getMarketFromPath, getLocaleForMarket, isHostBasedEnv, localeToOgFormat, HREFLANG_LOCALES, type Market } from '@/lib/market/market';

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
  /** Market codes where this seller has items */
  sellerMarkets: Market[];
}

function parseSellerId(idParam: string | string[] | undefined): number | null {
  if (!idParam) return null;
  const raw = Array.isArray(idParam) ? idParam[0] : idParam;
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export const getServerSideProps: GetServerSideProps<SellerIdPageProps> = async (ctx) => {
  // Cache for 12 hours, serve stale for another 12h while revalidating
  ctx.res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=43200');

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
      const { getAllItems } = await import('@/lib/data/indexData');
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

    // Determine which markets this seller operates in
    let sellerMarkets: Market[] = [];
    try {
      const { getSellers } = await import('@/lib/data/indexData');
      const { MARKETS } = await import('@/lib/market/market');
      const results = await Promise.all(
        MARKETS.map(async (mkt) => {
          try {
            const sellers = await getSellers(mkt);
            const found = sellers.some((s: any) => {
              const id = s.id ?? s.sellerId;
              return id != null && Number(id) === sellerId;
            });
            return found ? mkt : null;
          } catch { return null; }
        })
      );
      sellerMarkets = results.filter((m): m is Market => m !== null);
    } catch (e) {
      console.error('Error determining seller markets:', e);
    }

    // SEO: If this is a non-GB market and the seller has no items here, return 404
    // This prevents Google from indexing English content on localized subdomains
    if (market !== 'GB' && items.length === 0) {
      return { notFound: true };
    }

    const serverLocale = getLocaleForMarket(market);
    const shortLocale = serverLocale.split('-')[0];

    // INJECT TRANSLATION IF AVAILABLE
    // Check if we have a translation for this locale
    if (detail?.translations?.locales?.[serverLocale]?.manifesto) {
      detail.originalManifesto = detail.manifesto; // Backup original
      detail.manifesto = detail.translations.locales[serverLocale].manifesto;
    }

    // Load messages for server-side translation (core only - no home messages needed)
    let messages: Record<string, any> = {};
    try {
      const coreMessages = await import(`@/messages/${serverLocale}/index.json`);
      messages = { ...coreMessages.default };
    } catch {
      const coreMessages = await import('@/messages/en-GB/index.json');
      messages = { ...coreMessages.default };
    }

    const seo: SellerSEO = {
      id: sellerId,
      sellerName: detail.sellerName || null,
      itemsCount: typeof detail.overview?.itemsCount === 'number' ? detail.overview.itemsCount : null,
      sellerImageUrl: detail.sellerImageUrl || detail.imageUrl || null,
      shareLink: detail.share || detail.sellerUrl || null,
    };
    return { props: { seo, detail, items, messages, locale: shortLocale, sellerMarkets } };
  } catch {
    return { notFound: true };
  }
};

const SellerIdPage: NextPage<SellerIdPageProps> = ({ seo, detail, items, locale: serverLocale, sellerMarkets }) => {
  const router = useRouter();
  const setSellerId = useSetAtom(expandedSellerIdAtom);

  const sellerId = parseSellerId(router.query.id);
  const tSP = useTranslations('SellerPage');
  const tCrumbs = useTranslations('Breadcrumbs');

  useEffect(() => {
    // Clear any expanded state since we are on a standalone page
    setSellerId(null);
  }, [setSellerId]);

  const title = seo?.sellerName ? `${seo.sellerName} | Biggy Index` : `Biggy Index`;
  const description = [
    seo?.sellerName || null,
    detail?.manifesto ? detail.manifesto.slice(0, 150).replace(/\s+/g, ' ').trim() + (detail.manifesto.length > 150 ? '...' : '') : null,
    typeof seo?.itemsCount === 'number' ? tSP('itemsListed', { count: seo.itemsCount }) : null,
  ].filter(Boolean).join(' • ');
  const effectiveId = String(seo?.id ?? sellerId ?? '');
  const canonical = buildSellerUrl(effectiveId, serverLocale);
  const altLocales = HREFLANG_LOCALES;

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
                { '@type': 'ListItem', position: 1, name: 'Biggy Index', item: hostForLocale(serverLocale) + '/' },
                { '@type': 'ListItem', position: 2, name: 'Sellers', item: hostForLocale(serverLocale) + '/sellers' },
                { '@type': 'ListItem', position: 3, name: seo?.sellerName || 'Seller', item: canonical },
              ],
            }),
          }}
        />
      </Head>
      <div className="bg-white dark:bg-slate-950 flex flex-col min-h-[100dvh]">
        <SlugPageHeader />
        <Breadcrumbs
          crumbs={[
            { label: tCrumbs('home'), href: '/' },
            { label: tCrumbs('sellers'), href: '/sellers' },
            { label: seo?.sellerName || tCrumbs('sellers') },
          ]}
        />
        <StandaloneSellerDetail detail={detail} sellerId={effectiveId} items={items} />
      </div>
      <SlugPageFooter
        pathSuffix={`/seller/${effectiveId}`}
        availableMarkets={sellerMarkets.length > 0 ? sellerMarkets : undefined}
      />
    </>
  );
};

export default SellerIdPage;
