import Head from 'next/head';
import type { GetStaticProps, NextPage } from 'next';
import HeroSection from '@/sections/home/HeroSection';
import WhyItHelpsSection from '@/sections/home/WhyItHelpsSection';
import RecentItemsSection from '@/sections/home/RecentItemsSection';
import RecentReviewsSection from '@/sections/home/RecentReviewsSection';
import SellerLeaderboardSection from '@/sections/home/SellerLeaderboardSection';
import QuickStartSection from '@/sections/home/QuickStartSection';
import RecentMediaSection from '@/sections/home/RecentMediaSection';
import FaqSection from '@/sections/home/FaqSection';
import FooterSection from '@/sections/home/FooterSection';
import { getManifest, getRecentMedia, getRecentReviews, getSnapshotMeta, getSellers, getSellersLeaderboard, getSellerImages, getRecentItemsCompact, getItemImageLookup } from '@/lib/indexData';
import { RECENT_REVIEWS_LIMIT } from '@/lib/constants';
import { hostForLocale } from '@/lib/routing';
import { getLocaleForMarket } from '@/lib/market';

const RECENT_ITEMS_LIMIT = 25;

// Types for page props
interface StatsProps {
  items: number | null;
  sellers: number | null;
  lastUpdated: string | null;
  categories: Record<string, unknown> | null;
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

function mapItemForCard(item: any, timestamp: string | null): ItemCardLite {
  return {
    id: item.id ?? item.refNum ?? null,
    refNum: item.refNum ?? null,
    name: item.name ?? 'Untitled',
    sellerName: item.sellerName ?? 'Unknown seller',
    sellerId: item.sellerId ?? null,
    category: item.category ?? 'Uncategorised',
    createdAt: timestamp ?? item.firstSeenAt ?? item.lastUpdatedAt ?? null,
    metaLabel: null,
    url: item.share ?? item.url ?? null,
    imageUrl: item.imageUrl ?? null,
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
      } catch {}
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
    added: ((recentItemsCompact as any)?.added || [])
      .map((it: any) => mapItemForCard(it, it.createdAt || null))
      .slice(0, RECENT_ITEMS_LIMIT),
    updated: ((recentItemsCompact as any)?.updated || [])
      .map((it: any) => mapItemForCard(it, it.createdAt || null))
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
    revalidate: 900,
  };
}

export const getStaticProps: GetStaticProps<HomeLandingProps> = async () => {
  return buildHomeProps('GB');
};

const HomeLanding: NextPage<HomeLandingProps> = ({ stats, buildTime, recentItems, recentReviews, recentMedia, sellersLeaderboard, sellersIndex }) => {
  const locale = getLocaleForMarket('GB');
  const origin = hostForLocale(locale);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Biggy Index',
    url: origin,
    inLanguage: locale,
  };
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is the Biggy Index?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The Biggy Index provides an easier way to browse the LittleBiggy marketplace, with item categorisation, additional sorting options, and other handy tools tailored for UK shoppers.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do you sell or ship items?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. Biggy Index is read-only and sends you back to LittleBiggy to complete your order.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do I buy Bitcoin in the UK?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Most buyers use Revolut, Monzo, Kraken, or Coinbase. Top up in pounds, purchase the amount of Bitcoin shown at checkout, and allow a few pounds for fees.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does Transaxe escrow work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Your payment goes to a Transaxe escrow address. Sellers have about 80 hours to mark orders as shipped or funds are automatically refunded. Disputes can be raised after nine days if needed.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is this legal in the UK?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Cannabis laws still apply. It’s the buyer’s responsibility to comply with local regulations and verify details on LittleBiggy.',
        },
      },
    ],
  };
  const webPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Biggy Index – UK Cannabis Listings',
    dateModified: buildTime,
    url: `${origin}/home`,
    inLanguage: locale,
  };

  return (
    <>
      <Head>
        <title>The Biggy Index - UK Cannabis Listings</title>
        <meta name="description" content="Browse LittleBiggy listings with a sleek interface, along with seller stats." />
        <link rel="canonical" href={`${origin}/home`} />
        <meta property="og:title" content="LittleBiggy Index - UK Cannabis Listings" />
        <meta property="og:description" content="Browse LittleBiggy listings with a sleek interface, along with seller stats." />
        <meta property="og:url" content={`${origin}/home`} />
        <meta property="og:type" content="website" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:title" content="LittleBiggy Index - UK Cannabis Listings" />
        <meta property="twitter:description" content="Browse LittleBiggy listings with a sleek interface, along with seller stats." />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      </Head>
      <main className="min-h-screen bg-white text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-white">
        <HeroSection stats={stats} />
        <RecentItemsSection items={recentItems} />
        {/* <WhyItHelpsSection /> */}
        <QuickStartSection />
        <RecentReviewsSection reviews={recentReviews} />
        <RecentMediaSection mediaEntries={recentMedia} />
        <SellerLeaderboardSection leaderboard={sellersLeaderboard} sellersIndex={sellersIndex} />
        <FaqSection />
        <FooterSection lastCrawlTime={stats?.lastUpdated || null} buildTime={buildTime} />
      </main>
    </>
  );
};

export default HomeLanding;
