import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetServerSideProps, NextPage } from 'next';
import { useRouter } from 'next/router';
import StandaloneItemDetail from '@/components/item/StandaloneItemDetail';
import SlugPageFooter from '@/components/common/SlugPageFooter';
import SlugPageHeader from '@/components/common/SlugPageHeader';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { useSetAtom } from 'jotai';
import { expandedRefNumAtom } from '@/store/atoms';
import { fetchItemDetail } from '@/lib/data/itemDetails';
import { useTranslations, useLocale } from 'next-intl';
import { buildItemUrl, hostForLocale } from '@/lib/market/routing';
import { getMarketFromHost, getMarketFromPath, getLocaleForMarket, isHostBasedEnv, localeToOgFormat, HREFLANG_LOCALES, type Market } from '@/lib/market/market';
import { translateCategoryAndSubs } from '@/lib/taxonomy/taxonomyLabels';

interface ItemSEO {
  ref: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  sellerName?: string | null;
  price?: number | null;
  currency?: string | null;
  url?: string | null;
  reviewsCount?: number | null;
  reviewsRating?: number | null;
}

interface ItemRefPageProps {
  seo: ItemSEO | null;
  detail: any | null;
  messages: Record<string, any>;
  locale: string;
  market: string;
  /** True when item was once available in this market but is no longer in the live index */
  unavailable?: boolean;
}

export const getServerSideProps: GetServerSideProps<ItemRefPageProps> = async (ctx) => {
  // Cache for 12 hours, serve stale for another 12h while revalidating
  ctx.res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=43200');

  try {
    const ref = typeof ctx.params?.ref === 'string' ? ctx.params.ref : null;
    if (!ref) return { notFound: true };

    // Derive market and locale from host or path for proper SEO meta
    const host = ctx.req.headers.host || '';
    const pathname = ctx.resolvedUrl || '/';
    const market = isHostBasedEnv(host) ? getMarketFromHost(host) : getMarketFromPath(pathname);
    const serverLocale = getLocaleForMarket(market);
    const shortLocale = serverLocale.split('-')[0];

    const detail = await fetchItemDetail(ref, market);
    if (!detail) return { notFound: true };

    // SEO: Determine item availability in this market.
    // Shipping data exists = item was once indexed for this market.
    // _markets includes current market = item is currently in the live index.
    const hasShippingData = !!detail._foundInMarketIndex;
    const inMarketsList = Array.isArray(detail._markets) && detail._markets.includes(market);
    if (!hasShippingData && !inMarketsList) {
      // Never available in this market → 404
      return { notFound: true };
    }
    // Was available but no longer in live index → serve page with unavailable banner
    const unavailable = hasShippingData && !inMarketsList;

    // Load messages for server-side translation (core only - no home messages needed)
    let messages: Record<string, any> = {};
    try {
      const coreMessages = await import(`@/messages/${serverLocale}/index.json`);
      messages = { ...coreMessages.default };
    } catch {
      const coreMessages = await import('@/messages/en-GB/index.json');
      messages = { ...coreMessages.default };
    }

    const seo: ItemSEO = {
      ref: String(detail.refNum || detail.ref || ref),
      name: detail.name || '',
      description: detail.descriptionTranslated || detail.descriptionFull || detail.description || null,
      imageUrl: detail.imageUrl || (detail.imageUrls && detail.imageUrls[0]) || null,
      sellerName: detail.sellerName || (detail.seller && detail.seller.name) || null,
      price: detail.price || null,
      currency: detail.currency || null,
      url: detail.url || detail.share?.shortLink || null,
      reviewsCount: detail.reviewsCount || (detail.reviews ? detail.reviews.length : null),
      reviewsRating: detail.reviewsRating || null,
    };
    // Sanitize detail object: JSON round-trip converts undefined to null (Next.js requires serializable props)
    const sanitizedDetail = JSON.parse(JSON.stringify(detail));
    return { props: { seo, detail: sanitizedDetail, messages, locale: shortLocale, market, ...(unavailable ? { unavailable: true } : {}) } };
  } catch {
    return { notFound: true };
  }
};

