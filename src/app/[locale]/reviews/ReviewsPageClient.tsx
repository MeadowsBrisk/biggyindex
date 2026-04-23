"use client";

import { useState, useMemo, useEffect, lazy, Suspense, useCallback } from "react";
import { useSetAtom } from "jotai";
import { Star, Truck, Camera, MessageSquare } from "lucide-react";
import { expandedRefNumAtom, sellerModalIdAtom } from "@/store/atoms";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { getSellerImageUrl } from "@/lib/images";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

interface ReviewCardData {
  id: number;
  sellerId: string;
  sellerName: string;
  sellerImageUrl?: string;
  itemName?: string;
  itemImageUrl?: string;
  refNum?: string;
  rating: number;
  text?: string;
  daysToArrive?: number;
  createdAt: string;
  images?: string[];
}

interface Props {
  reviews: ReviewCardData[];
}

/* ReviewsPageClient no longer accepts `now` as a prop —
   it's computed client-side to avoid breaking "use cache" */

type FilterMode = "all" | "with-images" | "with-text";

/* --- Score panel color --- */
function panelClass(score: number | null): string {
  if (score == null) return "border-[var(--border)] bg-[var(--card)]";
  if (score >= 9) return "border-emerald-500/25 bg-emerald-500/5";
  if (score >= 7) return "border-sky-500/20 bg-sky-500/5";
  if (score >= 5) return "border-amber-500/20 bg-amber-500/5";
  return "border-red-500/20 bg-red-500/5";
}

function StarRating({ rating }: { rating: number }) {
  const total = 5;
  const starValue = Math.max(0, Math.min(10, rating)) / 2;
  return (
    <div className="flex items-center gap-0.5" title={`${rating}/10`}>
      {Array.from({ length: total }, (_, i) => {
        const isFull = starValue >= i + 1;
        const isHalf = !isFull && starValue > i && starValue < i + 1;
        return (
          <span key={i} className="relative inline-flex h-3.5 w-3.5">
            <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full">
              <path
                className="fill-[var(--border)]"
                d="M12 2.5 14.9 8l6.1.9-4.4 4.3 1 6.2L12 16.9 6.4 19.4l1-6.2-4.4-4.3L9.1 8z"
              />
              {(isFull || isHalf) && (
                <path
                  className="fill-primary"
                  d={
                    isHalf
                      ? "M12 2.5 12 16.9 6.4 19.4l1-6.2-4.4-4.3L9.1 8z"
                      : "M12 2.5 14.9 8l6.1.9-4.4 4.3 1 6.2L12 16.9 6.4 19.4l1-6.2-4.4-4.3L9.1 8z"
                  }
                />
              )}
            </svg>
          </span>
        );
      })}
    </div>
  );
}

