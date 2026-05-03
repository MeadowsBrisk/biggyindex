"use client";

import { useAtomValue } from "jotai";
import { Circle, Package, Star, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useMemo, useState } from "react";
import { LinkedText } from "@/components/LinkedText";
import { OutboundLink } from "@/components/OutboundLink";
import { type Review, ReviewCard } from "@/components/ReviewCard";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import {
  SellerCommunityFeedbackBlock,
  SellerFeedbackActions,
} from "@/components/SellerCommunityFeedback";
import { ShowOriginalToggle } from "@/components/ShowOriginalToggle";
import { cx } from "@/lib/cn";
import { decodeEntities } from "@/lib/format";
import { getItemPrimaryImage, getSellerImageUrl } from "@/lib/images";
import { type MarketCode, marketToLocale } from "@/lib/market/market";
import type { Item, Seller, SellerDetail, SellerReview } from "@/lib/types";
import { forceEnglishAtom } from "@/store/atoms";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

interface SellerPageClientProps {
  detail: SellerDetail;
  seller: Seller;
  items: Item[];
  itemTotal: number;
  market: MarketCode;
  sellerId: string;
}

function ratingBucketClass(rating: number): string {
  if (rating <= 2)
    return "border-red-400/40 bg-red-500/10 dark:border-red-500/30 dark:bg-red-500/15";
  if (rating <= 4)
    return "border-orange-400/40 bg-orange-500/10 dark:border-orange-500/30 dark:bg-orange-500/15";
  if (rating <= 5)
    return "border-yellow-400/40 bg-yellow-500/10 dark:border-yellow-500/30 dark:bg-yellow-500/15";
  if (rating <= 7)
    return "border-lime-400/40 bg-lime-500/10 dark:border-lime-500/30 dark:bg-lime-500/15";
  if (rating <= 8)
    return "border-emerald-400/40 bg-emerald-500/10 dark:border-emerald-500/30 dark:bg-emerald-500/15";
  return "border-sky-400/40 bg-sky-500/10 dark:border-sky-500/30 dark:bg-sky-500/15";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
}

function cleanReviews(reviews: SellerDetail["reviews"]): SellerReview[] {
  return Array.isArray(reviews)
    ? reviews.filter(
        (review): review is SellerReview =>
          typeof review?.rating === "number" && Number.isFinite(review.rating),
      )
    : [];
}

