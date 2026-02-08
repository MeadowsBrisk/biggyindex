import Head from 'next/head';
import type { GetServerSideProps, NextPage } from 'next';
import HeroSection from '@/sections/home/HeroSection';
import WhyItHelpsSection from '@/sections/home/WhyItHelpsSection';
import RecentItemsSection from '@/sections/home/RecentItemsSection';
import RecentReviewsSection from '@/sections/home/RecentReviewsSection';
import SellerLeaderboardSection from '@/sections/home/SellerLeaderboardSection';
import QuickStartSection from '@/sections/home/QuickStartSection';
import RecentMediaSection from '@/sections/home/RecentMediaSection';
import FaqSection from '@/sections/home/FaqSection';
import EmbassySection from '@/sections/home/EmbassySection';
import FooterSection from '@/sections/home/FooterSection';
import { getManifest, getRecentMedia, getRecentReviews, getSnapshotMeta, getSellers, getSellersLeaderboard, getSellerImages, getRecentItemsCompact, getItemImageLookup } from '@/lib/data/indexData';
import { RECENT_REVIEWS_LIMIT } from '@/lib/core/constants';
import { hostForLocale } from '@/lib/market/routing';
import { getLocaleForMarket, getMarketFromHost, getMarketFromPath, isHostBasedEnv, localeToOgFormat, getOgLocaleAlternates, HREFLANG_LOCALES } from '@/lib/market/market';
import { useLocale, useTranslations } from 'next-intl';
import { HomeMessagesProvider } from '@/providers/HomeMessagesProvider';

const RECENT_ITEMS_LIMIT = 25;

// Types for page props
interface CategoryInfo {
  count?: number;
  subcategories?: Record<string, number | { count?: number }>;
}

interface StatsProps {
  items: number | null;
  sellers: number | null;
  lastUpdated: string | null;
  categories: Record<string, CategoryInfo> | null;
}

interface ItemCardLite {
  id: number | string | null;
  refNum: number | string | null;
  name: string;
  sellerName: string;
  sellerId: number | null;
  category: string;
  createdAt: string | null;
  metaLabel: string | null;
  url: string | null;
  imageUrl: string | null;
  sellerImageUrl: string | null;
}

interface RecentItemsProps {
  added: ItemCardLite[];
  updated: ItemCardLite[];
}

interface ReviewLite {
  itemImageUrl: string | null;
  sellerImageUrl: string | null;
  [key: string]: any; // Preserve unknown review fields
}

interface MediaEntryLite {
  id: string | number;
  images: string[];
  sellerName: string;
  rating: number | null;
  daysToArrive: number | null;
  createdAt: string | null;
  itemName: string;
  refNum: string | number | null;
  text: string | null;
}

interface HomeLandingProps {
  stats: StatsProps;
  buildTime: string;
  recentItems: RecentItemsProps;
  recentReviews: ReviewLite[];
  recentMedia: MediaEntryLite[];
  sellersLeaderboard: any;
  sellersIndex: any;
}

// Maps item data (supporting both minified and legacy keys) to card format
function mapItemForCard(item: any, timestamp: string | null, metaLabel: string | null = null): ItemCardLite {
  return {
    id: item.id ?? item.refNum ?? null,
    refNum: item.refNum ?? null,
    // Support minified (n, sn, c, i) and legacy (name, sellerName, category, imageUrl)
    name: item.n ?? item.name ?? 'Untitled',
    sellerName: item.sn ?? item.sellerName ?? 'Unknown seller',
    sellerId: item.sid ?? item.sellerId ?? null,
    category: item.c ?? item.category ?? 'Uncategorised',
    createdAt: timestamp ?? item.fsa ?? item.firstSeenAt ?? item.lua ?? item.lastUpdatedAt ?? null,
    metaLabel,
    url: item.sl ?? item.share ?? item.url ?? null,
    imageUrl: item.i ?? item.imageUrl ?? null,
    sellerImageUrl: null,
  };
}