function timeAgo(dateStr: string, now: number): string {
  const diff = now - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function arrivalLabel(days?: number): string | null {
  if (days == null) return null;
  if (days === 0) return "same day";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function ReviewRow({ review, now }: { review: ReviewCardData; now: number }) {
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const setSellerModal = useSetAtom(sellerModalIdAtom);
  const [zoomSignal, setZoomSignal] = useState<number | null>(null);
  const hasText = review.text && review.text.trim().length > 0;
  const hasImages = review.images && review.images.length > 0;
  const hasItemImage = !!review.itemImageUrl;
  const arrival = arrivalLabel(review.daysToArrive);
  const panel = panelClass(review.rating);
  const sellerAvatar = getSellerImageUrl(review.sellerImageUrl);

  const openZoom = useCallback(() => {
    setZoomSignal((s) => (s ?? 0) + 1);
  }, []);

  return (
    <div
      className={`relative rounded-xl border transition-colors ${panel} ${
        hasText ? "p-4 shadow-sm hover:shadow" : "border-dashed px-4 py-3"
      }`}
    >
      {/* Item thumbnail — top right */}
      {hasItemImage && (
        <button
          type="button"
          onClick={() => review.refNum && setRefNum(review.refNum)}
          className="absolute right-3 top-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm hover:ring-2 hover:ring-primary/30 transition-all"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={review.itemImageUrl}
            alt={review.itemName ?? ""}
            loading="lazy"
            className="h-12 w-12 object-cover"
          />
        </button>
      )}

      <div className={hasItemImage ? "pr-18" : ""}>
        {/* Row 1: Seller avatar + item/seller names + stars + time */}
        <div className="flex items-start gap-2.5 mb-2">
          {/* Seller avatar */}
          <SellerAvatarTooltip sellerName={review.sellerName} imageUrl={sellerAvatar}>
            <button
              type="button"
              onClick={() => setSellerModal(review.sellerId)}
              className="shrink-0 mt-0.5"
              title={review.sellerName}
            >
              {sellerAvatar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={sellerAvatar}
                  alt={review.sellerName}
                  className="w-8 h-8 rounded-full object-cover border border-[var(--border)]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary border border-primary/20">
                  {getInitials(review.sellerName)}
                </div>
              )}
            </button>
          </SellerAvatarTooltip>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {review.itemName && (
                <button
                  type="button"
                  onClick={() => review.refNum && setRefNum(review.refNum)}
                  className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate max-w-[60%] text-left"
                >
                  {review.itemName}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSellerModal(review.sellerId)}
                className="text-[11px] text-muted hover:text-primary transition-colors"
              >
                {review.sellerName}
              </button>
            </div>

            {/* Stars + arrival + time — same line */}
            <div className="flex items-center gap-2.5 mt-1">
              <StarRating rating={review.rating} />
              {arrival && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Truck size={11} />
                  {arrival}
                </span>
              )}
              <span className="text-[10px] font-medium text-muted-foreground ml-auto shrink-0">
                {timeAgo(review.createdAt, now)}
              </span>
            </div>
          </div>
        </div>

        {/* Review text */}
        {hasText && (
          <div className="text-[13px] text-foreground/85 leading-relaxed pl-[42px]">
            {review.text!.split(/\n{2,}/).filter(Boolean).map((para, i) => (
              <p key={i} className="mb-1.5 last:mb-0">
                {para.replace(/\n+/g, " ").trim()}
              </p>
            ))}
          </div>
        )}

        {/* Review images — clickable with zoom */}
        {hasImages && (
          <div className="flex flex-wrap gap-1.5 mt-2 pl-[42px]">
            {review.images!.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={openZoom}
                className="cursor-zoom-in"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img}
                  alt="Review photo"
                  loading="lazy"
                  className="h-16 w-16 rounded-lg object-cover border border-[var(--border)] hover:scale-105 hover:ring-2 hover:ring-primary/40 transition-all"
                />
              </button>
            ))}
            {zoomSignal != null && (
              <Suspense fallback={null}>
                <ImageZoomPreview
                  imageUrl={review.images![0]}
                  imageUrls={review.images}
                  alt="Review photo"
                  openSignal={zoomSignal}
                />
              </Suspense>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ReviewsPageClient({ reviews }: Props) {
  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), []);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const filtered = useMemo(() => {
    switch (filterMode) {
      case "with-images":
        return reviews.filter((r) => r.images && r.images.length > 0);
      case "with-text":
        return reviews.filter((r) => r.text && r.text.trim().length > 10);
      default:
        return reviews;
    }
  }, [reviews, filterMode]);

  const imageCount = reviews.filter(
    (r) => r.images && r.images.length > 0,
  ).length;
  const textCount = reviews.filter(
    (r) => r.text && r.text.trim().length > 10,
  ).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-1">
          Community Reviews
        </h1>
        <p className="text-muted text-sm">
          {reviews.length} recent reviews from Little Biggy buyers
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {(
          [
            { key: "all", label: "All", count: reviews.length },
            {
              key: "with-images",
              label: "With photos",
              count: imageCount,
              icon: <Camera size={12} />,
            },
            {
              key: "with-text",
              label: "With comments",
              count: textCount,
              icon: <MessageSquare size={12} />,
            },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilterMode(f.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filterMode === f.key
                ? "bg-primary/15 text-primary"
                : "text-muted bg-[var(--surface)] border border-[var(--border)] hover:text-foreground"
            }`}
          >
            {"icon" in f && f.icon}
            {f.label}
            <span className="opacity-60">({f.count})</span>
          </button>
        ))}
      </div>

      {/* Review list — single column on mobile, two columns on xl */}
      <div className="columns-1 xl:columns-2 gap-4">
        {filtered.map((review, i) => (
          <div key={`${review.id}-${i}`} className="break-inside-avoid mb-4">
            <ReviewRow review={review} now={now} />
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted py-12">
          No reviews match this filter
        </p>
      )}
    </div>
  );
}
