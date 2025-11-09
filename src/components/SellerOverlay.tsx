"use client";
import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { expandedSellerIdAtom, expandedRefNumAtom, includedSellersAtom, excludedSellersAtom, pushOverlayAtom, popOverlayAtom, topOverlayTopAtom } from '@/store/atoms';
import { useSellerDetail } from '@/hooks/useSellerDetail';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { motion, AnimatePresence } from 'framer-motion';
import cn from '@/app/cn';
import ReviewsList, { REVIEWS_DISPLAY_LIMIT } from '@/components/ReviewsList';
import { decodeEntities, timeAgo } from '@/lib/format';
import ImageZoomPreview from '@/components/ImageZoomPreview';
import SellerIncludeExclude from '@/components/item-detail/SellerIncludeExclude';
import { panelClassForReviewScore } from '@/theme/reviewScoreColors';
import { loadSellersIndex, getCachedSellerById } from '@/lib/sellersIndex';

type OpenPreviewSignal = { ts: number; index: number; guard: unknown } | null;
type ReviewGallerySignal = { images: string[]; index: number; ts: number; guard: unknown } | null;

export default function SellerOverlay() {
  const router = useRouter();
  const [sellerId, setSellerId] = useAtom(expandedSellerIdAtom as any) as [string | number | null, (v: any) => void];
  const { detail, loading, error, reload } = useSellerDetail(sellerId as any) as any;
  const [currentItemRef, setItemRef] = useAtom(expandedRefNumAtom as any) as [string | null, (v: any) => void];
  const [included, setIncluded] = useAtom(includedSellersAtom as any) as [string[], (v: any) => void];
  const [excluded, setExcluded] = useAtom(excludedSellersAtom as any) as [string[], (v: any) => void];
  useBodyScrollLock(!!sellerId);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [openPreviewSignal, setOpenPreviewSignal] = useState<OpenPreviewSignal>(null);
  const [reviewGallery, setReviewGallery] = useState<ReviewGallerySignal>(null);
  const topOverlay = useAtomValue(topOverlayTopAtom as any) as string | null;
  const topOverlayRef = React.useRef(topOverlay);
  useEffect(() => { topOverlayRef.current = topOverlay; }, [topOverlay]);
  const pushOverlay = useSetAtom(pushOverlayAtom as any) as (key: string) => void;
  const popOverlay = useSetAtom(popOverlayAtom as any) as (key: string) => void;

  const close = useCallback(() => {
    setReviewGallery(null);
    setOpenPreviewSignal(null);
    setZoomOpen(false);
    // If we are on /seller/[id], normalize the URL back to root (preserve ?ref if item overlay is open)
    try {
      if ((router as any)?.pathname && (router as any).pathname.includes('/seller/')) {
        const url = currentItemRef ? `/?ref=${encodeURIComponent(currentItemRef)}` : '/';
        if (typeof window !== 'undefined' && (window as any).history?.replaceState) {
          window.history.replaceState({ __sellerOverlayClosed: true }, '', url);
        }
      }
    } catch {}
    setSellerId(null);
    popOverlay('seller');
  }, [router, currentItemRef, setSellerId, popOverlay]);

  // Layered back handling: close seller overlay first
  useEffect(() => {
    if (!sellerId) {
      setReviewGallery(null);
      setOpenPreviewSignal(null);
      return;
    }
    try { window.history.pushState({ __sellerOverlay: true }, '', window.location.href); } catch {}
    const onPop = () => { if (zoomOpen) return; if (sellerId) close(); };
    window.addEventListener('popstate', onPop);
    pushOverlay('seller');
    return () => {
      window.removeEventListener('popstate', onPop);
      popOverlay('seller');
    };
  }, [sellerId, close, zoomOpen, pushOverlay, popOverlay]);

  useEffect(() => {
    if (!sellerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !zoomOpen && topOverlayRef.current === 'seller') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sellerId, zoomOpen, close]);

  const name = decodeEntities(detail?.sellerName || 'Seller');
  const manifesto = detail?.manifesto || '';
  const img: string | null = detail?.sellerImageUrl || null;
  const online = detail?.sellerOnline || null;
  const joined = detail?.sellerJoined || null;
  const shareLink = useMemo(() => {
    if (!detail) return null;
    if (typeof detail.share === 'string' && detail.share) return detail.share;
    if (detail.sellerUrl) return detail.sellerUrl;
    return null;
  }, [detail]) as string | null;
  const disputes = detail?.reviewsMeta?.statistics || null;
  const overviewStats = detail?.overview || null;
  const reviews = useMemo(() => (Array.isArray(detail?.reviews) ? detail.reviews : []), [detail]) as any[];
  const ratingStats = useMemo(() => {
    const out: { total: number; buckets: Array<{ rating: number; count: number }>; recentNegatives: number } = { total: 0, buckets: [], recentNegatives: 0 };
    if (!Array.isArray(reviews) || reviews.length === 0) return out;
    const counts = new Map<number, number>();
    for (const review of reviews) {
      if (!review || typeof review !== 'object') continue;
      const rating = Number.isFinite((review as any)?.rating) ? Math.round((review as any).rating) : null;
      if (rating == null) continue;
      counts.set(rating, (counts.get(rating) || 0) + 1);
      if (rating <= 5) {
        out.recentNegatives += 1;
      }
    }
    if (counts.size) {
      out.buckets = Array.from(counts.entries())
        .map(([rating, count]) => ({ rating, count }))
        .sort((a, b) => a.rating - b.rating);
      out.total = out.buckets.reduce((sum, b) => sum + b.count, 0);
    }
    return out;
  }, [reviews]);
  const [sellerMeta, setSellerMeta] = useState<any>(() => (sellerId != null ? getCachedSellerById(String(sellerId)) : null));
  useEffect(() => {
    if (!sellerId) { setSellerMeta(null); return; }
    const cached = getCachedSellerById(String(sellerId));
    if (cached) { setSellerMeta(cached); return; }
    let cancelled = false;
    loadSellersIndex()
      .then(() => {
        if (cancelled) return;
        setSellerMeta(getCachedSellerById(String(sellerId)) || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sellerId]);
  
  const lowerSeller = (detail?.sellerName || '').toLowerCase();
  const isIncluded = (included || []).includes(lowerSeller);
  const isExcluded = (excluded || []).includes(lowerSeller);
  const itemsCount = useMemo(() => {
    if (overviewStats && typeof overviewStats.itemsCount === 'number') return overviewStats.itemsCount as number;
    if (sellerMeta && typeof sellerMeta.itemsCount === 'number') return sellerMeta.itemsCount as number;
    return null as number | null;
  }, [overviewStats, sellerMeta]);
  const onToggleInclude = () => {
    if (!lowerSeller) return;
    if (isIncluded) setIncluded(included.filter((s: string) => s !== lowerSeller));
    else setIncluded([...(included || []), lowerSeller]);
  };
  const onToggleExclude = () => {
    if (!lowerSeller) return;
    if (isExcluded) setExcluded(excluded.filter((s: string) => s !== lowerSeller));
    else setExcluded([...(excluded || []), lowerSeller]);
  };
  const showItemsAndClose = () => {
    if (!lowerSeller) return;
    if (!isIncluded) setIncluded([...(included || []), lowerSeller]);
    setSellerId(null);
    popOverlay('seller');
    try { window.dispatchEvent(new CustomEvent('lb:close-item-overlay', { detail: { skipScroll: true } })); } catch {}
    try { window.dispatchEvent(new CustomEvent('lb:close-reviews-modal')); } catch {}
    setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent('lb:scroll-top')); } catch {}
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    }, 30);
  };

  return (
    <AnimatePresence>
      {sellerId && (
      <motion.div
        key="seller-backdrop"
        ref={backdropRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 ${topOverlay === 'seller' ? 'z-[160]' : 'z-[120]'} bg-black/35 dark:bg-black/45 backdrop-blur-sm flex items-start md:items-center justify-center p-2 md:p-2 lg:p-4 overflow-y-auto`}
        onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => { if (e.target === backdropRef.current) close(); }}
      >
        <motion.div
          key="seller-panel"
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className={cn(
            "relative w-full md:max-w-[890px] md:h-[90vh] overflow-hidden bg-white dark:bg-[#0f1725] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col",
          )}
        >
          <button
            onClick={close}
            aria-label="Close"
            className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100/90 dark:bg-gray-800/80 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 backdrop-blur focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500"
          >×</button>

          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-3 md:gap-4 p-3 md:p-4">
            {/* Left column: image + meta + manifesto */}
            <div className="min-w-0 min-h-0 md:overflow-y-auto md:pr-1 custom-scroll">
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <button
                    type="button"
                    className="relative w-28 h-28 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500"
                    onClick={() => { if (img) setOpenPreviewSignal({ ts: Date.now(), index: 0, guard: sellerId }); }}
                    aria-label="Open seller image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {img ? (
                      <img src={img} alt={name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><div className="h-8 w-8 rounded-full border-4 border-gray-300 dark:border-gray-600 border-t-transparent animate-spin" /></div>
                    )}
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-base md:text-lg text-gray-900 dark:text-gray-100 truncate" title={name}>{name}</h2>
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-3 flex-wrap">
                    {online && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> online {online}</span>}
                    {joined && <span>joined {joined}</span>}
                    {disputes && (
                      <span className="opacity-80">{(disputes.approximateOrders!=null?`${disputes.approximateOrders}+`:'~')} orders • {disputes.percentDisputed}% disputed • {disputes.percentDisputesOpen}% open</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-col gap-3">
                    {overviewStats && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 flex flex-wrap items-center gap-3">
                        {typeof overviewStats.itemsCount === 'number' && (
                          <span>{overviewStats.itemsCount} items listed</span>
                        )}
                        {typeof overviewStats.numberOfReviews === 'number' && (
                          <span>{overviewStats.numberOfReviews} reviews</span>
                        )}
                        {typeof overviewStats.averageDaysToArrive === 'number' && (
                          <span>avg arrival {Math.round(overviewStats.averageDaysToArrive)} days</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                    <SellerIncludeExclude
                      isIncluded={isIncluded}
                      isExcluded={isExcluded}
                      onToggleInclude={onToggleInclude}
                      onToggleExclude={onToggleExclude}
                    />
                      <button
                        type="button"
                        onClick={showItemsAndClose}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700"
                        title="Show this seller's items"
                      >{itemsCount != null ? `Show items (${itemsCount})` : 'Show items'}</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Manifesto</h3>
                {loading && !detail && (
                  <div className="animate-pulse space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                  </div>
                )}
                {!loading && manifesto && (
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
                    {manifesto}
                  </div>
                )}
                {!loading && !manifesto && (
                  <div className="text-xs italic text-gray-400">No manifesto.</div>
                )}
              </div>
              {img && (
                <ImageZoomPreview imageUrl={img} imageUrls={[img]} alt={name} openSignal={openPreviewSignal as any} hideTrigger guardKey={sellerId as any} onOpenChange={setZoomOpen} />
              )}
            </div>

            {/* Right column: reviews */}
            <div className="min-w-0 min-h-0 flex flex-col relative">
              <div className="sticky top-0 z-0 bg-white/85 dark:bg-[#0f1725]/85 backdrop-blur border-b border-gray-200/70 dark:border-gray-700/60 py-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Reviews snapshot</h3>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-baseline justify-between gap-3">
                  <span>
                    {(() => {
                      const fetched = detail?.reviewsMeta?.fetched || reviews.length;
                      const total = detail?.reviewsMeta?.summary?.numberOfReviews ?? null;
                      if (total && total > fetched) return `${fetched} Recent (${total} total)`;
                      return `${fetched} total`;
                    })()}
                  </span>
                  {typeof detail?.reviewsMeta?.summary?.averageDaysToArrive === 'number' && (
                    <span className="shrink-0">avg arrival {Math.round(detail.reviewsMeta.summary.averageDaysToArrive)} days</span>
                  )}
                </div>
                {ratingStats.total > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                  {ratingStats.recentNegatives > 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        ratingStats.recentNegatives > 6
                          ? "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-200"
                          : "bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200"
                      )}
                      title={`${ratingStats.recentNegatives} low-rated review${ratingStats.recentNegatives === 1 ? '' : 's'} in latest batch`}
                    >
                      <span className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        ratingStats.recentNegatives > 6 ? "bg-red-500" : "bg-amber-500"
                      )} />
                      {ratingStats.recentNegatives} recent low ratings
                    </span>
                  )}
                    {ratingStats.buckets.map(bucket => {
                      const { rating, count } = bucket;
                      const badgeClass = panelClassForReviewScore(rating);
                      return (
                        <span
                          key={`bucket-${rating}`}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-[11px] ${badgeClass}`}
                          title={`${count} review${count === 1 ? '' : 's'} rated ${rating}/10 in latest batch`}
                        >
                          <span className="font-semibold">{rating}/10</span>
                          <span className="opacity-80">{count}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 custom-scroll">
                <ReviewsList
                  reviews={reviews as any}
                  max={reviews.length}
                  renderItemLink={(r: any) => {
                    const ref = r?.item?.refNum || String(r?.item?.id || '');
                    const externalUrl = typeof r?.itemUrl === 'string' && r.itemUrl ? r.itemUrl : null;
                    if (!ref && !externalUrl) return null;
                    const name = decodeEntities(r?.item?.name || 'View item');
                    const isInternal = Boolean(ref);
                    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
                      if (!isInternal) return; // allow normal navigation for external links
                      e.preventDefault();
                      e.stopPropagation();
                      setSellerId(null);
                      popOverlay('seller');
                      pushOverlay('item');
                      setItemRef(ref);
                      try { window.dispatchEvent(new CustomEvent('lb:close-reviews-modal')); } catch {}
                    };
                    const href = isInternal ? `/?ref=${encodeURIComponent(ref)}` : externalUrl!;
                    const linkClass = isInternal
                      ? "underline decoration-dotted underline-offset-2 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500"
                      : "hover:underline focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500";
                    return (
                      <a
                        href={href}
                        className={linkClass}
                        onClick={handleClick}
                        target={isInternal ? undefined : "_blank"}
                        rel={isInternal ? undefined : "noopener noreferrer"}
                        title={name}
                      >{name}</a>
                    );
                  }}
                  onImageClick={(src: string, images: string[], index: number) => {
                    if (!Array.isArray(images) || images.length === 0) return;
                    setOpenPreviewSignal(null);
                    setReviewGallery({ images, index, ts: Date.now(), guard: sellerId });
                  }}
                />
                {!loading && reviews.length > 0 && (() => {
                  const total = detail?.reviewsMeta?.summary?.numberOfReviews ?? reviews.length;
                  const isTruncated = total > reviews.length && reviews.length >= REVIEWS_DISPLAY_LIMIT;
                  if (!isTruncated || !shareLink) return null;
                  return (
                    <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 text-right pr-3">
                      Read more reviews at:
                    </div>
                  );
                })()}
                <div className="pb-15" />
              </div>
              {shareLink && (
                <div className="pointer-events-none absolute right-3 xl:right-5 bottom-3">
                  <a
                    href={shareLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pointer-events-auto group/button inline-flex items-center gap-2 text-sm font-semibold tracking-wide bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-full px-5 py-2.5 shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all backdrop-blur-md focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-300"
                  >
                    <span>Biggy store</span>
                    <span className="inline-block text-lg leading-none translate-x-0 transition-transform duration-300 ease-out group-hover/button:translate-x-1">→</span>
                  </a>
                </div>
              )}
              {reviewGallery && Array.isArray(reviewGallery.images) && reviewGallery.images.length > 0 && (
                <ImageZoomPreview
                  key={`seller-${sellerId}-review-gallery-${reviewGallery.ts}`}
                  imageUrl={reviewGallery.images[reviewGallery.index]}
                  imageUrls={reviewGallery.images}
                  alt={`${name} review media`}
                  openSignal={reviewGallery as any}
                  hideTrigger
                  guardKey={sellerId as any}
                  onOpenChange={(open: boolean) => { if (!open) setReviewGallery(null); setZoomOpen(open); }}
                />
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