export async function buildHomeProps(market: string = 'GB') {
  const manifest = await getManifest(market as any);
  const sellers = await getSellers(market as any);
  const snapshotMeta = await getSnapshotMeta(market as any);
  const recentItemsCompact = await getRecentItemsCompact(market as any);
  const itemImageLookup = await getItemImageLookup(market as any);
  const recentReviewsRaw = await getRecentReviews(market as any);
  const recentMediaRaw = await getRecentMedia(market as any);
  const sellersLeaderboardRaw = await getSellersLeaderboard(market as any);
  // getSellerImages currently takes no market argument (global snapshot)
  const sellerImagesMap = await getSellerImages();

  const stats: StatsProps = {
    items: (() => {
      const fromManifest = Number.isFinite(Number((manifest as any)?.totalItems)) ? Number((manifest as any).totalItems) : 0;
      const fromSnapshot = Number.isFinite(Number((snapshotMeta as any)?.itemsCount)) ? Number((snapshotMeta as any).itemsCount) : 0;
      let fromCategories = 0;
      try {
        if ((manifest as any)?.categories && typeof (manifest as any).categories === 'object') {
          for (const [, info] of Object.entries((manifest as any).categories)) {
            const c = typeof info === 'number' ? info : (info && typeof (info as any).count === 'number' ? (info as any).count : 0);
            if (Number.isFinite(c)) fromCategories += c;
          }
        }
      } catch { }
      if (fromManifest > 0) return fromManifest;
      if (fromSnapshot > 0) return fromSnapshot;
      if (fromCategories > 0) return fromCategories;
      return null;
    })(),
    sellers: (() => {
      const fromManifest = Number.isFinite(Number((manifest as any)?.sellersCount)) ? Number((manifest as any).sellersCount) : 0;
      if (fromManifest > 0) return fromManifest;
      const len = Array.isArray(sellers) ? sellers.length : 0;
      if (len > 0) return len;
      return null;
    })(),
    lastUpdated: (snapshotMeta as any)?.updatedAt ?? null,
    categories: (manifest as any)?.categories || null,
  };

  const buildTime = new Date().toISOString();

  const sellerImageEntries: Array<[number, string]> = [];
  for (const [k, v] of Object.entries((sellerImagesMap as any) || {})) {
    const id = Number(k);
    if (Number.isFinite(id) && typeof v === 'string' && v) {
      sellerImageEntries.push([id, v]);
    }
  }
  const sellerImageById = new Map<number, string>(sellerImageEntries);

  const recentItems: RecentItemsProps = {
    // Items now use minified keys directly - mapItemForCard supports both formats
    added: ((recentItemsCompact as any)?.added || [])
      .map((it: any) => mapItemForCard(it, it.createdAt || it.fsa || null, 'added'))
      .slice(0, RECENT_ITEMS_LIMIT),
    updated: ((recentItemsCompact as any)?.updated || [])
      .map((it: any) => mapItemForCard(it, it.createdAt || it.lua || null, 'updated'))
      .slice(0, RECENT_ITEMS_LIMIT),
  };

  for (const list of [recentItems.added, recentItems.updated]) {
    for (const it of list) {
      if (!it || !it.sellerId || it.sellerImageUrl) continue;
      const url = sellerImageById.get(it.sellerId) || null;
      if (url) it.sellerImageUrl = url;
    }
  }
  if (!recentItems.updated.length) {
    recentItems.updated = recentItems.added;
  }

  const imageByRefFromRecent = new Map<string, string>(Object.entries(((itemImageLookup as any)?.byRef || {})) as [string, string][]);
  const imageByIdFromRecent = new Map<string, string>(Object.entries(((itemImageLookup as any)?.byId || {})) as [string, string][]);
  for (const list of [recentItems.added, recentItems.updated]) {
    for (const it of list) {
      if (it?.refNum && it?.imageUrl && !imageByRefFromRecent.has(String(it.refNum))) imageByRefFromRecent.set(String(it.refNum), it.imageUrl);
      if (it?.id && it?.imageUrl && !imageByIdFromRecent.has(String(it.id))) imageByIdFromRecent.set(String(it.id), it.imageUrl);
    }
  }

  const recentReviews: ReviewLite[] = Array.isArray(recentReviewsRaw)
    ? (recentReviewsRaw as any[]).slice(0, RECENT_REVIEWS_LIMIT).map((review) => {
      const ref = (review as any)?.item?.refNum;
      const itemId = (review as any)?.item?.id;
      const imageUrl =
        (review as any)?.item?.imageUrl ||
        (ref != null && imageByRefFromRecent.get(String(ref))) ||
        (itemId != null && imageByIdFromRecent.get(String(itemId))) ||
        null;
      const sellerId = (review as any)?.sellerId ?? (review as any)?.seller?.id ?? null;
      const sellerImageUrl = sellerId ? sellerImageById.get(sellerId) || null : null;
      return {
        ...review,
        itemImageUrl: imageUrl ?? null,
        sellerImageUrl: sellerImageUrl ?? null,
      } as ReviewLite;
    })
    : [];

  const recentMedia: MediaEntryLite[] = Array.isArray(recentMediaRaw)
    ? (recentMediaRaw as any[])
      .slice(0, 40)
      .map((entry, index) => {
        if (!entry || !Array.isArray((entry as any).segments)) return null;
        const textSnippet = (entry as any).segments
          .filter((segment: any) => segment && segment.type === 'text' && typeof segment.value === 'string')
          .map((segment: any) => segment.value)
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        const images = (entry as any).segments
          .filter((segment: any) => segment && segment.type === 'image' && segment.url)
          .map((segment: any) => segment.url)
          .filter(Boolean) as string[];
        if (!images.length) return null;
        return {
          id: (entry as any).id ?? `media-${index}`,
          images,
          sellerName: (entry as any).sellerName || 'Unknown seller',
          rating: typeof (entry as any).rating === 'number' ? (entry as any).rating : null,
          daysToArrive: Number.isFinite((entry as any).daysToArrive) ? (entry as any).daysToArrive : null,
          createdAt: (entry as any).created ? new Date((entry as any).created * 1000).toISOString() : null,
          itemName: (entry as any).item?.name || 'Unknown item',
          refNum: (entry as any).item?.refNum || null,
          text: textSnippet || null,
        } as MediaEntryLite;
      })
      .filter(Boolean) as MediaEntryLite[]
    : [];

  return {
    props: {
      stats,
      buildTime,
      recentItems,
      recentReviews,
      recentMedia,
      sellersLeaderboard: sellersLeaderboardRaw ?? null,
      sellersIndex: sellers ?? null,
    },
    revalidate: 2400, // 40 min safety net (on-demand revalidation handles freshness)
  };
}

