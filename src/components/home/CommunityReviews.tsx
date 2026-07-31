"use client";

import { useSetAtom } from "jotai";
import {
  ArrowRight,
  Camera,
  ImageOff,
  MessageSquare,
  ShoppingBag,
  Star,
  Truck,
  User,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReviewPhotoImg } from "@/components/ReviewPhotoImg";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";
import { getSellerImageUrl, toIconVariantUrl } from "@/lib/images";
import { expandedRefNumAtom, photoReviewModalAtom } from "@/store/atoms";

interface ReviewCardData {
  /** LittleBiggy review id (optional on legacy home-feed blobs). */
  id?: number | null;
  sellerId: string;
  sellerName: string | null;
  sellerAvatar?: string;
  itemName?: string;
  refNum?: string;
  itemImage?: string;
  rating: number;
  text?: string;
  daysToArrive?: number;
  createdAt: string;
  images?: string[];
}

interface ReviewStats {
  thisWeek: number;
  avgRating: number;
  avgDeliveryDays: number;
  perDay: number;
  total: number;
}

interface CommunityReviewsProps {
  reviews: ReviewCardData[];
  reviewStats: ReviewStats;
  now: number;
}

const STAR_POSITIONS = [0, 1, 2, 3, 4] as const;

interface TimeAgoCopy {
  justNow: string;
  minutesAgo: (count: number) => string;
  hoursAgo: (count: number) => string;
  oneDayAgo: string;
  daysAgo: (count: number) => string;
  monthsAgo: (count: number) => string;
}

interface CommunityReviewCopy {
  fallbackSeller: string;
  fallbackProduct: string;
  fallbackReviewPhoto: string;
  deliveryDays: (count: number) => string;
  stats: {
    avgDelivery: string;
    avgDeliveryValue: (count: number) => string;
    basedOnRecentReviews: string;
    newReviews: string;
    postedThisWeek: string;
    avgRating: string;
    avgRatingValue: (rating: number) => string;
    fromReviews: (count: number) => string;
  };
  time: TimeAgoCopy;
}

function StarRating({
  rating,
  max = 5,
  size = 11,
}: {
  rating: number;
  max?: number;
  size?: number;
}) {
  const stars = Math.round((rating / 10) * max);
  return (
    <div className="flex items-center gap-0.5">
      {STAR_POSITIONS.slice(0, max).map((starIndex) => (
        <Star
          key={starIndex}
          size={size}
          className={
            starIndex < stars
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-white/30"
          }
        />
      ))}
    </div>
  );
}

function StarRatingDark({
  rating,
  max = 5,
  size = 10,
}: {
  rating: number;
  max?: number;
  size?: number;
}) {
  const stars = Math.round((rating / 10) * max);
  return (
    <div className="flex items-center gap-0.5">
      {STAR_POSITIONS.slice(0, max).map((starIndex) => (
        <Star
          key={starIndex}
          size={size}
          className={
            starIndex < stars
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-foreground/15"
          }
        />
      ))}
    </div>
  );
}

function timeAgo(dateStr: string, copy: TimeAgoCopy, now: number): string {
  const diff = Math.max(0, now - new Date(dateStr).getTime());
  // Minute granularity under the hour: "Just now" is only honest for the
  // first few minutes — a whole feed stamped "Just now" for 59 minutes isn't.
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 5) return copy.justNow;
  if (minutes < 60) return copy.minutesAgo(minutes);
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return copy.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days === 1) return copy.oneDayAgo;
  if (days < 30) return copy.daysAgo(days);
  return copy.monthsAgo(Math.floor(days / 30));
}

/* ─── Photo Review Card ─────────────────────────────────────────────── */

