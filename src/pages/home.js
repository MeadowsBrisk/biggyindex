import Head from "next/head";
import fs from "fs";
import path from "path";
import HeroSection from "@/sections/home/HeroSection";
import WhyItHelpsSection from "@/sections/home/WhyItHelpsSection";
import RecentItemsSection from "@/sections/home/RecentItemsSection";
import RecentReviewsSection from "@/sections/home/RecentReviewsSection";
import SellerLeaderboardSection from "@/sections/home/SellerLeaderboardSection";
import QuickStartSection from "@/sections/home/QuickStartSection";
import RecentMediaSection from "@/sections/home/RecentMediaSection";
import FaqSection from "@/sections/home/FaqSection";
import FooterSection from "@/sections/home/FooterSection";
import { getManifest, getRecentMedia, getRecentReviews, getSnapshotMeta, getSellers, getSellersLeaderboard, getSellerImages, getRecentItemsCompact, getItemImageLookup } from "@/lib/indexData";

const SITE_URL = "https://lbindex.vip";
// set how many recent items show in each tab
const RECENT_ITEMS_LIMIT = 25;

export async function getStaticProps() {
  const manifest = await getManifest();
  const sellers = await getSellers();
  const snapshotMeta = await getSnapshotMeta();
  // Load compact recent items aggregate for the carousel
  const recentItemsCompact = await getRecentItemsCompact();
  // Load lightweight item image lookup for recent reviews enrichment
  const itemImageLookup = await getItemImageLookup();
  const recentReviewsRaw = await getRecentReviews();
  const recentMediaRaw = await getRecentMedia();
  const sellersLeaderboardRaw = await getSellersLeaderboard();
  const sellerImagesMap = await getSellerImages();

  const stats = {
    items: manifest?.totalItems ?? snapshotMeta?.itemsCount ?? null,
    sellers: Array.isArray(sellers) ? sellers.length : null,
    lastUpdated: snapshotMeta?.updatedAt ?? null,
    categories: manifest?.categories || null,
  };

  // Seller images map provided by seller-crawler aggregate
  const sellerImageById = new Map(Object.entries(sellerImagesMap || {}).map(([k, v]) => [Number(k), v]).filter(([id, url]) => Number.isFinite(id) && !!url));

  // Fallback: lightweight FS read for the handful of recent items lacking an aggregate entry yet
  function getSellerImageFromSnapshotFS(sellerId) {
    try {
      if (!Number.isFinite(sellerId)) return null;
      const file = path.join(process.cwd(), 'public', 'seller-crawler', 'sellers', `${sellerId}.json`);
      if (!fs.existsSync(file)) return null;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const url = data && data.sellerImageUrl;
      return (typeof url === 'string' && url) ? url : null;
    } catch { return null; }
  }

  const mapItemForCard = (item, label, timestamp) => ({
    id: item.id ?? item.refNum ?? null,
    refNum: item.refNum ?? null,
    name: item.name ?? "Untitled",
    sellerName: item.sellerName ?? "Unknown seller",
    sellerId: item.sellerId ?? null,
    category: item.category ?? "Uncategorised",
    createdAt: timestamp ?? item.firstSeenAt ?? item.lastUpdatedAt ?? null,
    metaLabel: label,
    url: item.share ?? item.url ?? null,
    imageUrl: item.imageUrl ?? null,
    // Prefer seller-crawler snapshot image when we add that enrichment below
    sellerImageUrl: null,
  });
  // Build recent items from compact aggregate only
  const recentItems = {
    added: (recentItemsCompact?.added || [])
      .map((it) => mapItemForCard(it, it.metaLabel || "Added", it.createdAt || null))
      .slice(0, RECENT_ITEMS_LIMIT),
    updated: (recentItemsCompact?.updated || [])
      .map((it) => mapItemForCard(it, it.metaLabel || "Updated", it.createdAt || null))
      .slice(0, RECENT_ITEMS_LIMIT),
  };

  // Enrich recent items with seller images from the aggregated map
  for (const list of [recentItems.added, recentItems.updated]) {
    for (const it of list) {
      if (!it || !it.sellerId || it.sellerImageUrl) continue;
      let url = sellerImageById.get(it.sellerId) || null;
      if (!url) url = getSellerImageFromSnapshotFS(it.sellerId) || null;
      if (url) it.sellerImageUrl = url;
    }
  }

  if (!recentItems.updated.length) {
    recentItems.updated = recentItems.added;
  }

  // Lightweight image lookup maps (prefer blob-provided map; supplement with compact recent lists)
  const imageByRefFromRecent = new Map(Object.entries(itemImageLookup?.byRef || {}));
  const imageByIdFromRecent = new Map(Object.entries(itemImageLookup?.byId || {}));
  for (const list of [recentItems.added, recentItems.updated]) {
    for (const it of list) {
      if (it?.refNum && it?.imageUrl && !imageByRefFromRecent.has(String(it.refNum))) imageByRefFromRecent.set(String(it.refNum), it.imageUrl);
      if (it?.id && it?.imageUrl && !imageByIdFromRecent.has(String(it.id))) imageByIdFromRecent.set(String(it.id), it.imageUrl);
    }
  }

  const recentReviews = Array.isArray(recentReviewsRaw)
    ? recentReviewsRaw.slice(0, 100).map((review) => {
        const ref = review?.item?.refNum;
        const itemId = review?.item?.id;
        const imageUrl =
          review?.item?.imageUrl ||
          (ref != null && imageByRefFromRecent.get(String(ref))) ||
          (itemId != null && imageByIdFromRecent.get(String(itemId))) ||
          null;
        // Enrich with seller image for tooltip
        const sellerId = review?.sellerId ?? review?.seller?.id ?? null;
        let sellerImageUrl = null;
        if (sellerId) {
          sellerImageUrl = sellerImageById.get(sellerId) || null;
          if (!sellerImageUrl) sellerImageUrl = getSellerImageFromSnapshotFS(sellerId) || null;
        }
        return {
          ...review,
          itemImageUrl: imageUrl ?? null,
          sellerImageUrl: sellerImageUrl ?? null,
        };
      })
    : [];

  const recentMedia = Array.isArray(recentMediaRaw)
    ? recentMediaRaw
        .slice(0, 40)
        .map((entry, index) => {
          if (!entry || !Array.isArray(entry.segments)) return null;
          const textSnippet = entry.segments
            .filter((segment) => segment && segment.type === "text" && typeof segment.value === "string")
            .map((segment) => segment.value)
            .join("")
            .replace(/\s+/g, " ")
            .trim();

        const images = entry.segments
          .filter((segment) => segment && segment.type === "image" && segment.url)
          .map((segment) => segment.url)
          .filter(Boolean);

        if (!images.length) return null;

          return {
            id: entry.id ?? `media-${index}`,
          images,
            sellerName: entry.sellerName || "Unknown seller",
            rating: typeof entry.rating === "number" ? entry.rating : null,
            daysToArrive: Number.isFinite(entry.daysToArrive) ? entry.daysToArrive : null,
            createdAt: entry.created ? new Date(entry.created * 1000).toISOString() : null,
            itemName: entry.item?.name || "Unknown item",
            refNum: entry.item?.refNum || null,
            text: textSnippet || null,
          };
        })
        .filter(Boolean)
    : [];

  return {
    props: {
      stats,
      recentItems,
      recentReviews,
      recentMedia,
      sellersLeaderboard: sellersLeaderboardRaw ?? null,
      sellersIndex: sellers ?? null,
    },
    revalidate: 900,
  };
}

