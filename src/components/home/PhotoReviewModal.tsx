"use client";

/**
 * PhotoReviewModal — opened from the home-page photo-review masonry wall.
 *
 * The review gets its own surface rather than reusing the item-detail overlay,
 * whose gallery shows the ITEM's photos and clamps the review text:
 *   - Zoomable gallery of the review's photos (site-wide ImageZoomPreview).
 *   - Full, unclamped review text plus seller/item context.
 *   - "Open item" (item-detail overlay, scrolled to this review) and
 *     "View on LittleBiggy" as distinct actions.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ArrowRight, ExternalLink, Star, Truck, User, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ReviewPhotoImg } from "@/components/ReviewPhotoImg";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useHistoryState } from "@/hooks/useHistoryState";
import { useLBGuideGate } from "@/hooks/useLBGuideGate";
import { cx } from "@/lib/cn";
import { decodeEntities } from "@/lib/format";
import { getReviewPhotoUrl, getSellerImageUrl } from "@/lib/images";
import { getLittleBiggyItemUrl } from "@/lib/tracking/littlebiggy";
import {
  expandedRefNumAtom,
  focusReviewIdAtom,
  itemsAtom,
  marketAtom,
  photoReviewModalAtom,
} from "@/store/atoms";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));
const STAR_POSITIONS = [0, 1, 2, 3, 4] as const;

interface TimeAgoParts {
  key:
    | "time.justNow"
    | "time.minutesAgo"
    | "time.hoursAgo"
    | "time.oneDayAgo"
    | "time.daysAgo"
    | "time.monthsAgo";
  count?: number;
}

function timeAgoParts(dateStr: string, now: number): TimeAgoParts {
  const diff = Math.max(0, now - new Date(dateStr).getTime());
  // Minute granularity under the hour — matches CommunityReviews and
  // WhatsNewSection (see the note on their `timeAgo`).
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 5) return { key: "time.justNow" };
  if (minutes < 60) return { key: "time.minutesAgo", count: minutes };
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return { key: "time.hoursAgo", count: hours };
  const days = Math.floor(hours / 24);
  if (days === 1) return { key: "time.oneDayAgo" };
  if (days < 30) return { key: "time.daysAgo", count: days };
  return { key: "time.monthsAgo", count: Math.floor(days / 30) };
}

function Stars({ rating }: { rating: number }) {
  const stars = Math.round((rating / 10) * 5);
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`${rating}/10`}
    >
      {STAR_POSITIONS.map((i) => (
        <Star
          key={i}
          size={14}
          className={
            i < stars
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-foreground/20"
          }
        />
      ))}
    </div>
  );
}

export function PhotoReviewModal() {
  const t = useTranslations("home.photoReviewModal");
  const [review, setReview] = useAtom(photoReviewModalAtom);
  const setExpandedRefNum = useSetAtom(expandedRefNumAtom);
  const setFocusReviewId = useSetAtom(focusReviewIdAtom);
  const items = useAtomValue(itemsAtom);
  const market = useAtomValue(marketAtom);
  const [zoomSignal, setZoomSignal] = useState<number | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [clientNow, setClientNow] = useState<number | null>(null);
  // Optimised 96px seller avatar — the raw `sellerAvatar` is the marketplace
  // original (can be multiple MB) rendered at 36px. Track the failed URL
  // rather than a boolean so the flag resets itself when a different review
  // opens; on failure show the placeholder, never the original.
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const avatarUrl = getSellerImageUrl(review?.sellerAvatar);
  const isOpen = review != null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setClientNow(Date.now());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Look up the item's LittleBiggy share link by refNum. If the share link is
  // missing, fall back to the direct LittleBiggy item URL.
  const shareItem = useMemo(() => {
    if (!review?.refNum) return null;
    return items.find((i) => i.refNum === review.refNum) ?? null;
  }, [items, review?.refNum]);

  const shareLink = useMemo(
    () => getLittleBiggyItemUrl(shareItem ?? { refNum: review?.refNum }),
    [shareItem, review?.refNum],
  );
  const outboundEvent = useMemo(() => {
    if (!review?.refNum || !shareLink) return null;
    return {
      id: String(shareItem?.refNum ?? review.refNum),
      url: shareLink,
      n: decodeEntities(shareItem?.n ?? review.itemName ?? ""),
      sid: shareItem?.sid != null ? String(shareItem.sid) : undefined,
      sn: shareItem?.sn ?? undefined,
      c: shareItem?.c ?? undefined,
      mkt: market,
    };
  }, [market, review?.itemName, review?.refNum, shareItem, shareLink]);
  const handleLittleBiggyClick = useLBGuideGate(outboundEvent);

  const handleClose = () => setReview(null);

  useHistoryState({
    id: "photo-review-modal",
    type: "modal",
    isOpen,
    onClose: handleClose,
    closeStrategy: "back",
  });

  useBodyScrollLock(isOpen);

  const images = useMemo(() => review?.images ?? [], [review]);
  // Raw URLs whose optimised CDN thumb has actually loaded in the grid below.
  // The zoom gallery upgrades a photo to the CDN variant only once that proof
  // exists, otherwise it keeps the raw URL — so a CDN miss (photo not yet
  // mirrored) can never produce a broken zoom slide. Keyed by raw URL, so it
  // stays valid across reviews.
  const [cdnLoaded, setCdnLoaded] = useState<Set<string>>(() => new Set());
  const markCdnLoaded = useCallback((rawUrl: string) => {
    setCdnLoaded((prev) =>
      prev.has(rawUrl) ? prev : new Set(prev).add(rawUrl),
    );
  }, []);
  const zoomImages = useMemo(
    () =>
      images.map((rawUrl) =>
        cdnLoaded.has(rawUrl)
          ? (getReviewPhotoUrl(rawUrl) ?? rawUrl)
          : rawUrl,
      ),
    [images, cdnLoaded],
  );
  const createdAgo = useMemo(() => {
    if (!review || clientNow == null) return null;
    const parts = timeAgoParts(review.createdAt, clientNow);
    return parts.count == null
      ? t(parts.key)
      : t(parts.key, { count: parts.count });
  }, [clientNow, review, t]);

  const openItem = () => {
    if (!review) return;
    // Flag the specific review so the item-detail overlay scrolls to it.
    if (review.id != null) setFocusReviewId(review.id);
    if (review.refNum) {
      setExpandedRefNum(review.refNum);
    }
    // Close this modal so the history stack lines up: the overlay pushes its
    // own entry, and Back from there should go home, not return here.
    setReview(null);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {review && (
        <motion.div
          key="photo-review-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-70 flex items-center justify-center p-3 md:p-6"
          onClick={handleClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Panel */}
          <motion.div
            initial={{ y: 16, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className={cx(
              "relative z-10 w-full max-w-5xl max-h-[92vh] overflow-hidden",
              "rounded-2xl border border-border bg-surface shadow-2xl",
              "flex flex-col md:flex-row",
            )}
          >
            {/* Left: image gallery. One image → large clickable hero; several
                → responsive grid so every photo in the review is visible.
                Clicking a tile opens the zoom gallery at that index. */}
            <div className="relative flex-1 min-h-60 md:min-h-115 bg-black/90 md:w-1/2 overflow-y-auto">
              {images.length === 0 ? (
                <div className="flex h-full w-full items-center justify-center text-white/40 text-sm">
                  {t("noImages")}
                </div>
              ) : images.length === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setZoomIndex(0);
                    setZoomSignal(Date.now());
                  }}
                  className="absolute inset-0 flex items-center justify-center overflow-hidden cursor-zoom-in"
                  aria-label={t("zoomImage")}
                >
                  <ReviewPhotoImg
                    rawUrl={images[0]}
                    alt={review.itemName ?? t("reviewPhoto")}
                    onCdnLoad={markCdnLoaded}
                    className="max-h-full max-w-full object-contain transition-transform duration-500 hover:scale-[1.02]"
                  />
                </button>
              ) : (
                <div
                  className={cx(
                    "grid gap-1.5 p-1.5",
                    images.length === 2 && "grid-cols-2",
                    images.length === 3 && "grid-cols-2",
                    images.length >= 4 && "grid-cols-2 sm:grid-cols-3",
                  )}
                >
                  {images.map((src, idx) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => {
                        setZoomIndex(idx);
                        setZoomSignal(Date.now());
                      }}
                      aria-label={t("zoomPhoto", {
                        index: idx + 1,
                        total: images.length,
                      })}
                      className={cx(
                        "relative aspect-square overflow-hidden rounded-md bg-black/60 group cursor-zoom-in",
                        // First image spans 2x2 at 3 photos so the grid
                        // doesn't read as sparse.
                        images.length === 3 &&
                          idx === 0 &&
                          "row-span-2 aspect-auto",
                      )}
                    >
                      <ReviewPhotoImg
                        rawUrl={src}
                        alt=""
                        loading="lazy"
                        onCdnLoad={markCdnLoaded}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    </button>
                  ))}
                </div>
              )}

              {images.length > 0 && (
                <Suspense fallback={null}>
                  <ImageZoomPreview
                    imageUrls={zoomImages}
                    alt={review.itemName ?? t("reviewPhoto")}
                    openSignal={zoomSignal}
                    startIndex={zoomIndex}
                  />
                </Suspense>
              )}
            </div>

            {/* Right: Review content. Close button lives inside this column
                (top-right) so it never overlaps the review image or text. */}
            <div className="flex flex-col md:w-1/2 md:min-w-[320px] max-h-[50vh] md:max-h-full overflow-y-auto relative">
              <button
                type="button"
                onClick={handleClose}
                aria-label={t("close")}
                className="sticky top-2 ml-auto mr-2 z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 border border-border text-muted hover:text-foreground hover:bg-surface transition-colors"
              >
                <X size={16} />
              </button>

              <div className="p-5 md:p-6 pt-0 -mt-6 flex-1">
                {/* Header: stars + when */}
                <div className="flex items-center justify-between mb-3">
                  <Stars rating={review.rating} />
                  <span className="text-xs text-muted">{createdAgo}</span>
                </div>

                {/* Seller + item */}
                <div className="flex items-start gap-3 mb-4">
                  {avatarUrl && failedAvatarUrl !== avatarUrl ? (
                    // biome-ignore lint/performance/noImgElement: seller avatar is an arbitrary marketplace URL
                    <img
                      src={avatarUrl}
                      alt={review.sellerName ?? ""}
                      className="h-9 w-9 rounded-full object-cover border border-border shrink-0"
                      loading="lazy"
                      onError={() => setFailedAvatarUrl(avatarUrl)}
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-muted/20 border border-border flex items-center justify-center shrink-0">
                      <User size={16} className="text-muted" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {review.itemName && (
                      <p className="text-sm font-semibold text-foreground truncate">
                        {review.itemName}
                      </p>
                    )}
                    {review.sellerName && (
                      <p className="text-xs text-muted truncate">
                        {t("bySeller", { seller: review.sellerName })}
                      </p>
                    )}
                  </div>
                  {review.daysToArrive != null && (
                    <div className="flex items-center gap-1 shrink-0 text-xs text-muted">
                      <Truck size={12} />
                      {t("deliveryDays", { days: review.daysToArrive })}
                    </div>
                  )}
                </div>

                {/* Full review text (no clamp) */}
                {review.text ? (
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
                    {review.text}
                  </p>
                ) : (
                  <p className="text-sm italic text-muted">{t("noText")}</p>
                )}
              </div>

              {/* Footer actions. "Open item" matches the site-wide primary CTA
                  (.ido-lb-btn); "View on LittleBiggy" stays a quiet ghost
                  button so the primary action owns the emphasis. */}
              <div className="border-t border-border bg-surface/60 p-4 flex flex-col sm:flex-row gap-2">
                {review.refNum && (
                  <button
                    type="button"
                    onClick={openItem}
                    className="prm-primary-btn group"
                  >
                    <span>{t("openItem")}</span>
                    <ArrowRight size={14} className="prm-primary-btn__arrow" />
                  </button>
                )}
                {shareLink && (
                  <a
                    href={shareLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleLittleBiggyClick}
                    className="prm-ghost-btn"
                  >
                    <span>{t("viewOnLittleBiggy")}</span>
                    <ExternalLink size={13} className="opacity-70" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
