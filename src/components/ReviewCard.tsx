"use client";

import { Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ReviewPhotoImg } from "@/components/ReviewPhotoImg";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { cx } from "@/lib/cn";
import { decodeEntities } from "@/lib/format";
import { getReviewPhotoUrl } from "@/lib/images";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

/* ── Types ── */

interface ReviewSegment {
  type: string;
  /** Text content for `text` segments; legacy image segments used it too. */
  value?: string;
  /** Photo URL for `image` segments (the current crawler shape). */
  url?: string;
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

interface RelativeTimeParts {
  key: "time.minutesAgo" | "time.hoursAgo" | "time.daysAgo" | "time.monthsAgo";
  count: number;
}

function relativeTimeParts(unix: number, now: number): RelativeTimeParts {
  const ms = Math.max(0, now - unix * 1000);
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return { key: "time.minutesAgo", count: mins };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { key: "time.hoursAgo", count: hrs };
  const days = Math.floor(hrs / 24);
  if (days < 30) return { key: "time.daysAgo", count: days };
  const months = Math.floor(days / 30);
  return { key: "time.monthsAgo", count: months };
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
        <span key={`${p}-${i}`} className={i > 0 ? "block mt-1.5" : undefined}>
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
  /** Hide the item label when reviews are already scoped to a single item. */
  showItemName?: boolean;
  /** When true, scroll into view and flash a highlight ring. Used when
      jumping from the home-page photo review modal to the corresponding
      review inside the item-detail overlay. */
  highlighted?: boolean;
}

export function ReviewCard({
  review,
  onItemClick,
  itemImageUrl,
  compact,
  showItemName = true,
  highlighted,
}: ReviewCardProps) {
  const t = useTranslations("reviews.card");
  const [zoomSignal, setZoomSignal] = useState<number | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [clientNow, setClientNow] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setClientNow(Date.now());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
      } else if (seg.type === "image") {
        // Current crawler blobs put the photo URL in `url`; legacy payloads
        // used `value`. Accept both so photos render on item/seller surfaces.
        const photoUrl = seg.url ?? seg.value;
        if (photoUrl) imgs.push(photoUrl);
      }
    }
    return { text: textParts.join("\n\n") || null, imageUrls: imgs };
  }, [review.segments]);

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
      imageUrls.map((rawUrl) =>
        cdnLoaded.has(rawUrl)
          ? (getReviewPhotoUrl(rawUrl, "full") ?? rawUrl)
          : rawUrl,
      ),
    [imageUrls, cdnLoaded],
  );

  const panelClass = panelClassForScore(review.rating);
  const createdAgo = useMemo(() => {
    if (clientNow == null) return null;
    const parts = relativeTimeParts(review.created, clientNow);
    return t(parts.key, { count: parts.count });
  }, [clientNow, review.created, t]);

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
          <span
            className={cx(
              "review-score-badge font-bold tabular-nums",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {review.rating}
          </span>
          <span className="text-[11px] text-muted ml-auto">{createdAgo}</span>
        </div>

        {/* Item link */}
        {showItemName &&
          review.item?.name &&
          (onItemClick && itemImageUrl ? (
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
          ))}

        {/* Text body */}
        {text && (
          <div
            className={cx(
              "text-foreground/85 leading-relaxed",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {renderParagraphs(text)}
          </div>
        )}

        {/* Image thumbnails */}
        {imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {imageUrls.map((src, idx) => (
              <button
                key={`${src}-${idx}`}
                type="button"
                onClick={() => {
                  setZoomIndex(idx);
                  setZoomSignal(Date.now());
                }}
                className="w-12 h-12 rounded-md overflow-hidden bg-surface border border-border cursor-pointer hover:opacity-80 transition-opacity"
              >
                <ReviewPhotoImg
                  rawUrl={src}
                  size="thumb"
                  alt={t("imageAlt", { index: idx + 1 })}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onCdnLoad={markCdnLoaded}
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
            imageUrls={zoomImages}
            alt={t("imageAlt", { index: zoomIndex + 1 })}
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

export function ReviewStatsHeader({
  avg,
  count,
  days,
  recentCount,
}: ReviewStatsProps) {
  const t = useTranslations("reviews.card.stats");

  if (avg == null && count == null) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted mb-2">
      {avg != null && (
        <span
          className={cx(
            "font-semibold tabular-nums",
            scoreTextClass(Math.round(avg)),
          )}
        >
          {t("average", { rating: avg.toFixed(1) })}
        </span>
      )}
      {count != null && (
        <span>
          {recentCount != null && recentCount < count
            ? t("recentTotal", { recent: recentCount, total: count })
            : t("reviewCount", { count })}
        </span>
      )}
      {days != null && (
        <span>{t("avgDelivery", { days: Math.round(days) })}</span>
      )}
    </div>
  );
}
