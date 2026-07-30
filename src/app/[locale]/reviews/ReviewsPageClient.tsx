"use client";

import { useSetAtom } from "jotai";
import { Camera, MessageSquare, Star, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ReviewPhotoImg } from "@/components/ReviewPhotoImg";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { getReviewPhotoUrl, getSellerImageUrl } from "@/lib/images";
import { expandedRefNumAtom, sellerModalIdAtom } from "@/store/atoms";

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
  /** Server-computed intro paragraph (aggregate stats prose); null when the
      feed is empty or unrated. SSR'd here so it sits under the H1. */
  intro?: string | null;
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
          <span key={`star-${i}`} className="relative inline-flex h-3.5 w-3.5">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="absolute inset-0 h-full w-full"
            >
              <path
                className="fill-border"
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

interface TimeAgoParts {
  key: "justNow" | "minutesAgo" | "hoursAgo" | "oneDayAgo" | "daysAgo" | "monthsAgo";
  count?: number;
}

function timeAgoParts(dateStr: string, now: number): TimeAgoParts {
  const diff = now - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  // Same honesty rule as the home sections (2026-07-30): "Just now" used to
  // cover a full hour, so a seller uploading inventory showed a wall of
  // "Just now" cards long after the fact. Reserve it for < 5 minutes.
  if (hours < 1) {
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 5) return { key: "justNow" };
    return { key: "minutesAgo", count: minutes };
  }
  if (hours < 24) return { key: "hoursAgo", count: hours };
  const days = Math.floor(hours / 24);
  if (days === 1) return { key: "oneDayAgo" };
  if (days < 30) return { key: "daysAgo", count: days };
  return { key: "monthsAgo", count: Math.floor(days / 30) };
}

interface ArrivalParts {
  key: "sameDay" | "oneDay" | "days";
  count?: number;
}

