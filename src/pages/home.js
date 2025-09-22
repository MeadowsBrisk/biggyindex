import Head from "next/head";
import HeroSection from "@/sections/home/HeroSection";
import WhyItHelpsSection from "@/sections/home/WhyItHelpsSection";
import RecentItemsSection from "@/sections/home/RecentItemsSection";
import RecentReviewsSection from "@/sections/home/RecentReviewsSection";
import QuickStartSection from "@/sections/home/QuickStartSection";
import RecentMediaSection from "@/sections/home/RecentMediaSection";
import FaqSection from "@/sections/home/FaqSection";
import FooterSection from "@/sections/home/FooterSection";
import { getAllItems, getManifest, getRecentMedia, getRecentReviews, getSnapshotMeta, getSellers } from "@/lib/indexData";

const SITE_URL = "https://lbindex.vip";

export async function getStaticProps() {
  const manifest = await getManifest();
  const sellers = await getSellers();
  const snapshotMeta = await getSnapshotMeta();
  const indexedItems = await getAllItems();
  const recentReviewsRaw = await getRecentReviews();
  const recentMediaRaw = await getRecentMedia();

  const stats = {
    items: manifest?.totalItems ?? snapshotMeta?.itemsCount ?? null,
    sellers: Array.isArray(sellers) ? sellers.length : null,
    lastUpdated: snapshotMeta?.updatedAt ?? null,
    categories: manifest?.categories || null,
  };

  const recentItems = Array.isArray(indexedItems)
    ? indexedItems
        .filter((item) => item && (item.firstSeenAt || item.lastUpdatedAt) && item.name)
        .sort((a, b) => {
          const aTime = Date.parse(a.firstSeenAt || a.lastUpdatedAt || 0) || 0;
          const bTime = Date.parse(b.firstSeenAt || b.lastUpdatedAt || 0) || 0;
          return bTime - aTime;
        })
        .slice(0, 10)
        .map((item) => ({
          id: item.id ?? item.refNum ?? null,
          refNum: item.refNum ?? null,
          name: item.name ?? "Untitled",
          sellerName: item.sellerName ?? "Unknown seller",
          category: item.category ?? "Uncategorised",
          createdAt: item.firstSeenAt ?? item.lastUpdatedAt ?? null,
          url: item.share ?? item.url ?? null,
          imageUrl: item.imageUrl ?? null,
        }))
    : [];

  const itemImageByRef = new Map();
  const itemImageById = new Map();
  if (Array.isArray(indexedItems)) {
    for (const item of indexedItems) {
      if (!item) continue;
      if (item.refNum && item.imageUrl) itemImageByRef.set(item.refNum, item.imageUrl);
      if (item.id && item.imageUrl) itemImageById.set(item.id, item.imageUrl);
    }
  }

  const recentReviews = Array.isArray(recentReviewsRaw)
    ? recentReviewsRaw.slice(0, 50).map((review) => {
        const ref = review?.item?.refNum;
        const itemId = review?.item?.id;
        const imageUrl =
          (ref && itemImageByRef.get(ref)) ||
          (itemId && itemImageById.get(itemId)) ||
          review?.item?.imageUrl ||
          null;
        return {
          ...review,
          itemImageUrl: imageUrl ?? null,
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
    },
    revalidate: 86400,
  };
}

export default function HomeLanding({ stats, recentItems, recentReviews, recentMedia }) {
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
        <title>LittleBiggy Index - Trusted UK Cannabis Listings</title>
        <meta
          name="description"
          content="Discover curated LittleBiggy cannabis listings with smarter search, UK crypto quick-start tips, escrow protection, and community-reviewed vendors."
        />
        <link rel="canonical" href={`${SITE_URL}/home`} />
        <meta property="og:title" content="LittleBiggy Index - Trusted UK Cannabis Listings" />
        <meta
          property="og:description"
          content="Discover curated LittleBiggy cannabis listings with smarter search, UK crypto quick-start tips, escrow protection, and community-reviewed vendors."
        />
        <meta property="og:url" content={`${SITE_URL}/home`} />
        <meta property="og:type" content="website" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:title" content="LittleBiggy Index - Trusted UK Cannabis Listings" />
        <meta
          property="twitter:description"
          content="Discover curated LittleBiggy cannabis listings with smarter search, UK crypto quick-start tips, escrow protection, and community-reviewed vendors."
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
        <FaqSection />
        <FooterSection />
      </main>
    </>
  );
}