function SellerItemCard({ item }: { item: Item }) {
  const t = useTranslations("seller.detail");
  const ref = String(item.refNum ?? item.id);
  const name = decodeEntities(item.n);
  const image = getItemPrimaryImage(item, "thumb", { forceStatic: true });

  return (
    <Link
      href={`/item/${encodeURIComponent(ref)}`}
      prefetch={false}
      className="group grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-card p-2 transition-colors hover:border-primary/40 hover:bg-surface"
      aria-label={t("openItem", { item: name })}
    >
      <div className="aspect-square overflow-hidden rounded-md bg-surface">
        {image ? (
          // biome-ignore lint/performance/noImgElement: R2 images are already optimized before reaching this component.
          <img
            src={image}
            alt={name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <Package size={18} />
          </div>
        )}
      </div>
      <div className="min-w-0 py-0.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary">
          {name}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          {item.c && (
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">
              {item.c}
            </span>
          )}
          {item.rs?.avg != null && (
            <span className="inline-flex items-center gap-0.5">
              <Star size={10} className="fill-amber-400 text-amber-400" />
              {item.rs.avg.toFixed(1)}
            </span>
          )}
          {item.rs?.days != null && (
            <span className="inline-flex items-center gap-0.5">
              <Truck size={10} />
              {Math.round(item.rs.days)}d
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function SellerPageClient({
  detail,
  seller,
  items,
  itemTotal,
  market,
  sellerId,
}: SellerPageClientProps) {
  const t = useTranslations("seller.modal");
  const pageT = useTranslations("seller.detail");
  const forceEnglish = useAtomValue(forceEnglishAtom);
  const router = useRouter();
  const [ratingFilter, setRatingFilter] = useState<number | "low" | null>(null);
  const [avatarZoomSignal, setAvatarZoomSignal] = useState<number | null>(null);

  const name = decodeEntities(
    detail.sellerName || seller.name || t("fallbackName"),
  );
  const rawImage =
    detail.sellerImageUrl ?? detail.imageUrl ?? seller.imageUrl ?? null;
  const image = getSellerImageUrl(rawImage) ?? undefined;
  const zoomImage = getSellerImageUrl(rawImage, "full") ?? image;
  const online = detail.sellerOnline ?? detail.online ?? seller.online ?? null;
  const reviews = useMemo(() => cleanReviews(detail.reviews), [detail.reviews]);
  const shareLink = detail.share || detail.sellerUrl || null;
  const targetLocale = marketToLocale(market);
  const translatedManifesto =
    detail.translations?.locales?.[targetLocale]?.manifesto;
  const manifesto =
    forceEnglish || !translatedManifesto
      ? detail.manifesto
      : translatedManifesto;

  const itemsCount =
    itemTotal || seller.itemsCount || detail.overview?.itemsCount || 0;
  const numReviews =
    detail.overview?.numberOfReviews ??
    seller.numberOfReviews ??
    reviews.length;
  const avgDays =
    detail.overview?.averageDaysToArrive ?? seller.averageDaysToArrive ?? null;
  const avgRating = seller.averageRating ?? null;

  const ratingStats = useMemo(() => {
    const out = {
      total: 0,
      buckets: [] as { rating: number; count: number }[],
      recentNegatives: 0,
    };
    if (reviews.length === 0) return out;
    const counts = new Map<number, number>();
    for (const review of reviews) {
      const bucket = Math.round(review.rating);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
      if (bucket <= 5) out.recentNegatives++;
    }
    out.buckets = Array.from(counts.entries())
      .map(([rating, count]) => ({ rating, count }))
      .sort((a, b) => a.rating - b.rating);
    out.total = reviews.length;
    return out;
  }, [reviews]);

  const displayedReviews =
    ratingFilter == null
      ? reviews
      : ratingFilter === "low"
        ? reviews.filter((review) => Math.round(review.rating) <= 5)
        : reviews.filter(
            (review) => Math.round(review.rating) === ratingFilter,
          );

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(22rem,0.88fr)] lg:items-start">
          <section className="min-w-0 space-y-6">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start gap-4">
                <div className="shrink-0">
                  <SellerAvatarTooltip
                    sellerName={name}
                    imageUrl={image}
                    tooltipSize={220}
                  >
                    <button
                      type="button"
                      disabled={!image}
                      onClick={() =>
                        image &&
                        setAvatarZoomSignal((signal) => (signal ?? 0) + 1)
                      }
                      aria-label={
                        image
                          ? t("zoomProfileImage", { seller: name })
                          : undefined
                      }
                      className={cx(
                        "flex size-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface text-2xl font-bold text-muted transition-colors",
                        image && "cursor-zoom-in hover:border-primary/40",
                      )}
                    >
                      {image ? (
                        // biome-ignore lint/performance/noImgElement: R2 seller avatars are already optimized before reaching this component.
                        <img
                          src={image}
                          alt={name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initials(name)
                      )}
                    </button>
                  </SellerAvatarTooltip>
                  {avatarZoomSignal != null && image && (
                    <Suspense fallback={null}>
                      <ImageZoomPreview
                        imageUrl={zoomImage ?? image}
                        alt={name}
                        openSignal={avatarZoomSignal}
                      />
                    </Suspense>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="truncate text-2xl font-bold leading-tight text-foreground">
                        {name}
                      </h1>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                        {online && (
                          <span className="inline-flex items-center gap-1">
                            <Circle
                              size={7}
                              className={cx(
                                "fill-current",
                                online === "today" || online === "online"
                                  ? "text-emerald-500"
                                  : "text-yellow-500",
                              )}
                            />
                            {online === "today" || online === "online"
                              ? t("onlineToday")
                              : t("lastSeen", { time: online })}
                          </span>
                        )}
                        {detail.sellerJoined && (
                          <span>
                            {t("joined", { date: detail.sellerJoined })}
                          </span>
                        )}
                      </div>
                    </div>
                    {translatedManifesto && (
                      <ShowOriginalToggle market={market} />
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <Link
                      href={`/browse?sellers=${encodeURIComponent(sellerId)}`}
                      prefetch={false}
                      className="hover:text-primary"
                    >
                      {t("itemCount", { count: itemsCount })}
                    </Link>
                    {numReviews != null && (
                      <span>{t("reviewCount", { count: numReviews })}</span>
                    )}
                    {avgRating != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <Star
                          size={10}
                          className="fill-amber-400 text-amber-400"
                        />
                        {avgRating.toFixed(1)}/10
                      </span>
                    )}
                    {avgDays != null && (
                      <span>
                        {t("deliveryShort", { days: Math.round(avgDays) })}
                      </span>
                    )}
                  </div>

                  {shareLink && (
                    <div className="mt-4">
                      <OutboundLink
                        href={shareLink}
                        id={sellerId}
                        sid={sellerId}
                        sn={name}
                        c="Seller"
                        mkt={market}
                        className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-opacity hover:opacity-90"
                        aria-label={t("visitAria", { seller: name })}
                      >
                        {t("visit", { seller: name })}
                        <span aria-hidden="true">-&gt;</span>
                      </OutboundLink>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <h2 className="mb-2 text-sm font-semibold text-foreground">
                  {t("about")}
                </h2>
                {manifesto ? (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                    <LinkedText text={manifesto} />
                  </p>
                ) : (
                  <p className="text-sm italic text-muted">
                    {t("noDescription")}
                  </p>
                )}
              </div>

              <SellerCommunityFeedbackBlock
                feedback={detail.communityFeedback ?? null}
                indexSeller={seller}
              />

              <div className="mt-5 border-t border-border pt-4">
                <SellerFeedbackActions sellerId={sellerId} sellerName={name} />
              </div>
            </div>

            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {pageT("currentListings")}
                  </h2>
                  <p className="text-sm text-muted">
                    {pageT("listingCount", { count: itemTotal })}
                  </p>
                </div>
                <Link
                  href={`/browse?sellers=${encodeURIComponent(sellerId)}`}
                  prefetch={false}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {pageT("viewAllListings")}
                </Link>
              </div>

              {items.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((item) => (
                    <SellerItemCard
                      key={String(item.refNum ?? item.id)}
                      item={item}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted">
                  {pageT("noListings")}
                </div>
              )}
            </section>
          </section>

          <aside className="min-w-0 rounded-lg border border-border bg-card lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:overflow-hidden">
            <div className="sticky top-0 z-10 border-b border-border bg-card px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">
                {t("reviews.heading")}
              </h2>
              <div className="flex items-baseline justify-between gap-3 text-[11px] text-muted">
                <span>
                  {numReviews && numReviews > reviews.length
                    ? t("reviews.recentTotal", {
                        recent: reviews.length,
                        total: numReviews,
                      })
                    : t("reviews.recentCount", { count: reviews.length })}
                </span>
                {avgDays != null && (
                  <span>
                    {t("reviews.avgDelivery", { days: Math.round(avgDays) })}
                  </span>
                )}
              </div>
              {ratingStats.total > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {ratingStats.recentNegatives > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRatingFilter(ratingFilter === "low" ? null : "low")
                      }
                      className={cx(
                        "inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-shadow",
                        ratingStats.recentNegatives > 6
                          ? "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-200"
                          : "bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200",
                        ratingFilter === "low" && "ring-2 ring-primary/50",
                      )}
                    >
                      <span
                        className={cx(
                          "inline-block size-2 rounded-full",
                          ratingStats.recentNegatives > 6
                            ? "bg-red-500"
                            : "bg-amber-500",
                        )}
                      />
                      {t("reviews.lowRating", {
                        count: ratingStats.recentNegatives,
                      })}
                    </button>
                  )}
                  {ratingStats.buckets.map((bucket) => (
                    <button
                      key={bucket.rating}
                      type="button"
                      onClick={() =>
                        setRatingFilter(
                          ratingFilter === bucket.rating ? null : bucket.rating,
                        )
                      }
                      className={cx(
                        "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                        ratingBucketClass(bucket.rating),
                        ratingFilter === bucket.rating &&
                          "ring-2 ring-primary/50",
                      )}
                    >
                      <span className="font-semibold">{bucket.rating}/10</span>
                      <span className="opacity-80">{bucket.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 overflow-x-hidden px-5 py-4 lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto">
              {displayedReviews.length === 0 ? (
                <p className="py-8 text-center text-sm italic text-muted">
                  {reviews.length === 0
                    ? t("reviews.noReviewsYet")
                    : t("reviews.noFilteredReviews", {
                        filter:
                          ratingFilter === "low"
                            ? t("reviews.lowRated")
                            : `${ratingFilter}/10`,
                      })}
                </p>
              ) : (
                displayedReviews.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review as Review}
                    itemImageUrl={review.item?.imageUrl ?? review.itemImage}
                    onItemClick={(ref) =>
                      router.push(`/item/${encodeURIComponent(ref)}`)
                    }
                  />
                ))
              )}
              {shareLink &&
                numReviews != null &&
                numReviews > reviews.length && (
                  <p className="ido-reviews-hint">{t("reviews.readMoreAt")}</p>
                )}
              <div className="pb-8" />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