function PhotoReviewCard({
  review,
  height,
  copy,
  now,
}: {
  review: ReviewCardData;
  height: string;
  copy: CommunityReviewCopy;
  now: number;
}) {
  const openModal = useSetAtom(photoReviewModalAtom);
  const reduceMotion = usePrefersReducedMotion();
  const images = useMemo(
    () => (review.images ?? []).filter((src) => src.trim().length > 0),
    [review.images],
  );
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(
    () => new Set(),
  );
  const markImageDead = useCallback((src: string) => {
    setFailedImages((current) => new Set(current).add(src));
  }, []);
  // Optimised 96px avatar (see note on `avatarUrl` in MarqueeReviewCard).
  const avatarUrl = getSellerImageUrl(review.sellerAvatar);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const visibleImages = useMemo(
    () => images.filter((src) => !failedImages.has(src)),
    [images, failedImages],
  );

  useEffect(() => {
    if (reduceMotion || visibleImages.length <= 1) return;
    const intervalId = window.setInterval(() => {
      setActiveImageIndex((current) => (current + 1) % visibleImages.length);
    }, 3500);
    return () => window.clearInterval(intervalId);
  }, [reduceMotion, visibleImages.length]);

  const activeIndex =
    visibleImages.length > 0 ? activeImageIndex % visibleImages.length : 0;

  const cardClassName =
    "group relative w-full overflow-hidden rounded-xl break-inside-avoid mb-4 cursor-pointer";
  const cardInner = (
    <>
      {visibleImages.length > 0 ? (
        <div className="absolute inset-0">
          {visibleImages.map((src, imageIndex) => (
            // Optimised CDN thumb with raw-LB fallback; only photos dead on
            // BOTH sources are pruned (previously any raw failure pruned).
            <ReviewPhotoImg
              key={src}
              rawUrl={src}
              alt={review.itemName ?? copy.fallbackReviewPhoto}
              loading="lazy"
              onDead={markImageDead}
              className={`absolute inset-0 h-full w-full object-cover transition-all duration-1000 ease-in-out group-hover:scale-[1.03] motion-reduce:transition-none ${
                imageIndex === activeIndex ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 bg-linear-to-br from-emerald-900/40 via-emerald-950/60 to-black/70 flex items-center justify-center">
          <ImageOff size={28} className="text-white/20" />
        </div>
      )}
      <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-transparent" />
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 pt-3">
        <StarRating rating={review.rating} size={12} />
        <span className="text-[10px] text-white/50 font-medium">
          {timeAgo(review.createdAt, copy.time, now)}
        </span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 z-10 px-3 pb-3">
        {review.text && (
          <p className="text-[12px] text-white/80 leading-relaxed line-clamp-2 mb-2 opacity-0 translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
            {review.text}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {/* Seller avatar with tooltip */}
          <SellerAvatarTooltip
            sellerName={review.sellerName ?? copy.fallbackSeller}
            imageUrl={avatarUrl ?? null}
            showInitialTooltip
          >
            {avatarUrl && !avatarFailed ? (
              <img
                src={avatarUrl}
                alt={review.sellerName ?? copy.fallbackSeller}
                className="w-5 h-5 rounded-full object-cover border border-white/20 shrink-0"
                loading="lazy"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center shrink-0">
                <User size={9} className="text-white/50" />
              </div>
            )}
          </SellerAvatarTooltip>
          <div className="min-w-0 flex-1">
            {review.itemName && (
              <p className="text-[12px] font-semibold text-white truncate">
                {review.itemName}
              </p>
            )}
            <p className="text-[10px] text-white/50 truncate">
              {review.sellerName ?? copy.fallbackSeller}
            </p>
          </div>
          {review.daysToArrive != null && (
            <div className="flex items-center gap-1 shrink-0">
              <Truck size={9} className="text-white/40" />
              <span className="text-[9px] text-white/40">
                {copy.deliveryDays(review.daysToArrive)}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );

  // Real item link for crawlers when the item is known; left-click keeps the modal UX
  return review.refNum ? (
    <a
      href={`/item/${encodeURIComponent(String(review.refNum))}`}
      onClick={(e) => {
        // Middle-click / ctrl-click → let browser open in new tab
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        openModal(review);
      }}
      className={`inline-block ${cardClassName}`}
      style={{ height }}
    >
      {cardInner}
    </a>
  ) : (
    <button
      type="button"
      onClick={() => openModal(review)}
      className={cardClassName}
      style={{ height }}
    >
      {cardInner}
    </button>
  );
}

/* ─── Marquee Review Card ───────────────────────────────────────────── */

function MarqueeReviewCard({
  review,
  copy,
  now,
  tabIndex,
}: {
  review: ReviewCardData;
  copy: CommunityReviewCopy;
  now: number;
  /** -1 on the marquee's clone copy: clickable for mouse users, skipped by Tab. */
  tabIndex?: number;
}) {
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const canOpen = !!review.refNum;
  // `sellerAvatar` is the RAW marketplace original (multi-MB, one animated
  // GIF is 5.3MB) rendered in a 24px slot — always serve the 96px optimised
  // crop instead. `itemImage` already arrives optimised but at the 600px
  // `thumb` tier, so drop it to the `icon` tier. Both fall back to the
  // existing placeholder on error; deliberately NEVER back to the original.
  const avatarUrl = getSellerImageUrl(review.sellerAvatar);
  const itemImageUrl = toIconVariantUrl(review.itemImage);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [itemImageFailed, setItemImageFailed] = useState(false);

  const cardClassName = `w-70 sm:w-80 shrink-0 text-left rounded-xl border border-border bg-card p-3 flex flex-col transition-colors select-none ${
    canOpen
      ? "hover:border-primary/30 hover:bg-surface-hover cursor-pointer"
      : "cursor-default"
  }`;
  const cardInner = (
    <>
      {/* Top: stars + time */}
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <StarRatingDark rating={review.rating} size={10} />
        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
          {timeAgo(review.createdAt, copy.time, now)}
        </span>
      </div>

      {/* Middle: review text (fades at bottom if clamped; click card to read full via detail overlay) */}
      {review.text && (
        <p className="text-[12.5px] text-foreground/80 leading-relaxed line-clamp-5 mb-1.5 flex-1 min-h-0 mask-[linear-gradient(to_bottom,black_70%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)]">
          {review.text}
        </p>
      )}

      {/* Bottom: seller + product info */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border shrink-0 mt-auto">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Seller avatar with tooltip */}
          <SellerAvatarTooltip
            sellerName={review.sellerName ?? copy.fallbackSeller}
            imageUrl={avatarUrl ?? null}
            showInitialTooltip
          >
            {avatarUrl && !avatarFailed ? (
              <img
                src={avatarUrl}
                alt={review.sellerName ?? copy.fallbackSeller}
                className="w-6 h-6 rounded-full object-cover border border-border shrink-0"
                loading="lazy"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center shrink-0">
                <User size={10} className="text-muted-foreground" />
              </div>
            )}
          </SellerAvatarTooltip>
          <div className="min-w-0 flex-1">
            {review.itemName && (
              <p className="text-[11px] font-medium text-foreground truncate">
                {review.itemName}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground truncate">
              {review.sellerName ?? copy.fallbackSeller}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Product thumbnail with hover tooltip */}
          <SellerAvatarTooltip
            sellerName={review.itemName ?? copy.fallbackProduct}
            imageUrl={itemImageUrl ?? null}
            tooltipSize={160}
          >
            {itemImageUrl && !itemImageFailed ? (
              <img
                src={itemImageUrl}
                alt={review.itemName ?? copy.fallbackProduct}
                className="w-6 h-6 rounded object-cover border border-border"
                loading="lazy"
                onError={() => setItemImageFailed(true)}
              />
            ) : (
              <div className="w-6 h-6 rounded bg-surface border border-border flex items-center justify-center">
                <ShoppingBag size={10} className="text-muted-foreground" />
              </div>
            )}
          </SellerAvatarTooltip>
          {review.daysToArrive != null && (
            <div className="flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5">
              <Truck size={9} className="text-muted-foreground" />
              <span className="text-[9px] font-medium text-muted-foreground">
                {copy.deliveryDays(review.daysToArrive)}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );

  // Real item link for crawlers; left-click keeps the modal UX
  return canOpen ? (
    <a
      href={`/item/${encodeURIComponent(String(review.refNum))}`}
      tabIndex={tabIndex}
      onClick={(e) => {
        // Middle-click / ctrl-click → let browser open in new tab
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        setRefNum(review.refNum!);
      }}
      className={cardClassName}
      style={{ height: "180px" }}
    >
      {cardInner}
    </a>
  ) : (
    <button
      type="button"
      disabled
      className={cardClassName}
      style={{ height: "180px" }}
    >
      {cardInner}
    </button>
  );
}

/* ─── Filler Brick (stat card for empty spaces) ─────────────────────── */

function FillerBrick({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="w-35 sm:w-40 shrink-0 rounded-xl border border-primary/25 bg-linear-to-br from-primary/10 via-primary/5 to-transparent p-3 flex flex-col justify-center select-none relative overflow-hidden"
      style={{ height: "180px" }}
    >
      {/* Decorative accent blob */}
      <div className="absolute -top-6 -right-6 size-20 rounded-full bg-primary/8 blur-xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-1.5 text-primary/70 mb-1.5">
          {icon}
          <span className="text-[10px] font-semibold uppercase tracking-wider">
            {label}
          </span>
        </div>
        <p className="text-xl font-bold text-primary leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-primary/50 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Single marquee row ────────────────────────────────────────────── */

function MarqueeRow({
  reviews,
  direction,
  fillerCard,
  speed = 25,
  copy,
  now,
}: {
  reviews: ReviewCardData[];
  direction: "left" | "right";
  fillerCard?: React.ReactNode;
  speed?: number;
  copy: CommunityReviewCopy;
  now: number;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Build the card list once — we duplicate for seamless looping. The clone
  // copy gets tabIndex -1 so keyboard users don't Tab through every card twice.
  const buildCards = (isClone: boolean) => {
    const items: React.ReactNode[] = [];
    reviews.forEach((review) => {
      items.push(
        <MarqueeReviewCard
          key={
            review.id ??
            `${review.sellerId}-${review.createdAt}-${review.refNum ?? review.itemName ?? "review"}`
          }
          review={review}
          copy={copy}
          now={now}
          tabIndex={isClone ? -1 : undefined}
        />,
      );
    });
    if (fillerCard) items.push(fillerCard);
    return items;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: buildCards closes over the same deps
  const cards = useMemo(
    () => buildCards(false),
    [reviews, fillerCard, copy, now],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: buildCards closes over the same deps
  const cloneCards = useMemo(
    () => buildCards(true),
    [reviews, fillerCard, copy, now],
  );

  // Duration: based on total width approximation
  // ~330px per card (320 + 10 gap)
  const totalCards = cards.length;
  const duration = (totalCards * 330) / speed;

  return (
    <div
      ref={rowRef}
      className="review-marquee-row overflow-hidden"
      style={
        {
          "--marquee-duration": `${duration}s`,
          "--marquee-direction": direction === "left" ? "normal" : "reverse",
        } as React.CSSProperties
      }
    >
      <div className="review-marquee-track flex gap-2.5">
        {/* First copy — the real, interactive one */}
        {cards}
        {/* Clone for the seamless -50% loop. `display:contents` keeps each
            card a direct flex item (gap + width unchanged, so the loop stays
            pixel-identical); `aria-hidden` drops the duplicate from the a11y
            tree and the clone cards carry tabIndex -1 so Tab skips them.
            Deliberately NOT `inert`: the clone is on-screen half the loop and
            must stay mouse-clickable. Wrapping also scopes the reused keys so
            they don't collide with the first copy's siblings. */}
        <div className="contents" aria-hidden="true">
          {cloneCards}
        </div>
      </div>
    </div>
  );
}

/* ─── Review Wall — 3 auto-scrolling rows, alternating directions ──── */

function ReviewWall({
  reviews,
  stats,
  copy,
  now,
}: {
  reviews: ReviewCardData[];
  stats: ReviewStats;
  copy: CommunityReviewCopy;
  now: number;
}) {
  // Split reviews into 3 rows
  const rows = useMemo(() => {
    const r1: ReviewCardData[] = [];
    const r2: ReviewCardData[] = [];
    const r3: ReviewCardData[] = [];
    reviews.forEach((r, i) => {
      if (i % 3 === 0) r1.push(r);
      else if (i % 3 === 1) r2.push(r);
      else r3.push(r);
    });
    return [r1, r2, r3];
  }, [reviews]);

  return (
    <div className="relative review-marquee-container">
      {/* Side fade gradients */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 sm:w-20 z-10 bg-linear-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 sm:w-20 z-10 bg-linear-to-l from-background to-transparent" />

      <div className="flex flex-col gap-2.5 py-1">
        <MarqueeRow
          reviews={rows[0]}
          direction="left"
          speed={25}
          copy={copy}
          now={now}
          fillerCard={
            <FillerBrick
              key="filler-delivery"
              icon={<Truck size={12} />}
              label={copy.stats.avgDelivery}
              value={copy.stats.avgDeliveryValue(stats.avgDeliveryDays)}
              sub={copy.stats.basedOnRecentReviews}
            />
          }
        />
        <MarqueeRow
          reviews={rows[1]}
          direction="right"
          speed={22}
          copy={copy}
          now={now}
          fillerCard={
            <FillerBrick
              key="filler-week"
              icon={<MessageSquare size={12} />}
              label={copy.stats.newReviews}
              value={String(stats.thisWeek)}
              sub={copy.stats.postedThisWeek}
            />
          }
        />
        <MarqueeRow
          reviews={rows[2]}
          direction="left"
          speed={28}
          copy={copy}
          now={now}
          fillerCard={
            <FillerBrick
              key="filler-community"
              icon={<Star size={12} />}
              label={copy.stats.avgRating}
              value={copy.stats.avgRatingValue(stats.avgRating)}
              sub={copy.stats.fromReviews(stats.total)}
            />
          }
        />
      </div>
    </div>
  );
}

/* ─── Photo masonry heights ─────────────────────────────────────────── */
const PHOTO_HEIGHTS = [
  "320px",
  "260px",
  "380px",
  "280px",
  "340px",
  "240px",
  "360px",
  "290px",
  "310px",
  "250px",
  "370px",
  "270px",
];

export function CommunityReviews({
  reviews,
  reviewStats,
  now,
}: CommunityReviewsProps) {
  const t = useTranslations("home.communityReviewsSection");
  const copy: CommunityReviewCopy = useMemo(
    () => ({
      fallbackSeller: t("fallback.seller"),
      fallbackProduct: t("fallback.product"),
      fallbackReviewPhoto: t("fallback.reviewPhoto"),
      deliveryDays: (count) => t("deliveryDays", { count }),
      stats: {
        avgDelivery: t("stats.avgDelivery"),
        avgDeliveryValue: (count) => t("stats.avgDeliveryValue", { count }),
        basedOnRecentReviews: t("stats.basedOnRecentReviews"),
        newReviews: t("stats.newReviews"),
        postedThisWeek: t("stats.postedThisWeek"),
        avgRating: t("stats.avgRating"),
        avgRatingValue: (rating) => t("stats.avgRatingValue", { rating }),
        fromReviews: (count) => t("stats.fromReviews", { count }),
      },
      time: {
        justNow: t("time.justNow"),
        minutesAgo: (count) => t("time.minutesAgo", { count }),
        hoursAgo: (count) => t("time.hoursAgo", { count }),
        oneDayAgo: t("time.oneDayAgo"),
        daysAgo: (count) => t("time.daysAgo", { count }),
        monthsAgo: (count) => t("time.monthsAgo", { count }),
      },
    }),
    [t],
  );
  const { photoReviews, textReviews } = useMemo(() => {
    const photo: ReviewCardData[] = [];
    const text: ReviewCardData[] = [];
    for (const r of reviews) {
      if (r.images && r.images.length > 0) {
        photo.push(r);
      } else if (r.text) {
        text.push(r);
      }
    }
    return {
      photoReviews: photo.slice(0, 12),
      textReviews: text.slice(0, 24),
    };
  }, [reviews]);
  const header = useRevealOnScroll<HTMLDivElement>();

  return (
    <section className="py-20 bg-background">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4">
        <div
          ref={header.ref}
          data-revealed={header.revealed}
          className="reveal-fade"
        >
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
            {t("eyebrow")}
          </p>
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
                {t("heading")}
              </h2>
              <p className="text-muted-foreground flex items-center gap-1.5">
                <MessageSquare size={14} />
                {t("subtitle")}
              </p>
            </div>
            <Link
              href="/reviews"
              prefetch={false}
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:brightness-110 transition-colors"
            >
              {t("seeAll")}
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Text Reviews — Auto-scrolling Review Wall (first) ── */}
      {textReviews.length > 0 && (
        <div className="mb-14">
          <div className="max-w-7xl mx-auto px-4 mb-5">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <MessageSquare size={14} />
              {t("recentReviews")}
            </h3>
          </div>
          <ReviewWall
            reviews={textReviews}
            stats={reviewStats}
            copy={copy}
            now={now}
          />
        </div>
      )}

      {/* ── Photo Reviews — CSS columns masonry (second) ── */}
      {photoReviews.length > 0 && (
        <div className="max-w-7xl mx-auto px-4">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-5">
            <Camera size={14} />
            {t("photoReviews")}
          </h3>
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-4">
            {photoReviews.map((review, i) => (
              <PhotoReviewCard
                key={
                  review.id ??
                  `photo-${review.sellerId}-${review.createdAt}-${review.refNum ?? review.itemName ?? "review"}`
                }
                review={review}
                height={PHOTO_HEIGHTS[i % PHOTO_HEIGHTS.length]}
                copy={copy}
                now={now}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mobile CTA */}
      <div className="mt-8 text-center sm:hidden px-4">
        <Link
          href="/reviews"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
        >
          {t("seeAll")}
          <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}