export default function HomeLanding({ stats, recentItems, recentReviews, recentMedia, sellersLeaderboard, sellersIndex }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Biggy Index",
    url: SITE_URL,
    inLanguage: "en-GB",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is the Biggy Index?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The Biggy Index provides an easier way to browse the LittleBiggy marketplace, with item categorisation, additional sorting options, and other handy tools tailored for UK shoppers.",
        },
      },
      {
        "@type": "Question",
        name: "Do you sell or ship items?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Biggy Index is read-only and sends you back to LittleBiggy to complete your order.",
        },
      },
      {
        "@type": "Question",
        name: "How do I buy Bitcoin in the UK?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Most buyers use Revolut, Monzo, Kraken, or Coinbase. Top up in pounds, purchase the amount of Bitcoin shown at checkout, and allow a few pounds for fees.",
        },
      },
      {
        "@type": "Question",
        name: "How does Transaxe escrow work?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Your payment goes to a Transaxe escrow address. Sellers have about 80 hours to mark orders as shipped or funds are automatically refunded. Disputes can be raised after nine days if needed.",
        },
      },
      {
        "@type": "Question",
        name: "Is this legal in the UK?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Cannabis laws still apply. It’s the buyer’s responsibility to comply with local regulations and verify details on LittleBiggy.",
        },
      },
    ],
  };

  return (
    <>
      <Head>
        <title>The Biggy Index - UK Cannabis Listings</title>
        <meta
          name="description"
          content="Browse LittleBiggy listings with a sleek interface, along with seller stats."
        />
        <link rel="canonical" href={`${SITE_URL}/home`} />
        <meta property="og:title" content="LittleBiggy Index - UK Cannabis Listings" />
        <meta
          property="og:description"
          content="Browse LittleBiggy listings with a sleek interface, along with seller stats."
        />
        <meta property="og:url" content={`${SITE_URL}/home`} />
        <meta property="og:type" content="website" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:title" content="LittleBiggy Index - UK Cannabis Listings" />
        <meta
          property="twitter:description"
          content="Browse LittleBiggy listings with a sleek interface, along with seller stats."
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
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
        <FooterSection />
      </main>
    </>
  );
}

