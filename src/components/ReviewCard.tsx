"use client";

import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { Truck } from "lucide-react";
import { cx } from "@/lib/cn";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { decodeEntities } from "@/lib/format";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

/* ── Types ── */

interface ReviewSegment {
  type: string;
  value: string;
}

export interface Review {
  id: number;
  created: number;
  rating: number;
  daysToArrive: number | null;
  segments: ReviewSegment[];
  item: { refNum: string; name: string; id: number };
}

/* ── Helpers ── */

function relativeTime(unix: number): string {
  const ms = Date.now() - unix * 1000;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Per-score panel class (background + border) matching old-biggyindex */
function panelClassForScore(rating: number): string {
  const r = Math.round(Math.max(1, Math.min(10, rating)));
  return `review-panel-${r}`;
}

/** Per-score text color class */
function scoreTextClass(rating: number): string {
  const r = Math.round(Math.max(1, Math.min(10, rating)));
  return `review-score-${r}`;
}

/** Split text on double-newlines into paragraphs */
function renderParagraphs(text: string) {
  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs.length <= 1) {
    return <span>{text}</span>;
  }
  return (
    <>
      {paragraphs.map((p, i) => (
        <span key={i} className={i > 0 ? "block mt-1.5" : undefined}>
          {p}
        </span>
      ))}
    </>
  );
}

/* ── ReviewCard ── */

interface ReviewCardProps {
  review: Review;
  /** Callback when item name is clicked (e.g. navigate to that item) */
  onItemClick?: (refNum: string) => void;
  /** CDN image URL for item thumbnail tooltip on hover */
  itemImageUrl?: string;
  /** Compact mode: smaller card, less spacing (for item-detail inline reviews) */
  compact?: boolean;
  /** When true, scroll into view and flash a highlight ring. Used when
      jumping from the home-page photo review modal to the corresponding
      review inside the item-detail overlay. */
  highlighted?: boolean;
}

export function ReviewCard({ review, onItemClick, itemImageUrl, compact, highlighted }: ReviewCardProps) {
  const [zoomSignal, setZoomSignal] = useState<number | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!highlighted) return;
    // Wait a tick so the overlay finishes mounting/layout before scrolling.
    const t = window.setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [highlighted]);

  // Extract text and images from segments
  const { text, imageUrls } = useMemo(() => {
    const textParts: string[] = [];
    const imgs: string[] = [];
    for (const seg of review.segments ?? []) {
      if (seg.type === "text" && seg.value?.trim()) {
        textParts.push(decodeEntities(seg.value.trim()));
      } else if (seg.type === "image" && seg.value) {
        imgs.push(seg.value);
      }
    }
    return { text: textParts.join("\n\n") || null, imageUrls: imgs };
  }, [review.segments]);

  const panelClass = panelClassForScore(review.rating);

  return (
    <>
      <div
        ref={rootRef}
        data-review-id={review.id}
        className={cx(
          "rounded-lg transition-colors",
          panelClass,
          compact ? "p-2.5" : "p-3",
          highlighted && "review-card--highlighted",
        )}
      >
        {/* Header: score badge + time */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className={cx("review-score-badge font-bold tabular-nums", compact ? "text-xs" : "text-sm")}>
            {review.rating}
          </span>
          <span className="text-[11px] text-muted ml-auto">
            {relativeTime(review.created)}
          </span>
        </div>

        {/* Item link */}
        {review.item?.name && (
          onItemClick && itemImageUrl ? (
            <SellerAvatarTooltip
              sellerName={decodeEntities(review.item.name)}
              imageUrl={itemImageUrl}
              tooltipSize={120}
            >
              <button
                type="button"
                onClick={() => onItemClick(String(review.item.refNum))}
                className="block text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-primary transition-colors truncate mb-1 cursor-pointer text-left max-w-full"
              >
                {decodeEntities(review.item.name)}
              </button>
            </SellerAvatarTooltip>
          ) : (
            <p className="text-[11px] text-muted/60 truncate mb-1">
              {decodeEntities(review.item.name)}
            </p>
          )
        )}

        {/* Text body */}
        {text && (
          <div className={cx(
            "text-foreground/85 leading-relaxed",
            compact ? "text-xs" : "text-sm",
          )}>
            {renderParagraphs(text)}
          </div>
        )}

        {/* Image thumbnails */}
        {imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {imageUrls.map((src, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setZoomIndex(idx);
                  setZoomSignal(Date.now());
                }}
                className="w-12 h-12 rounded-md overflow-hidden bg-surface border border-border cursor-pointer hover:opacity-80 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Review image ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

        {/* Footer: delivery days with truck icon */}
        {review.daysToArrive != null && (
          <>
            <div className="review-divider" />
            <div className="review-footer">
              <Truck size={11} />
              <span>{review.daysToArrive}d</span>
            </div>
          </>
        )}
      </div>

      {/* Image zoom portal */}
      {imageUrls.length > 0 && zoomSignal && (
        <Suspense fallback={null}>
          <ImageZoomPreview
            imageUrls={imageUrls}
            alt="Review image"
            openSignal={zoomSignal}
            startIndex={zoomIndex}
          />
        </Suspense>
      )}
    </>
  );
}

/* ── ReviewStats header ── */

interface ReviewStatsProps {
  avg: number | null | undefined;
  count: number | null | undefined;
  days: number | null | undefined;
  recentCount?: number;
}

export function ReviewStatsHeader({ avg, count, days, recentCount }: ReviewStatsProps) {
  if (avg == null && count == null) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted mb-2">
      {avg != null && (
        <span className={cx("font-semibold tabular-nums", scoreTextClass(Math.round(avg)))}>
          {avg.toFixed(1)}/10 avg
        </span>
      )}
      {count != null && (
        <span>
          {recentCount != null && recentCount < count
            ? `${recentCount} recent (${count} total)`
            : `${count} reviews`}
        </span>
      )}
      {days != null && (
        <span>~{Math.round(days)}d avg delivery</span>
      )}
    </div>
  );
}
