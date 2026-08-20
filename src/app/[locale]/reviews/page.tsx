import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { RouteDataLoader } from "@/components/RouteDataLoader";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { loadSellers } from "@/lib/data";
import { localeToMarket, marketCurrencySymbol } from "@/lib/market/market";
import { readR2JSON } from "@/lib/r2";
import { pageMetadata } from "@/lib/seo/metadata";
import { ReviewsPageClient } from "./ReviewsPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const market = localeToMarket(locale);
  const t = await getTranslations({ locale, namespace: "reviews.page" });

  return pageMetadata({
    market,
    path: "/reviews",
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  });
}

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
  item?: { refNum: string; name: string; id: number; imageUrl?: string };
  itemId?: string;
  itemImage?: string;
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

  const [sellerList, reviews, mediaReviews] = await Promise.all([
    loadSellers(mkt),
    readR2JSON<RawReview[]>(`markets/${mkt}/aggregates/recent-reviews.json`),
    readR2JSON<RawMediaReview[]>(`markets/${mkt}/aggregates/recent-media.json`),
  ]);

  const sellerImageMap = new Map<string, string>();
  for (const s of sellerList) {
    if (s.imageUrl) sellerImageMap.set(String(s.id), s.imageUrl);
  }

  // Map raw review to enriched shape
  function mapReview(r: RawReview | RawMediaReview) {
    const mediaUrls = "media" in r && Array.isArray(r.media) ? r.media : [];
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
      itemImageUrl: r.itemImage ?? r.item?.imageUrl,
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

  // Aggregate stats for the SSR intro paragraph — prose content for
  // review-intent queries, which an otherwise text-free above-the-fold cannot
  // rank for. Computed inside the cached page body so generateMetadata stays
  // IO-free: uncached IO there flips the route to PPR-dynamic no-store.
  const rated = allReviews.filter((r) => r.rating > 0);
  const avgRating =
    rated.length > 0
      ? (rated.reduce((sum, r) => sum + r.rating, 0) / rated.length).toFixed(1)
      : null;
  const withDelivery = allReviews.filter(
    (r) => r.daysToArrive != null && r.daysToArrive >= 0,
  );
  const avgDelivery =
    withDelivery.length > 0
      ? Math.round(
          withDelivery.reduce((sum, r) => sum + (r.daysToArrive ?? 0), 0) /
            withDelivery.length,
        )
      : null;

  const t = await getTranslations({ locale, namespace: "reviews.page" });
  const FAQ_KEYS = ["source", "trust", "checkSeller"] as const;

  return (
    <>
      <RouteDataLoader
        sellers={sellerList}
        currencySymbol={cSym}
        market={market}
      />
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <ReviewsPageClient
          reviews={allReviews}
          intro={
            avgRating != null
              ? avgDelivery != null
                ? t("intro", {
                    count: allReviews.length,
                    rating: avgRating,
                    days: avgDelivery,
                  })
                : t("introNoDelivery", {
                    count: allReviews.length,
                    rating: avgRating,
                  })
              : null
          }
        />

        {/* FAQ — crawlable prose for review-intent queries; mirrors the
            honest tone of /about. Server-rendered, translated. */}
        <section className="mx-auto max-w-6xl px-4 pb-14">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            {t("faq.heading")}
          </h2>
          <div className="space-y-5 max-w-3xl">
            {FAQ_KEYS.map((key) => (
              <div key={key}>
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  {t(`faq.${key}.q`)}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {t(`faq.${key}.a`)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
