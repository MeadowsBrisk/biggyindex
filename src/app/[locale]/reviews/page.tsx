import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { localeToMarket, marketCurrencySymbol } from "@/lib/market/market";
import { readR2JSON } from "@/lib/r2";
import { loadItems, loadSellers } from "@/lib/data";
import { DataLoader } from "@/components/DataLoader";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ReviewsPageClient } from "./ReviewsPageClient";

export const metadata = {
  title: "Reviews - BiggyIndex",
  description:
    "Latest community reviews from Little Biggy buyers with images, ratings, and delivery times.",
};

interface RawReviewSegment {
  type: "text" | "image";
  value?: string;
  url?: string;
}

interface RawReview {
  sellerId: string;
  sellerName: string;
  id: number;
  created: number;
  rating: number;
  daysToArrive?: number;
  segments?: RawReviewSegment[];
  item?: { refNum: string; name: string; id: number };
  itemId?: string;
}

interface RawMediaReview extends RawReview {
  media?: string[];
  mediaCount?: number;
}


export default async function ReviewsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  "use cache";
  cacheLife("items");
  cacheTag("items");

  const { locale } = await params;
  const market = localeToMarket(locale);
  const mkt = market.toLowerCase();
  const cSym = marketCurrencySymbol(market);

  const [itemList, sellerList, reviews, mediaReviews] =
    await Promise.all([
      loadItems(mkt),
      loadSellers(mkt),
      readR2JSON<RawReview[]>(`markets/${mkt}/aggregates/recent-reviews.json`),
      readR2JSON<RawMediaReview[]>(`markets/${mkt}/aggregates/recent-media.json`),
    ]);

  // Build lookup maps for review enrichment
  const itemImageMap = new Map<string, string>();
  for (const item of itemList) {
    if (item.refNum && item.i) {
      itemImageMap.set(String(item.refNum), item.i);
    }
  }
  const sellerImageMap = new Map<string, string>();
  for (const s of sellerList) {
    if (s.imageUrl) sellerImageMap.set(String(s.id), s.imageUrl);
  }

  // Map raw review to enriched shape
  function mapReview(r: RawReview | RawMediaReview) {
    const mediaUrls =
      "media" in r && Array.isArray(r.media) ? r.media : [];
    const segmentImages = (r.segments ?? [])
      .filter((s) => s.type === "image")
      .map((s) => s.url ?? s.value)
      .filter((u): u is string => !!u && u.length > 5);
    const images = mediaUrls.length > 0 ? mediaUrls : segmentImages;
    const refNum = r.item?.refNum ?? r.itemId;

    return {
      id: r.id,
      sellerId: r.sellerId,
      sellerName: r.sellerName,
      sellerImageUrl: sellerImageMap.get(r.sellerId),
      itemName: r.item?.name ?? undefined,
      itemImageUrl: refNum ? itemImageMap.get(refNum) : undefined,
      refNum,
      rating: r.rating,
      text:
        r.segments
          ?.filter((s) => s.type === "text")
          .map((s) => s.value ?? "")
          .join(" ")
          .trim() || undefined,
      daysToArrive: r.daysToArrive,
      createdAt: r.created
        ? new Date(r.created * 1000).toISOString()
        : new Date().toISOString(),
      images: images.length > 0 ? images : undefined,
    };
  }

  // Merge: interleave image reviews among text reviews
  const mediaList = (mediaReviews ?? []).map(mapReview);
  const mediaIds = new Set((mediaReviews ?? []).map((r) => r.id));
  const textOnlyList = (reviews ?? [])
    .filter((r) => !mediaIds.has(r.id))
    .map(mapReview);

  const allReviews: typeof textOnlyList = [];
  let mi = 0;
  let ti = 0;
  while (mi < mediaList.length || ti < textOnlyList.length) {
    for (let n = 0; n < 3 && ti < textOnlyList.length; n++) {
      allReviews.push(textOnlyList[ti++]);
    }
    if (mi < mediaList.length) {
      allReviews.push(mediaList[mi++]);
    }
  }

  return (
    <>
      <Suspense>
        <DataLoader
          items={itemList}
          sellers={sellerList}
          currencySymbol={cSym}
        />
      </Suspense>
      <SiteHeader />
      <main className="min-h-screen bg-[var(--background)]">
        <ReviewsPageClient reviews={allReviews} />
      </main>
      <SiteFooter />
    </>
  );
}
