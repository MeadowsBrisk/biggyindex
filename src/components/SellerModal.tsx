"use client";

import { useAtom, useAtomValue } from "jotai";
import { Star, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
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
import { type Review, ReviewCard } from "@/components/ReviewCard";

import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import {
  SellerCommunityFeedbackBlock,
  SellerFeedbackActions,
} from "@/components/SellerCommunityFeedback";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useHistoryState } from "@/hooks/useHistoryState";
import { useLBGuideGate } from "@/hooks/useLBGuideGate";
import historyManager from "@/lib/historyManager";
import { getSellerImageUrl } from "@/lib/images";
import { marketToLocale } from "@/lib/market/market";
import type { SellerDetail } from "@/lib/types";
import {
  extractLittleBiggyId,
  normalizeLittleBiggyUrl,
} from "@/lib/tracking/littlebiggy";
import {
  categoryAtom,
  expandedRefNumAtom,
  forceEnglishAtom,
  marketAtom,
  selectedSellersAtom,
  sellerModalIdAtom,
  sellersMapAtom,
} from "@/store/atoms";

const ImageZoomPreview = lazy(() => import("@/components/ImageZoomPreview"));

/** Rating-based badge color (matches old biggyindex review-panel-N pattern) */
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

/* ── Component ── */
export function SellerModal() {
  const t = useTranslations("seller.modal");
  const [sellerId, setSellerId] = useAtom(sellerModalIdAtom);
  const sellersMap = useAtomValue(sellersMapAtom);
  const market = useAtomValue(marketAtom);
  const forceEnglish = useAtomValue(forceEnglishAtom);
  const [, setRefNum] = useAtom(expandedRefNumAtom);
  const [, setSelectedSellers] = useAtom(selectedSellersAtom);
  const [, setCategory] = useAtom(categoryAtom);

  const [detail, setDetail] = useState<SellerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  /**
   * Review rating filter.
   *  - null: show all
   *  - number: exact rating bucket (1..10) — click a rating pill
   *  - "low": any rating <= 5 — click the "X low ratings" pill
   */
  const [ratingFilter, setRatingFilter] = useState<number | "low" | null>(null);
  const [avatarZoomSignal, setAvatarZoomSignal] = useState<number | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Seller from the index (instant)
  const indexSeller = sellerId ? sellersMap.get(sellerId) : undefined;
  const name = detail?.sellerName ?? indexSeller?.name ?? t("fallbackName");
  const initial = name.charAt(0).toUpperCase();

  // Fetch detail on open
  useEffect(() => {
    if (!sellerId) {
      setDetail(null);
      setRatingFilter(null);
      return;
    }
    detailAbortRef.current?.abort();
    const ac = new AbortController();
    detailAbortRef.current = ac;
    setLoading(true);
    const mkt = String(market || "GB").toLowerCase();
    fetch(
      `/api/seller/${encodeURIComponent(String(sellerId))}?mkt=${encodeURIComponent(mkt)}`,
      { signal: ac.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!ac.signal.aborted) {
          setDetail(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [sellerId, market]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setSellerId(null);
    }, 150);
  }, [setSellerId]);

  // Register with history manager so pressing Back closes the modal
  // (rather than navigating away). Nested zoom overlays push their own entry
  // on top — so Back closes zoom first, then a second Back closes this modal.
  const { closeOverlay: closeViaHistory } = useHistoryState({
    id: `seller-modal-${sellerId ?? "none"}`,
    type: "modal",
    isOpen: !!sellerId && !closing,
    onClose: close,
    closeStrategy: "back",
  });

  // Escape to close
  useEffect(() => {
    if (!sellerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViaHistory();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sellerId, closeViaHistory]);

  // Lock body scroll via the ref-counted hook so stacking with another
  // open modal (typically ItemDetailOverlay opened first → SellerModal
  // opened on top from a card click) doesn't fight on `body.style.overflow`.
  // Previously this was a hand-rolled effect on `document.body.style.overflow`
  // — which clashed with ItemDetailOverlay's `useBodyScrollLock`-driven
  // lock on `<html>` and was a likely culprit for the "header disappears
  // when nested" visual glitch.
  useBodyScrollLock(!!sellerId);

  // Image from detail — optimized via CDN
  const rawImg = detail?.sellerImageUrl ?? detail?.imageUrl ?? null;
  const img = getSellerImageUrl(rawImg) ?? null;
  const zoomImg = getSellerImageUrl(rawImg, "full") ?? img;

  // Share link (matches old-biggyindex: prefer share, fall back to sellerUrl)
  const shareLink = useMemo(() => {
    if (!detail) return null;
    if (typeof detail.share === "string" && detail.share) {
      return normalizeLittleBiggyUrl(detail.share);
    }
    if (detail.sellerUrl) return normalizeLittleBiggyUrl(detail.sellerUrl);
    return null;
  }, [detail]);
  const outboundEvent = useMemo(() => {
    if (!shareLink || !sellerId) return null;
    return {
      id: extractLittleBiggyId(shareLink),
      url: shareLink,
      sid: sellerId,
      sn: name,
      c: "Seller",
      mkt: market,
    };
  }, [market, name, sellerId, shareLink]);
  const handleLittleBiggyClick = useLBGuideGate(outboundEvent);

  // Online status
  const online =
    detail?.sellerOnline ?? detail?.online ?? indexSeller?.online ?? null;

  // Reviews
  const reviews = useMemo(() => detail?.reviews ?? [], [detail]);

  // Rating distribution + low-rating warning
  const ratingStats = useMemo(() => {
    const out = {
      total: 0,
      buckets: [] as { rating: number; count: number }[],
      recentNegatives: 0,
    };
    if (reviews.length === 0) return out;
    const counts = new Map<number, number>();
    for (const r of reviews) {
      const bucket = Math.round(r.rating);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
      if (bucket <= 5) out.recentNegatives++;
    }
    out.buckets = Array.from(counts.entries())
      .map(([rating, count]) => ({ rating, count }))
      .sort((a, b) => a.rating - b.rating);
    out.total = reviews.length;
    return out;
  }, [reviews]);

  // Stats
  const itemsCount =
    detail?.overview?.itemsCount ?? indexSeller?.itemsCount ?? null;
  const avgDays =
    detail?.overview?.averageDaysToArrive ??
    indexSeller?.averageDaysToArrive ??
    null;
  const avgRating = indexSeller?.averageRating ?? null;
  const numReviews =
    detail?.overview?.numberOfReviews ?? indexSeller?.numberOfReviews ?? null;

  const filterBySeller = useCallback(() => {
    if (!sellerId) return;
    const onBrowse = pathname?.endsWith("/browse");
    if (onBrowse) {
      // Already on /browse — just tweak atoms, no navigation/scroll jump.
      setSelectedSellers([sellerId]);
      setCategory("All");
      closeViaHistory();
      return;
    }
    // Navigate to /browse with the seller in the URL. Intentionally do NOT
    // touch atoms here — on the source page (e.g. /sellers) UrlSync Phase 2
    // would immediately race router.push and clobber the destination URL.
    // /browse's DataLoader reads ?sellers= on mount and hydrates the atom.
    historyManager.remove(`seller-modal-${sellerId}`);
    setSellerId(null);
    router.push(`/browse?sellers=${encodeURIComponent(sellerId)}`);
  }, [
    sellerId,
    pathname,
    setSelectedSellers,
    setCategory,
    closeViaHistory,
    setSellerId,
    router,
  ]);

  if (!sellerId) return null;

  return (
    <div
      ref={backdropRef}
      className={`modal-backdrop${closing ? " modal-backdrop--closing" : ""}`}
      style={{ zIndex: 210 }}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) closeViaHistory();
      }}
    >
      <div
        className={`modal-panel modal-panel--xl md:h-[min(90vh,800px)]${closing ? " modal-panel--closing" : ""}`}
        style={{
          /* On mobile: natural height + overall panel scroll (matches the
             v1 SellerOverlay pattern). Both columns stack and the panel
             itself scrolls so reviews aren't squished into a tiny inner
             container. On desktop we go back to the fixed 2-col layout
             where each column scrolls independently. */
          maxHeight: "calc(100dvh - 1rem)",
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={closeViaHistory}
          className="ido-close"
          aria-label={t("close")}
        >
          <X size={16} />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-0 md:h-full">
          {/* ── Left column: seller info ── */}
          <div className="min-w-0 p-5 md:overflow-y-auto md:border-r border-border">
            {/* Identity */}
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <SellerAvatarTooltip
                  sellerName={name}
                  imageUrl={img}
                  tooltipSize={200}
                >
                  <button
                    type="button"
                    onClick={() =>
                      img && setAvatarZoomSignal((s) => (s ?? 0) + 1)
                    }
                    disabled={!img}
                    aria-label={
                      img ? t("zoomProfileImage", { seller: name }) : undefined
                    }
                    className={`w-20 h-20 rounded-xl overflow-hidden bg-surface border border-border flex items-center justify-center transition-shadow ${
                      img
                        ? "cursor-zoom-in hover:shadow-md hover:border-primary/40"
                        : "cursor-default"
                    }`}
                  >
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt={name}
                        className="w-full h-full object-cover"
                        loading="eager"
                      />
                    ) : loading ? (
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
                    ) : (
                      <span className="text-2xl font-bold text-muted">
                        {initial}
                      </span>
                    )}
                  </button>
                </SellerAvatarTooltip>
                {avatarZoomSignal != null && img && (
                  <Suspense fallback={null}>
                    <ImageZoomPreview
                      imageUrl={zoomImg ?? img}
                      alt={name}
                      openSignal={avatarZoomSignal}
                    />
                  </Suspense>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-foreground truncate">
                  {name}
                </h2>
                <div className="mt-1 text-xs text-muted flex items-center gap-3 flex-wrap">
                  {online && (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`size-1.5 rounded-full ${online === "today" ? "bg-emerald-500" : "bg-yellow-500"}`}
                      />
                      {online === "today"
                        ? t("onlineToday")
                        : t("lastSeen", { time: online })}
                    </span>
                  )}
                  {detail?.sellerJoined && (
                    <span>{t("joined", { date: detail.sellerJoined })}</span>
                  )}
                </div>

                {/* Stats row */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  {itemsCount != null && (
                    <button
                      type="button"
                      onClick={filterBySeller}
                      className="hover:text-primary transition-colors cursor-pointer"
                    >
                      {t("itemCount", { count: itemsCount })}
                    </button>
                  )}
                  {numReviews != null && (
                    <span>{t("reviewCount", { count: numReviews })}</span>
                  )}
                  {avgRating != null && (
                    <span className="inline-flex items-center gap-0.5">
                      <Star
                        size={10}
                        className="fill-current text-yellow-500"
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
              </div>
            </div>

            {/* Manifesto */}
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {t("about")}
              </h3>
              {loading && !detail ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 bg-surface rounded w-5/6" />
                  <div className="h-3 bg-surface rounded w-3/4" />
                  <div className="h-3 bg-surface rounded w-2/3" />
                </div>
              ) : detail?.manifesto ? (
                (() => {
                  // Crawler's translate stage stores per-locale manifesto
                  // translations at `detail.translations.locales[<locale>].manifesto`.
                  // Default to translated (matches surrounding UI), switch to
                  // original via the global Show-in-English toggle.
                  const targetLocale = marketToLocale(
                    market as Parameters<typeof marketToLocale>[0],
                  );
                  const translated =
                    detail.translations?.locales?.[targetLocale]?.manifesto;
                  const text =
                    forceEnglish || !translated ? detail.manifesto : translated;
                  return (
                    <p className="text-sm text-muted leading-relaxed whitespace-pre-line">
                      {text}
                    </p>
                  );
                })()
              ) : (
                <p className="text-xs italic text-muted">
                  {t("noDescription")}
                </p>
              )}
            </div>

            <SellerCommunityFeedbackBlock
              feedback={detail?.communityFeedback ?? null}
              indexSeller={indexSeller}
            />

            {/* Community feedback */}
            {sellerId && (
              <div className="mt-5 border-t border-border pt-4">
                <SellerFeedbackActions
                  sellerId={String(sellerId)}
                  sellerName={name}
                />
              </div>
            )}
          </div>

          {/* ── Right column: reviews ──
              On mobile: just stacks below the seller-info column and
              flows naturally inside the panel's outer scroll.
              On desktop: independent overflow column (md:min-h-0
              md:overflow-hidden) so the inner reviews list owns its
              own scroll alongside the seller info. */}
          <div className="min-w-0 flex flex-col md:min-h-0 md:overflow-hidden relative">
            {/* Reviews header (pr-14 reserves space for the close X) */}
            <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-3 pr-14">
              <h3 className="text-sm font-semibold text-foreground">
                {t("reviews.heading")}
              </h3>
              <div className="text-[11px] text-muted flex items-baseline justify-between gap-3">
                <span>
                  {loading
                    ? t("reviews.loading")
                    : numReviews && numReviews > reviews.length
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
                <div className="mt-2 rating-pill-group">
                  {ratingStats.recentNegatives > 0 &&
                    (() => {
                      const isActive = ratingFilter === "low";
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            setRatingFilter(isActive ? null : "low")
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-shadow cursor-pointer ${
                            ratingStats.recentNegatives > 6
                              ? "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-200"
                              : "bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200"
                          } ${isActive ? "ring-2 ring-primary/50" : "hover:brightness-110"}`}
                          title={t(
                            isActive
                              ? "reviews.removeLowRatingFilterTitle"
                              : "reviews.applyLowRatingFilterTitle",
                            { count: ratingStats.recentNegatives },
                          )}
                        >
                          <span
                            className={`inline-block size-2 rounded-full ${ratingStats.recentNegatives > 6 ? "bg-red-500" : "bg-amber-500"}`}
                          />
                          {t("reviews.lowRating", {
                            count: ratingStats.recentNegatives,
                          })}
                        </button>
                      );
                    })()}
                  {ratingStats.buckets.map((b) => {
                    const isActive = ratingFilter === b.rating;
                    return (
                      <button
                        key={b.rating}
                        type="button"
                        onClick={() =>
                          setRatingFilter(isActive ? null : b.rating)
                        }
                        className={`rating-pill inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-[11px] cursor-pointer ${
                          isActive
                            ? "rating-pill--active ring-2 ring-primary/50 " +
                              ratingBucketClass(b.rating)
                            : ratingBucketClass(b.rating)
                        }`}
                        title={t("reviews.ratingFilterTitle", {
                          action: t(
                            isActive
                              ? "reviews.removeFilter"
                              : "reviews.filter",
                          ),
                          count: b.count,
                          rating: b.rating,
                        })}
                      >
                        <span className="font-semibold">{b.rating}/10</span>
                        <span className="opacity-80">{b.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reviews list — mobile: natural flow inside the panel
                scroll (no inner scroller). Desktop: own scrollable area
                so it doesn't drag the seller-info column with it. */}
            <div className="overflow-x-hidden px-5 py-3 space-y-3 md:flex-1 md:overflow-y-auto">
              {loading && reviews.length === 0 ? (
                <div className="space-y-4 animate-pulse">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={`review-skeleton-${i}`} className="space-y-2">
                      <div className="h-3 bg-surface rounded w-1/4" />
                      <div className="h-3 bg-surface rounded w-3/4" />
                    </div>
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <p className="text-sm text-muted italic py-8 text-center">
                  {t("reviews.noReviewsYet")}
                </p>
              ) : (
                (() => {
                  const displayed =
                    ratingFilter == null
                      ? reviews
                      : ratingFilter === "low"
                        ? reviews.filter((r) => Math.round(r.rating) <= 5)
                        : reviews.filter(
                            (r) => Math.round(r.rating) === ratingFilter,
                          );
                  const emptyLabel =
                    ratingFilter === "low"
                      ? t("reviews.lowRated")
                      : `${ratingFilter}/10`;
                  return displayed.length === 0 ? (
                    <p className="text-sm text-muted italic py-8 text-center">
                      {t("reviews.noFilteredReviews", { filter: emptyLabel })}
                    </p>
                  ) : (
                    displayed.map((review) => (
                      <ReviewCard
                        key={review.id}
                        review={review as Review}
                        itemImageUrl={review.item?.imageUrl ?? review.itemImage}
                        onItemClick={(ref) => {
                          setSellerId(null);
                          setRefNum(ref);
                        }}
                      />
                    ))
                  );
                })()
              )}
              {shareLink &&
                numReviews != null &&
                numReviews > reviews.length && (
                  <p className="ido-reviews-hint">{t("reviews.readMoreAt")}</p>
                )}
              <div className="pb-16" />
            </div>

            {/* Outbound "Visit {seller}" button — reuses ItemDetailOverlay LB button */}
            {shareLink && (
              <a
                href={shareLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleLittleBiggyClick}
                className="ido-lb-btn"
                aria-label={t("visitAria", { seller: name })}
              >
                <span className="ido-lb-btn__label">
                  {t("visit", { seller: name })}
                </span>
                <span className="ido-lb-btn__arrow" aria-hidden="true">
                  →
                </span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
