"use client";
import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { includedSellersAtom, excludedSellersAtom } from '@/store/atoms';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { motion, AnimatePresence } from 'framer-motion';
import cn from '@/app/cn';
import ReviewsList, { REVIEWS_DISPLAY_LIMIT } from '@/components/ReviewsList';
import { decodeEntities } from '@/lib/format';
import { proxyImage } from '@/lib/images';
import ImageZoomPreview from '@/components/ImageZoomPreview';
import SellerIncludeExclude from '@/components/item-detail/SellerIncludeExclude';
import { panelClassForReviewScore } from '@/theme/reviewScoreColors';
import formatDescription from '@/lib/formatDescription';
import { useTranslations } from 'next-intl';
import Basket from '@/components/Basket';

type OpenPreviewSignal = { ts: number; index: number; guard: unknown } | null;
type ReviewGallerySignal = { images: string[]; index: number; ts: number; guard: unknown } | null;

interface StandaloneSellerDetailProps {
  detail: any;
  sellerId: number | string;
}

export default function StandaloneSellerDetail({ detail, sellerId }: StandaloneSellerDetailProps) {
  const tOv = useTranslations('Overlay');
  const [included, setIncluded] = useAtom(includedSellersAtom);
  const [excluded, setExcluded] = useAtom(excludedSellersAtom);
  
  const [zoomOpen, setZoomOpen] = useState(false);
  const [openPreviewSignal, setOpenPreviewSignal] = useState<OpenPreviewSignal>(null);
  const [reviewGallery, setReviewGallery] = useState<ReviewGallerySignal>(null);

  const name = decodeEntities(detail?.sellerName || 'Seller');
  const manifesto = detail?.manifesto || '';
  const manifestoNode = useMemo(() => formatDescription(manifesto || null), [manifesto]);
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

  const rawSellerImage = detail?.sellerImageUrl ?? detail?.imageUrl ?? null;
  const img: string | null = useMemo(() => {
    if (!rawSellerImage) return null;
    const proxied = proxyImage(rawSellerImage);
    return proxied || null;
  }, [rawSellerImage]);
  
  const lowerSeller = (detail?.sellerName || '').toLowerCase();
  const isIncluded = (included || []).includes(lowerSeller);
  const isExcluded = (excluded || []).includes(lowerSeller);
  
  const itemsCount = useMemo(() => {
    if (overviewStats && typeof overviewStats.itemsCount === 'number') return overviewStats.itemsCount as number;
    return null as number | null;
  }, [overviewStats]);

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

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      {/* Header / Nav */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
          <span>←</span>
          <span>{tOv('browseIndex') || 'Browse Index'}</span>
        </Link>
        <div className="flex items-center gap-2">
           <Basket />
        </div>
      </div>

      <div className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-6 md:gap-8">
            {/* Left column: image + meta + manifesto */}
            <div className="min-w-0 min-h-0">
              <div className="flex items-start gap-4">
                <div className="shrink-0">
                  <div
                    className={cn('image-border inline-block')}
                    style={{ '--image-border-radius': '0.85rem', '--image-border-padding': '2px', width: '7rem', height: '7rem' } as React.CSSProperties}
                  >
                    <button
                      type="button"
                      className="image-border-inner relative w-full h-full overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500"
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
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="font-semibold text-2xl text-gray-900 dark:text-gray-100 truncate" title={name}>{name}</h1>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-3 flex-wrap">
                    {online && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> online {online}</span>}
                    {joined && <span>joined {joined}</span>}
                    {disputes && (
                      <span className="opacity-80">{(disputes.approximateOrders!=null?`${disputes.approximateOrders}+`:'~')} orders • {disputes.percentDisputed}% disputed • {disputes.percentDisputesOpen}% open</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-col gap-3">
                    {overviewStats && (
                      <div className="text-sm text-gray-600 dark:text-gray-300 flex flex-wrap items-center gap-3">
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
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Manifesto</h3>
                {manifestoNode}
                {!manifesto && (
                  <div className="text-sm italic text-gray-400">No manifesto.</div>
                )}
              </div>
              {img && (
                <ImageZoomPreview imageUrl={img} imageUrls={[img]} alt={name} openSignal={openPreviewSignal as any} hideTrigger guardKey={sellerId as any} onOpenChange={setZoomOpen} />
              )}
            </div>

            {/* Right column: reviews */}
            <div className="min-w-0 min-h-0 flex flex-col relative">
              <div className="sticky top-0 z-0 bg-white/85 dark:bg-[#0f1725]/85 backdrop-blur border-b border-gray-200/70 dark:border-gray-700/60 py-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Reviews snapshot</h3>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-baseline justify-between gap-3">
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
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
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
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-xs ${badgeClass}`}
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
              <div className="flex-1 min-h-0">
                <ReviewsList
                  reviews={reviews as any}
                  max={reviews.length}
                  renderItemLink={(r: any) => {
                    const ref = r?.item?.refNum || String(r?.item?.id || '');
                    const externalUrl = typeof r?.itemUrl === 'string' && r.itemUrl ? r.itemUrl : null;
                    if (!ref && !externalUrl) return null;
                    const name = decodeEntities(r?.item?.name || 'View item');
                    const isInternal = Boolean(ref);
                    const href = isInternal ? `/item/${encodeURIComponent(ref)}` : externalUrl!;
                    const linkClass = "hover:underline focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500";
                    return (
                      <Link
                        href={href}
                        className={linkClass}
                        target={isInternal ? undefined : "_blank"}
                        rel={isInternal ? undefined : "noopener noreferrer"}
                        title={name}
                      >{name}</Link>
                    );
                  }}
                  onImageClick={(src: string, images: string[], index: number) => {
                    if (!Array.isArray(images) || images.length === 0) return;
                    setOpenPreviewSignal(null);
                    setReviewGallery({ images, index, ts: Date.now(), guard: sellerId });
                  }}
                />
                {reviews.length > 0 && (() => {
                  const total = detail?.reviewsMeta?.summary?.numberOfReviews ?? reviews.length;
                  const isTruncated = total > reviews.length && reviews.length >= REVIEWS_DISPLAY_LIMIT;
                  if (!isTruncated || !shareLink) return null;
                  return (
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-right pr-3">
                      Read more reviews at:
                    </div>
                  );
                })()}
              </div>
              {shareLink && (
                <div className="fixed right-6 bottom-6 z-40">
                  <a
                    href={shareLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/button inline-flex items-center gap-2 text-sm font-semibold tracking-wide bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-full px-5 py-2.5 shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all backdrop-blur-md focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-300"
                  >
                    <span>See store on Little Biggy</span>
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
      </div>
    </div>
  );
}
