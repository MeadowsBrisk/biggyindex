"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSetAtom } from "jotai";
import { motion } from "framer-motion";
import {
  Star,
  MessageSquare,
  ArrowRight,
  Truck,
  Camera,
  ImageOff,
  User,
  ShoppingBag,
} from "lucide-react";
import { expandedRefNumAtom, photoReviewModalAtom } from "@/store/atoms";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";

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
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={
            i < stars
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
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={
            i < stars
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-foreground/15"
          }
        />
      ))}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/* ─── Photo Review Card ─────────────────────────────────────────────── */

function PhotoReviewCard({
  review,
  height,
}: {
  review: ReviewCardData;
  height: string;
}) {
  const openModal = useSetAtom(photoReviewModalAtom);
  const imageUrl = review.images?.[0] ?? undefined;
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={() => openModal(review)}
      className="group relative w-full overflow-hidden rounded-xl break-inside-avoid mb-4 cursor-pointer"
      style={{ height }}
    >
      {imageUrl && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={review.itemName ?? "Review photo"}
          loading="lazy"
          onError={() => setImgError(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 bg-linear-to-br from-emerald-900/40 via-emerald-950/60 to-black/70 flex items-center justify-center">
          <ImageOff size={28} className="text-white/20" />
        </div>
      )}
      <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-transparent" />
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 pt-3">
        <StarRating rating={review.rating} size={12} />
        <span className="text-[10px] text-white/50 font-medium">
          {timeAgo(review.createdAt)}
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
            sellerName={review.sellerName ?? "Seller"}
            imageUrl={review.sellerAvatar ?? null}
            showInitialTooltip
          >
            {review.sellerAvatar ? (
              <img
                src={review.sellerAvatar}
                alt={review.sellerName ?? "Seller"}
                className="w-5 h-5 rounded-full object-cover border border-white/20 shrink-0"
                loading="lazy"
              />
            ) : (
              <div
                className="w-5 h-5 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center shrink-0"
              >
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
              {review.sellerName}
            </p>
          </div>
          {review.daysToArrive != null && (
            <div className="flex items-center gap-1 shrink-0">
              <Truck size={9} className="text-white/40" />
              <span className="text-[9px] text-white/40">
                {review.daysToArrive}d
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/* ─── Marquee Review Card ───────────────────────────────────────────── */

function MarqueeReviewCard({ review }: { review: ReviewCardData }) {
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const canOpen = !!review.refNum;

  return (
    <button
      type="button"
      onClick={() => canOpen && setRefNum(review.refNum!)}
      disabled={!canOpen}
      className={`w-70 sm:w-80 shrink-0 text-left rounded-xl border border-border bg-card p-3 flex flex-col transition-colors select-none ${
        canOpen
          ? "hover:border-primary/30 hover:bg-surface-hover cursor-pointer"
          : "cursor-default"
      }`}
      style={{ height: "180px" }}
    >
      {/* Top: stars + time */}
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <StarRatingDark rating={review.rating} size={10} />
        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
          {timeAgo(review.createdAt)}
        </span>
      </div>

      {/* Middle: review text (fades at bottom if clamped; click card to read full via detail overlay) */}
      {review.text && (
        <p
          className="text-[12.5px] text-foreground/80 leading-relaxed line-clamp-5 mb-1.5 flex-1 min-h-0 [mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)]"
        >
          {review.text}
        </p>
      )}

      {/* Bottom: seller + product info */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border shrink-0 mt-auto">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Seller avatar with tooltip */}
          <SellerAvatarTooltip
            sellerName={review.sellerName ?? "Seller"}
            imageUrl={review.sellerAvatar ?? null}
            showInitialTooltip
          >
            {review.sellerAvatar ? (
              <img
                src={review.sellerAvatar}
                alt={review.sellerName ?? "Seller"}
                className="w-6 h-6 rounded-full object-cover border border-border shrink-0"
                loading="lazy"
              />
            ) : (
              <div
                className="w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center shrink-0"
              >
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
              {review.sellerName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Product thumbnail with hover tooltip */}
          <SellerAvatarTooltip
            sellerName={review.itemName ?? "Product"}
            imageUrl={review.itemImage ?? null}
            tooltipSize={160}
          >
            {review.itemImage ? (
              <img
                src={review.itemImage}
                alt={review.itemName ?? "Product"}
                className="w-6 h-6 rounded object-cover border border-border"
                loading="lazy"
              />
            ) : (
              <div
                className="w-6 h-6 rounded bg-surface border border-border flex items-center justify-center"
              >
                <ShoppingBag size={10} className="text-muted-foreground" />
              </div>
            )}
          </SellerAvatarTooltip>
          {review.daysToArrive != null && (
            <div className="flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5">
              <Truck size={9} className="text-muted-foreground" />
              <span className="text-[9px] font-medium text-muted-foreground">
                {review.daysToArrive}d
              </span>
            </div>
          )}
        </div>
      </div>
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
      className="w-35 sm:w-40 shrink-0 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3 flex flex-col justify-center select-none relative overflow-hidden"
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
        {sub && (
          <p className="text-[10px] text-primary/50 mt-1">{sub}</p>
        )}
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
}: {
  reviews: ReviewCardData[];
  direction: "left" | "right";
  fillerCard?: React.ReactNode;
  speed?: number;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Build the card list once — we duplicate for seamless looping
  const cards = useMemo(() => {
    const items: React.ReactNode[] = [];
    reviews.forEach((review, i) => {
      items.push(
        <MarqueeReviewCard
          key={`${review.sellerId}-${review.createdAt}-${i}`}
          review={review}
        />,
      );
    });
    if (fillerCard) items.push(fillerCard);
    return items;
  }, [reviews, fillerCard]);

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
        {/* First copy */}
        {cards}
        {/* Duplicate for seamless loop */}
        {cards}
      </div>
    </div>
  );
}

/* ─── Review Wall — 3 auto-scrolling rows, alternating directions ──── */

function ReviewWall({
  reviews,
  stats,
}: {
  reviews: ReviewCardData[];
  stats: ReviewStats;
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
          fillerCard={
            <FillerBrick
              key="filler-delivery"
              icon={<Truck size={12} />}
              label="Avg delivery"
              value={`~${stats.avgDeliveryDays} days`}
              sub="based on recent reviews"
            />
          }
        />
        <MarqueeRow
          reviews={rows[1]}
          direction="right"
          speed={22}
          fillerCard={
            <FillerBrick
              key="filler-week"
              icon={<MessageSquare size={12} />}
              label="New reviews"
              value={String(stats.thisWeek)}
              sub="posted this week"
            />
          }
        />
        <MarqueeRow
          reviews={rows[2]}
          direction="left"
          speed={28}
          fillerCard={
            <FillerBrick
              key="filler-community"
              icon={<Star size={12} />}
              label="Avg rating"
              value={`${stats.avgRating} ★`}
              sub={`from ${stats.total} reviews`}
            />
          }
        />
      </div>
    </div>
  );
}

/* ─── Photo masonry heights ─────────────────────────────────────────── */
const PHOTO_HEIGHTS = [
  "320px", "260px", "380px", "280px", "340px", "240px",
  "360px", "290px", "310px", "250px", "370px", "270px",
];

export function CommunityReviews({ reviews, reviewStats }: CommunityReviewsProps) {
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

  return (
    <section className="py-20 bg-background">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
            Buyer feedback
          </p>
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
                Community Reviews
              </h2>
              <p className="text-muted-foreground flex items-center gap-1.5">
                <MessageSquare size={14} />
                Real feedback from real buyers
              </p>
            </div>
            <Link
              href="/reviews"
              prefetch={false}
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:brightness-110 transition-colors"
            >
              See all reviews
              <ArrowRight size={14} />
            </Link>
          </div>
        </motion.div>
      </div>

      {/* ── Text Reviews — Auto-scrolling Review Wall (first) ── */}
      {textReviews.length > 0 && (
        <div className="mb-14">
          <div className="max-w-7xl mx-auto px-4 mb-5">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <MessageSquare size={14} />
              Recent reviews
            </h3>
          </div>
          <ReviewWall reviews={textReviews} stats={reviewStats} />
        </div>
      )}

      {/* ── Photo Reviews — CSS columns masonry (second) ── */}
      {photoReviews.length > 0 && (
        <div className="max-w-7xl mx-auto px-4">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-5">
            <Camera size={14} />
            Photo reviews
          </h3>
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-4">
            {photoReviews.map((review, i) => (
              <PhotoReviewCard
                key={`photo-${review.sellerId}-${review.createdAt}-${i}`}
                review={review}
                height={PHOTO_HEIGHTS[i % PHOTO_HEIGHTS.length]}
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
          See all reviews
          <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}
