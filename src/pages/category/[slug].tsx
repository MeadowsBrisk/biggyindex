import React, { useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import { hostForLocale } from '@/lib/market/routing';
import { localeToMarket, localeToOgFormat, getOgLocaleAlternates, getLocaleForMarket, HREFLANG_LOCALES, MARKETS } from '@/lib/market/market';
import { catKeyForManifest, safeTranslate, subKeyForManifest } from '@/lib/taxonomy/taxonomyLabels';
import { formatUSD, type DisplayCurrency, type ExchangeRates } from '@/lib/pricing/priceDisplay';
import { relativeCompact } from '@/lib/ui/relativeTimeCompact';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { proxyImage } from '@/lib/ui/images';
import AnimatedLogoHeader from '@/components/layout/AnimatedLogoHeader';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import LocaleSelector from '@/components/layout/LocaleSelector';
import ToastHost from '@/components/common/ToastHost';
import { useLocale, useDisplayCurrency } from '@/providers/IntlProvider';
import { LOCALE_LINKS } from '@/lib/market/localeLinks';
import cn from '@/lib/core/cn';

// Category slugs that have landing pages (English, used across all markets)
const CATEGORY_SLUGS = ['flower', 'hash', 'prerolls', 'vapes', 'edibles', 'concentrates', 'psychedelics', 'tincture', 'other'];

// Tabs for featured sections
const TABS = [
  { key: 'hottest', label: 'hottest' },
  { key: 'updated', label: 'recentlyUpdated' },
] as const;

type CategoryPageProps = {
  slug: string;
  items: any[];
  manifest: any;
  snapshotMeta: any | null;
};

export const getStaticPaths: GetStaticPaths = async () => {
  // Generate paths for all categories across all locales
  const locales = MARKETS.map(getLocaleForMarket);
  const paths: { params: { slug: string }; locale: string }[] = [];

  for (const locale of locales) {
    for (const slug of CATEGORY_SLUGS) {
      paths.push({ params: { slug }, locale });
    }
  }

  return {
    paths,
    fallback: 'blocking', // ISR for any new categories
  };
};

export const getStaticProps: GetStaticProps<CategoryPageProps> = async (context) => {
  const slug = context.params?.slug as string;
  const locale = context.locale || 'en-GB';
  const market = localeToMarket(locale);

  // Validate slug
  if (!slug || !CATEGORY_SLUGS.includes(slug.toLowerCase())) {
    return { notFound: true };
  }

  try {
    const { getCategoryItems, getManifest, getSnapshotMeta } = await import('@/lib/data/indexData');

    // Load messages for SSR
    const messagesModule = await import(`../../messages/${locale}/index.json`);
    const messages = messagesModule.default;

    // Fetch category items and manifest
    const [rawItems, manifest, meta] = await Promise.all([
      getCategoryItems(slug, market as any),
      getManifest(market as any),
      getSnapshotMeta(market as any),
    ]);

    const items = rawItems || [];
    const hasData = items.length > 0;

    return {
      props: {
        slug: slug.toLowerCase(),
        items,
        manifest,
        snapshotMeta: meta,
        messages,
      },
      revalidate: hasData ? 2400 : 60, // 40 min safety net (on-demand revalidation handles freshness)
    };
  } catch (e) {
    console.error('[Category ISR] Failed to fetch data:', e);
    
    // Load fallback messages
    let messages = {};
    try {
      messages = (await import(`../../messages/${locale}/index.json`)).default;
    } catch {}

    return {
      props: {
        slug: slug.toLowerCase(),
        items: [],
        manifest: { categories: {}, totalItems: 0 },
        snapshotMeta: null,
        messages,
      },
      revalidate: 60,
    };
  }
};

export default function CategoryPage({ slug, items, manifest, snapshotMeta }: CategoryPageProps) {
  const { locale } = useLocale();
  const tMeta = useTranslations('Meta');
  const tCats = useTranslations('Categories');
  const tCatPage = useTranslations('CategoryPage');
  const tCrumbs = useTranslations('Breadcrumbs');
  const tItem = useTranslations('Item');
  const tRel = useTranslations('Rel');
  const rates = useExchangeRates();
  const { currency } = useDisplayCurrency();
  const displayCurrency: DisplayCurrency = (currency as DisplayCurrency) || 'GBP';

  // Tab state for featured items carousel
  const [activeTab, setActiveTab] = useState<'hottest' | 'updated'>('hottest');
  const [swiperBeginning, setSwiperBeginning] = useState(true);
  const [swiperEnd, setSwiperEnd] = useState(false);

  // Get translated category name
  const categoryKey = catKeyForManifest(slug);
  const categoryName = safeTranslate(tCats, categoryKey) || slug;

  // Get stats from manifest
  const categoryStats = manifest?.categories?.[slug] || manifest?.categories?.[categoryKey] || {};
  const itemCount = categoryStats.count || items.length || 0;
  const subcategories = Object.keys(categoryStats.subs || {});

  // Calculate price range from items and format in display currency
  const priceRange = useMemo(() => {
    if (!items.length) return { min: 0, max: 0, formatted: '' };
    let min = Infinity;
    let max = 0;
    for (const item of items) {
      const uMin = item.uMin ?? item.price ?? 0;
      const uMax = item.uMax ?? item.price ?? 0;
      if (uMin > 0 && uMin < min) min = uMin;
      if (uMax > max) max = uMax;
    }
    const minVal = min === Infinity ? 0 : min;
    const formatted = minVal > 0 ? formatUSD(minVal, displayCurrency, rates, { decimals: 0 }) : '';
    return { min: minVal, max, formatted };
  }, [items, displayCurrency, rates]);

  // Sort items for featured sections (12 items each for carousel)
  const hottestItems = useMemo(() => {
    return [...items]
      .filter((i) => typeof i.h === 'number')
      .sort((a, b) => (b.h || 0) - (a.h || 0))
      .slice(0, 12);
  }, [items]);

  const recentlyUpdatedItems = useMemo(() => {
    return [...items]
      .filter((i) => i.lua)
      .sort((a, b) => new Date(b.lua).getTime() - new Date(a.lua).getTime())
      .slice(0, 12);
  }, [items]);

  // Current carousel items based on active tab
  const carouselItems = activeTab === 'hottest' ? hottestItems : recentlyUpdatedItems;

  // Related categories (all except current)
  const relatedCategories = CATEGORY_SLUGS.filter((s) => s !== slug);

  // SEO metadata
  const pageTitle = tMeta('categoryTitle', { category: categoryName, count: itemCount });
  const pageDescription = tMeta('categoryDescription', { category: categoryName, count: itemCount });
  const canonicalUrl = `${hostForLocale(locale)}/category/${slug}`;

  // JSON-LD structured data
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Biggy Index',
        item: hostForLocale(locale),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: categoryName,
        item: canonicalUrl,
      },
    ],
  };

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: categoryName,
    description: pageDescription,
    url: canonicalUrl,
    numberOfItems: itemCount,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: itemCount,
      itemListElement: hottestItems.slice(0, 5).map((item, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: item.n || 'Item',
        url: `${hostForLocale(locale)}/?ref=${encodeURIComponent(item.refNum || item.ref || item.id)}`,
      })),
    },
  };

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonicalUrl} />

        {/* hreflang for all markets */}
        {HREFLANG_LOCALES.map((l) => (
          <link key={l} rel="alternate" href={`${hostForLocale(l)}/category/${slug}`} hrefLang={l} />
        ))}
        <link rel="alternate" href={`${hostForLocale('en')}/category/${slug}`} hrefLang="x-default" />

        {/* Open Graph */}
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Biggy Index" />
        <meta property="og:locale" content={localeToOgFormat(locale || 'en-GB')} />
        {getOgLocaleAlternates(locale || 'en-GB').map((ogLoc) => (
          <meta key={ogLoc} property="og:locale:alternate" content={ogLoc} />
        ))}

        {/* Twitter */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />

        {/* JSON-LD */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      </Head>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <AnimatedLogoHeader
          rightSlot={
            <div className="flex items-center gap-2">
              <LocaleSelector />
            </div>
          }
        />
        <ToastHost />

        {/* Breadcrumb */}
        <Breadcrumbs
          crumbs={[
            { label: tCrumbs('home'), href: '/' },
            { label: categoryName },
          ]}
        />

        {/* Category Header - Two column layout */}
        <header className="mb-10 grid gap-8 lg:grid-cols-2 lg:items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">{categoryName}</h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300 sm:text-xl">
              {tCatPage('itemsAvailable', { count: itemCount })}
              {priceRange.formatted && (
                <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                  {tCatPage('pricesFrom', { price: priceRange.formatted })}
                </span>
              )}
            </p>
            <div className="mt-6">
              <Link
                href={`/?cat=${slug}`}
                className="group inline-flex items-center gap-2 rounded-full bg-emerald-500/90 hover:bg-emerald-500 text-white px-5 py-2.5 text-sm font-semibold tracking-wide transition-all backdrop-blur-md focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-300"
              >
                <span>{tCatPage('browseItems')}</span>
                <span className="inline-block text-lg leading-none transition-transform duration-300 ease-out group-hover:translate-x-1">→</span>
              </Link>
            </div>
          </div>
          
          {/* SEO Intro Text */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50">
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {safeTranslate(tCatPage, `intro.${slug}`) || tCatPage('intro.default', { category: categoryName, count: itemCount })}
            </p>
            {subcategories.length > 0 && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                {tCatPage('intro.subcategoriesInclude')}: {subcategories.slice(0, 5).map((sub) => safeTranslate(tCats, `subs.${sub.toLowerCase()}`) || sub).join(', ')}{subcategories.length > 5 ? ` +${subcategories.length - 5} ${tCatPage('intro.more')}` : ''}
              </p>
            )}
          </div>
        </header>

        {/* Subcategory Chips */}
        {subcategories.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">{tCatPage('subcategories')}</h2>
            <div className="flex flex-wrap gap-2">
              {subcategories.map((sub) => {
                const subLabel = safeTranslate(tCats, `subs.${sub.toLowerCase()}`) || sub;
                return (
                  <Link
                    key={sub}
                    href={`/?cat=${slug}&sub=${encodeURIComponent(sub)}`}
                    className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-emerald-500 hover:text-emerald-600 transition-colors dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-emerald-400 dark:hover:text-emerald-400"
                  >
                    {subLabel}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Featured Items Carousel with Tabs */}
        {carouselItems.length > 0 && (
          <section className="mb-12">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {tCatPage('featured')}
              </h2>
              <div className="flex items-center gap-3">
                {TABS.map((tab) => {
                  const isActive = tab.key === activeTab;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        "rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70",
                        isActive
                          ? "bg-emerald-500 text-slate-950 shadow shadow-emerald-500/40"
                          : "border border-gray-300 text-gray-600 hover:border-emerald-400/60 hover:text-emerald-600 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                      )}
                    >
                      {tCatPage(`tabs.${tab.label}`)}
                    </button>
                  );
                })}
                <div className="ml-2 hidden items-center gap-2 lg:flex">
                  <button
                    type="button"
                    disabled={swiperBeginning}
                    className={cn(
                      "cat-carousel-prev rounded-full border p-2.5 shadow-sm transition",
                      swiperBeginning
                        ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-white/30"
                        : "border-gray-300 bg-white text-gray-600 hover:border-emerald-400/60 hover:text-emerald-500 dark:border-white/20 dark:bg-white/10 dark:text-white"
                    )}
                    aria-label="Previous"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    disabled={swiperEnd}
                    className={cn(
                      "cat-carousel-next rounded-full border p-2.5 shadow-sm transition",
                      swiperEnd
                        ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-white/30"
                        : "border-gray-300 bg-white text-gray-600 hover:border-emerald-400/60 hover:text-emerald-500 dark:border-white/20 dark:bg-white/10 dark:text-white"
                    )}
                    aria-label="Next"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.28, ease: [0.25, 0.8, 0.25, 1] }}
              >
                <Swiper
                  modules={[Navigation]}
                  navigation={{
                    nextEl: '.cat-carousel-next',
                    prevEl: '.cat-carousel-prev',
                  }}
                  slidesPerView={2}
                  spaceBetween={16}
                  breakpoints={{
                    640: { slidesPerView: 3, spaceBetween: 16 },
                    768: { slidesPerView: 4, spaceBetween: 20 },
                    1024: { slidesPerView: 5, spaceBetween: 20 },
                    1280: { slidesPerView: 6, spaceBetween: 24 },
                  }}
                  onSwiper={(swiper) => {
                    setSwiperBeginning(swiper.isBeginning);
                    setSwiperEnd(swiper.isEnd);
                  }}
                  onSlideChange={(swiper) => {
                    setSwiperBeginning(swiper.isBeginning);
                    setSwiperEnd(swiper.isEnd);
                  }}
                >
                  {carouselItems.map((item) => (
                    <SwiperSlide key={item.refNum || item.ref || item.id}>
                      <FeaturedItemCard item={item} rates={rates} displayCurrency={displayCurrency} tItem={tItem} tRel={tRel} />
                    </SwiperSlide>
                  ))}
                </Swiper>
              </motion.div>
            </AnimatePresence>
          </section>
        )}

        {/* Related Categories */}
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">{tCatPage('relatedCategories')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {relatedCategories.map((cat) => {
              const catLabel = safeTranslate(tCats, catKeyForManifest(cat)) || cat;
              const catStats = manifest?.categories?.[cat] || {};
              return (
                <Link
                  key={cat}
                  href={`/category/${cat}`}
                  className="group rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-emerald-500 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-emerald-400"
                >
                  <h3 className="font-semibold text-gray-900 group-hover:text-emerald-600 dark:text-white dark:group-hover:text-emerald-400">
                    {catLabel}
                  </h3>
                  {catStats.count && (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {catStats.count} {tCatPage('items')}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 border-t border-gray-200 pt-8 dark:border-gray-700">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-gray-500 dark:text-gray-400">{tCatPage('footer.description')}</p>
            <div className="flex items-center gap-4">
              <Link href="/" className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">
                {tCatPage('footer.browseAll')}
              </Link>
              <Link href="/home" className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">
                {tCatPage('footer.aboutUs')}
              </Link>
            </div>
          </div>
          
          {/* Language selector - flag pills like /home */}
          <div className="mt-8 flex flex-col items-center gap-3">
            <span className="text-xs uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
              {tCatPage('footer.alsoAvailable')}
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {LOCALE_LINKS.map(({ code, href, label, Flag }) => (
                <a
                  key={code}
                  href={`${href}/category/${slug}`}
                  className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-emerald-400/50 hover:bg-emerald-50 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-emerald-400/50 dark:hover:bg-gray-700 dark:hover:text-emerald-400"
                  hrefLang={code}
                >
                  <Flag className="h-4 w-4 rounded-sm" />
                  <span>{label}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
            © {new Date().getFullYear()} Biggy Index
          </div>
        </footer>
      </main>
    </>
  );
}

// Featured item card with seller info and proper currency
function FeaturedItemCard({ 
  item, 
  rates, 
  displayCurrency, 
  tItem,
  tRel 
}: { 
  item: any; 
  rates: ExchangeRates; 
  displayCurrency: DisplayCurrency;
  tItem: any;
  tRel: any;
}) {
  const name = item.n || 'Item';
  const description = item.d || '';
  const imageUrl = item.i || null;
  const sellerName = item.sn || null;
  const refNum = item.refNum || item.ref || String(item.id);
  const priceMin = item.uMin ?? item.price ?? null;
  const priceMax = item.uMax ?? null;
  const lastUpdated = item.lua ? relativeCompact(item.lua, tRel) : null;
  
  // Format price in display currency
  const priceDisplay = (typeof priceMin === 'number' && priceMin > 0)
    ? formatUSD(priceMin, displayCurrency, rates, { decimals: 2 })
    : null;
  
  const hasVariants = priceMax && priceMax > priceMin;

  return (
    <Link
      href={`/item/${encodeURIComponent(refNum)}`}
      className="group block h-full overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-emerald-500 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:hover:border-emerald-400"
    >
      <div className="aspect-square overflow-hidden bg-gray-100 dark:bg-gray-900">
        {imageUrl ? (
          <img
            src={proxyImage(imageUrl, 300)}
            alt={name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400 dark:text-gray-500">
            {tItem('noImage')}
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white leading-snug min-h-[2.5em]" title={name}>
          {name}
        </h3>
        {description && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
            {description}
          </p>
        )}
        {sellerName && (
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 truncate">
            {sellerName}
          </p>
        )}
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-1">
            {priceDisplay ? (
              <>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{priceDisplay}</span>
                {hasVariants && <span className="text-xs text-gray-400">+</span>}
              </>
            ) : (
              <span className="text-sm text-gray-400">--</span>
            )}
          </div>
          {lastUpdated && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">{lastUpdated}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