const ItemRefPage: NextPage<ItemRefPageProps> = ({ seo, detail, locale: serverLocale, market, unavailable }) => {
  const router = useRouter();
  const setExpanded = useSetAtom(expandedRefNumAtom);
  const tReviews = useTranslations('Reviews');
  const tCrumbs = useTranslations('Breadcrumbs');
  const tCats = useTranslations('Categories');
  const ref = typeof router.query.ref === 'string' ? router.query.ref : null;

  useEffect(() => {
    // Clear any expanded state since we are on a standalone page
    setExpanded(null);
  }, [setExpanded]);

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

  // BUG-015: Only emit hreflang for markets where the item actually exists.
  // _markets comes from shared R2 data (set during items crawler from presenceById).
  // Convert market codes (GB, DE, FR...) → hreflang locale codes (en-gb, de-de, fr-fr...).
  const itemMarkets: string[] = Array.isArray(detail?._markets) ? detail._markets : [];
  const marketToHreflang = (m: string) => getLocaleForMarket(m as any).toLowerCase();
  const confirmedLocales = new Set(itemMarkets.map(marketToHreflang));
  // Always include current market (we served a 200, so it exists here)
  confirmedLocales.add(getLocaleForMarket(market as Market).toLowerCase());
  const hreflangLocales = HREFLANG_LOCALES.filter(l => confirmedLocales.has(l));
  // x-default: prefer en-gb if item is in GB, otherwise use current locale
  const xDefaultLocale = confirmedLocales.has('en-gb') ? 'en-gb' : getLocaleForMarket(market as Market).toLowerCase();

  return (
    <>
      <Head>
        <title>{title}</title>
        {desc && <meta name="description" content={desc} />}
        {desc && <meta property="og:description" content={desc} />}
        <meta property="og:title" content={title} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Biggy Index" />
        <meta property="og:locale" content={localeToOgFormat(serverLocale)} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        {desc && <meta name="twitter:description" content={desc} />}
        {seo?.imageUrl && <meta name="twitter:image" content={seo.imageUrl} />}
        <link rel="canonical" href={canonical} />
        {hreflangLocales.map(l => (
          <link key={l} rel="alternate" href={buildItemUrl(effectiveRef, l)} hrefLang={l} />
        ))}
        <link rel="alternate" href={buildItemUrl(effectiveRef, xDefaultLocale)} hrefLang="x-default" />
        {seo?.imageUrl && <meta property="og:image" content={seo.imageUrl} />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebPage',
              name: seo?.name || '',
              description: desc || '',
              url: canonical,
              inLanguage: serverLocale,
              mainEntity: {
                '@type': 'Thing',
                name: seo?.name || '',
                description: desc || '',
                image: seo?.imageUrl || undefined,
                ...(seo?.sellerName && {
                  provider: {
                    '@type': 'Organization',
                    name: seo.sellerName,
                  },
                }),
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
                { '@type': 'ListItem', position: 1, name: 'Home', item: hostForLocale(serverLocale) + '/home' },
                { '@type': 'ListItem', position: 2, name: 'Items', item: hostForLocale(serverLocale) + '/' },
                ...(detail?.c ? [{ '@type': 'ListItem', position: 3, name: detail.c, item: hostForLocale(serverLocale) + '/category/' + encodeURIComponent(String(detail.c).toLowerCase()) }] : []),
                { '@type': 'ListItem', position: detail?.c ? 4 : 3, name: seo?.name || 'Item', item: canonical },
              ],
            }),
          }}
        />
      </Head>
      <div className="bg-white dark:bg-slate-950 flex flex-col min-h-[100dvh]">
        <SlugPageHeader />
        <Breadcrumbs
          crumbs={[
            { label: tCrumbs('home'), href: '/home' },
            { label: tCrumbs('items'), href: '/' },
            ...(detail?.c ? [{ label: (() => { const labels = translateCategoryAndSubs({ tCats, category: detail.c, subcategories: [] }); return labels[0] || detail.c; })(), href: `/category/${encodeURIComponent(String(detail.c).toLowerCase())}` }] : []),
            { label: seo?.name || tCrumbs('items') },
          ]}
        />
        <StandaloneItemDetail baseItem={detail} detail={detail} unavailable={unavailable} market={market} />
      </div>
      <SlugPageFooter
        pathSuffix={`/item/${effectiveRef}`}
        availableMarkets={itemMarkets.length > 0 ? itemMarkets : undefined}
      />
    </>
  );
};

export default ItemRefPage;