function arrivalParts(days?: number): ArrivalParts | null {
  if (days == null) return null;
  if (days === 0) return { key: "sameDay" };
  if (days === 1) return { key: "oneDay" };
  return { key: "days", count: days };
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
  const t = useTranslations("reviews.page.row");
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const setSellerModal = useSetAtom(sellerModalIdAtom);
  const [zoomSignal, setZoomSignal] = useState<number | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const hasText = review.text && review.text.trim().length > 0;
  const hasImages = review.images && review.images.length > 0;
  const hasItemImage = !!review.itemImageUrl;
  const arrival = arrivalParts(review.daysToArrive);
  const panel = panelClass(review.rating);
  const sellerAvatar = getSellerImageUrl(review.sellerImageUrl);
  const createdAgo = useMemo(() => {
    const parts = timeAgoParts(review.createdAt, now);
    return parts.count == null
      ? t(parts.key)
      : t(parts.key, { count: parts.count });
  }, [now, review.createdAt, t]);
  const arrivalText = arrival
    ? arrival.count == null
      ? t(arrival.key)
      : t(arrival.key, { count: arrival.count })
    : null;

  const openZoom = useCallback((index: number) => {
    setZoomIndex(index);
    setZoomSignal((s) => (s ?? 0) + 1);
  }, []);

  // Raw photo URLs whose optimised CDN thumb has actually loaded — proof the
  // hash is mirrored, so the zoom gallery can upgrade to the CDN `full.avif`
  // sibling. Unproven photos keep the raw LB URL in zoom (the zoom slides
  // have no fallback of their own).
  const [cdnLoaded, setCdnLoaded] = useState<Set<string>>(() => new Set());
  const markCdnLoaded = useCallback((rawUrl: string) => {
    setCdnLoaded((prev) =>
      prev.has(rawUrl) ? prev : new Set(prev).add(rawUrl),
    );
  }, []);
  const zoomImages = useMemo(
    () =>
      (review.images ?? []).map((rawUrl) =>
        cdnLoaded.has(rawUrl)
          ? (getReviewPhotoUrl(rawUrl, "full") ?? rawUrl)
          : rawUrl,
      ),
    [review.images, cdnLoaded],
  );

  const itemThumb = hasItemImage ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={review.itemImageUrl}
      alt={review.itemName ?? ""}
      loading="lazy"
      className="h-12 w-12 object-cover"
    />
  ) : null;

  return (
    <div
      className={`relative rounded-xl border transition-colors ${panel} ${
        hasText ? "p-4 shadow-sm hover:shadow" : "border-dashed px-4 py-3"
      }`}
    >
      {/* Item thumbnail — top right */}
      {hasItemImage && (
        <SellerAvatarTooltip
          sellerName={review.itemName ?? ""}
          imageUrl={review.itemImageUrl}
          tooltipSize={160}
        >
          {review.refNum ? (
            <a
              href={`/item/${encodeURIComponent(review.refNum)}`}
              onClick={(e) => {
                // Middle-click / ctrl-click → let browser open in new tab
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey)
                  return;
                e.preventDefault();
                setRefNum(review.refNum!);
              }}
              className="absolute right-3 top-3 overflow-hidden rounded-lg border border-border bg-surface shadow-sm hover:ring-2 hover:ring-primary/30 transition-all"
            >
              {itemThumb}
            </a>
          ) : (
            /* No refNum → nothing to open; plain container, no click affordance */
            <span className="absolute right-3 top-3 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
              {itemThumb}
            </span>
          )}
        </SellerAvatarTooltip>
      )}

      <div className={hasItemImage ? "pr-18" : ""}>
        {/* Row 1: Seller avatar + item/seller names + stars + time */}
        <div className="flex items-start gap-2.5 mb-2">
          {/* Seller avatar */}
          <SellerAvatarTooltip
            sellerName={review.sellerName}
            imageUrl={sellerAvatar}
          >
            <a
              href={`/seller/${encodeURIComponent(review.sellerId)}`}
              onClick={(e) => {
                // Middle-click / ctrl-click → let browser open in new tab
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey)
                  return;
                e.preventDefault();
                setSellerModal(review.sellerId);
              }}
              className="shrink-0 mt-0.5"
              title={review.sellerName}
            >
              {sellerAvatar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={sellerAvatar}
                  alt={review.sellerName}
                  className="w-8 h-8 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary border border-primary/20">
                  {getInitials(review.sellerName)}
                </div>
              )}
            </a>
          </SellerAvatarTooltip>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {review.itemName &&
                (review.refNum ? (
                  <a
                    href={`/item/${encodeURIComponent(review.refNum)}`}
                    onClick={(e) => {
                      // Middle-click / ctrl-click → let browser open in new tab
                      if (
                        e.button !== 0 ||
                        e.metaKey ||
                        e.ctrlKey ||
                        e.shiftKey
                      )
                        return;
                      e.preventDefault();
                      setRefNum(review.refNum!);
                    }}
                    className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate max-w-[60%] text-left"
                  >
                    {review.itemName}
                  </a>
                ) : (
                  /* No refNum → nothing to open; plain text, no click affordance */
                  <span className="text-sm font-semibold text-foreground truncate max-w-[60%] text-left">
                    {review.itemName}
                  </span>
                ))}
              <a
                href={`/seller/${encodeURIComponent(review.sellerId)}`}
                onClick={(e) => {
                  // Middle-click / ctrl-click → let browser open in new tab
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey)
                    return;
                  e.preventDefault();
                  setSellerModal(review.sellerId);
                }}
                className="text-[11px] text-muted hover:text-primary transition-colors"
              >
                {review.sellerName}
              </a>
            </div>

            {/* Stars + arrival + time — same line */}
            <div className="flex items-center gap-2.5 mt-1">
              <StarRating rating={review.rating} />
              {arrival && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Truck size={11} />
                  {arrivalText}
                </span>
              )}
              <span className="text-[10px] font-medium text-muted-foreground ml-auto shrink-0">
                {createdAgo}
              </span>
            </div>
          </div>
        </div>

        {/* Review text */}
        {hasText && (
          <div className="text-[13px] text-foreground/85 leading-relaxed pl-10.5">
            {review
              .text!.split(/\n{2,}/)
              .filter(Boolean)
              .map((para, i) => (
                <p key={`${para}-${i}`} className="mb-1.5 last:mb-0">
                  {para.replace(/\n+/g, " ").trim()}
                </p>
              ))}
          </div>
        )}

        {/* Review images — clickable with zoom */}
        {hasImages && (
          <div className="flex flex-wrap gap-1.5 mt-2 pl-10.5">
            {review.images!.map((img, i) => (
              <button
                key={`${img}-${i}`}
                type="button"
                onClick={() => openZoom(i)}
                className="cursor-zoom-in"
              >
                <ReviewPhotoImg
                  rawUrl={img}
                  size="thumb"
                  alt={t("reviewPhoto", { index: i + 1 })}
                  loading="lazy"
                  onCdnLoad={markCdnLoaded}
                  className="h-16 w-16 rounded-lg object-cover border border-border hover:scale-105 hover:ring-2 hover:ring-primary/40 transition-all"
                />
              </button>
            ))}
            {zoomSignal != null && (
              <Suspense fallback={null}>
                <ImageZoomPreview
                  imageUrl={zoomImages[zoomIndex]}
                  imageUrls={zoomImages}
                  startIndex={zoomIndex}
                  alt={t("reviewPhoto", { index: zoomIndex + 1 })}
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

export function ReviewsPageClient({ reviews, intro }: Props) {
  const t = useTranslations("reviews.page");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNow(Date.now());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
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
          {t("title")}
        </h1>
        <p className="text-muted text-sm">
          {t("subtitle", { count: reviews.length })}
        </p>
        {intro && (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
            {intro}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {(
          [
            { key: "all", label: t("filters.all"), count: reviews.length },
            {
              key: "with-images",
              label: t("filters.withPhotos"),
              count: imageCount,
              icon: <Camera size={12} />,
            },
            {
              key: "with-text",
              label: t("filters.withComments"),
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
                : "text-muted bg-surface border border-border hover:text-foreground"
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
          <div key={review.id} className="break-inside-avoid mb-4">
            <ReviewRow review={review} now={now} />
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted py-12">{t("noMatches")}</p>
      )}
    </div>
  );
}