const HomeLanding: NextPage<HomeLandingProps> = ({ stats, buildTime, recentItems, recentReviews, recentMedia, sellersLeaderboard, sellersIndex }) => {
  const locale = useLocale();
  const origin = hostForLocale(locale);
  const tMeta = useTranslations('Meta');
  const tHome = useTranslations('Home');

  // Build FAQ schema from translations (supports DE, FR, PT, IT)
  const faqAbout = tHome.raw('faq.about') as Array<{ q: string; a: string }> || [];
  const faqCrypto = tHome.raw('faq.crypto') as Array<{ q: string; a: string }> || [];
  const allFaqItems = [...faqAbout, ...faqCrypto];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Biggy Index',
    url: origin,
    inLanguage: locale,
  };

  // Generate FAQ schema from translated content
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale,
    mainEntity: allFaqItems.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
  const webPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: tMeta('homeTitle'),
    description: tMeta('homeDescription'),
    dateModified: buildTime,
    url: `${origin}/home`,
    inLanguage: locale,
  };

  return (
    <>
      <Head>
        <title>{tMeta('homeTitle')}</title>
        <meta name="description" content={tMeta('homeDescription')} />
        <link rel="canonical" href={`${origin}/home`} />
        {HREFLANG_LOCALES.map(l => (
          <link key={l} rel="alternate" href={`${hostForLocale(l)}/home`} hrefLang={l} />
        ))}
        <link rel="alternate" href={`${hostForLocale('en')}/home`} hrefLang="x-default" />
        <meta property="og:title" content={tMeta('homeTitle')} />
        <meta property="og:description" content={tMeta('homeDescription')} />
        <meta property="og:url" content={`${origin}/home`} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Biggy Index" />
        <meta property="og:image" content={`${origin}/og-image.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Biggy Index - Browse LittleBiggy with filters" />
        <meta property="og:locale" content={localeToOgFormat(locale)} />
        {getOgLocaleAlternates(locale).map(ogLoc => (
          <meta key={ogLoc} property="og:locale:alternate" content={ogLoc} />
        ))}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${origin}/og-image.png`} />
        <meta name="twitter:title" content={tMeta('homeTitle')} />
        <meta name="twitter:description" content={tMeta('homeDescription')} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      </Head>
      <HomeMessagesProvider>
        <main className="min-h-screen bg-white text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-white">
          <HeroSection stats={stats} />
          <RecentItemsSection items={recentItems} />
          {/* <WhyItHelpsSection /> */}
          <QuickStartSection />
          <RecentReviewsSection reviews={recentReviews} />
          <RecentMediaSection mediaEntries={recentMedia} />
          <SellerLeaderboardSection leaderboard={sellersLeaderboard} sellersIndex={sellersIndex} />
          <EmbassySection />
          <FaqSection />
          <FooterSection lastCrawlTime={stats?.lastUpdated || null} buildTime={buildTime} />
        </main>
      </HomeMessagesProvider>
    </>
  );
};

export default HomeLanding;

// Per-market SSR to ensure correct data on subdomains and path-based locales
export const getServerSideProps: GetServerSideProps<HomeLandingProps> = async (ctx) => {
  try {
    const host = String(ctx.req?.headers?.host || '');
    const path = String((ctx.resolvedUrl || ctx.req?.url || '/'));
    const market = isHostBasedEnv(host) ? getMarketFromHost(host) : getMarketFromPath(path);
    const locale = getLocaleForMarket(market);
    const result = await buildHomeProps(market);

    // Load messages at SSR time to prevent translation flash (same pattern as index.tsx)
    // Must load both core (index.json) and home-specific (home.json) messages
    let messages: Record<string, any> = {};
    try {
      const coreMessages = (await import(`../messages/${locale}/index.json`)).default;
      const homeMessages = (await import(`../messages/${locale}/home.json`)).default;
      messages = { ...coreMessages, ...homeMessages };
    } catch {
      // Fallback to English if locale messages fail to load
      try {
        const coreMessages = (await import(`../messages/en-GB/index.json`)).default;
        const homeMessages = (await import(`../messages/en-GB/home.json`)).default;
        messages = { ...coreMessages, ...homeMessages };
      } catch { }
    }

    // buildHomeProps returns { props, revalidate } for SSG compatibility; we just return props here
    return { props: { ...result.props, messages } as any };
  } catch {
    const result = await buildHomeProps('GB');
    // Fallback: load English messages
    let messages: Record<string, any> = {};
    try {
      const coreMessages = (await import(`../messages/en-GB/index.json`)).default;
      const homeMessages = (await import(`../messages/en-GB/home.json`)).default;
      messages = { ...coreMessages, ...homeMessages };
    } catch { }
    return { props: { ...result.props, messages } as any };
  }
};
