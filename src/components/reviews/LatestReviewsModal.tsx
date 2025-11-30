"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { latestReviewsModalOpenAtom, expandedSellerIdAtom, pushOverlayAtom, isrRecentReviewsAtom, isrRecentMediaAtom } from '@/store/atoms';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { proxyImage } from '@/lib/images';
import { decodeEntities } from '@/lib/format';
import { relativeCompact } from '@/lib/relativeTimeCompact';
import { useTranslations } from 'next-intl';
import { useLocale } from '@/providers/IntlProvider';
import ItemImageTooltip from '@/components/item/ItemImageTooltip';
import SellerAvatarTooltip from '@/components/seller/SellerAvatarTooltip';
import ImageZoomPreview from '@/components/item/ImageZoomPreview';
import cn from '@/lib/cn';
import { panelClassForReviewScore } from '@/theme/reviewScoreColors';
import { RECENT_REVIEWS_LIMIT } from '@/lib/constants';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useHistoryState } from '@/hooks/useHistoryState';
import { getMarketFromPath } from '@/lib/market';

function formatArrival(days?: number | null, tReviews?: (k: string, v?: any) => string) {
  if (days == null || Number.isNaN(days)) return null;
  try { if (tReviews) return tReviews('arrival', { days }); } catch {}
  if (days === 0) return 'same day';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function extractReviewContent(review: any) {
  const textSegments: string[] = [];
  const images: string[] = [];
  if (Array.isArray(review?.segments)) {
    for (const seg of review.segments) {
      if (!seg) continue;
      if (seg.type === 'text' && typeof seg.value === 'string') {
        textSegments.push(seg.value);
      } else if (seg.type === 'image') {
        // Support both legacy { value } and new normalized { url }
        if ((seg as any).url) images.push((seg as any).url);
        else if ((seg as any).value) images.push((seg as any).value);
      }
    }
  }
  const raw = textSegments.join('');
  const text = decodeEntities(raw);
  return { text, images };
}

function linkify(text: string) {
  const urlRegex = /(https?:\/\/[^\s)]+)([),.]?)/gi;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const url = match[1];
    const trailing = match[2] || '';
    parts.push(
      <a
        key={`${parts.length}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-emerald-600 dark:hover:text-emerald-400"
      >
        {url}
      </a>
    );
    if (trailing) parts.push(trailing);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

function renderParagraphs(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragraphs.length) return null;
  return paragraphs.map((para, idx) => {
    const inline = para.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');
    return (
      <p key={idx} className="mb-1.5 text-[13px] leading-relaxed text-slate-700 dark:text-white/80">
        {linkify(inline)}
      </p>
    );
  });
}

function StarRating({ rating }: { rating?: number | null }) {
  const total = 5;
  const score = typeof rating === 'number' ? Math.max(0, Math.min(10, rating)) : 0;
  const starValue = score / 2;

  return (
    <div className="flex items-center gap-0.5" aria-label={`${score}/10 rating`} title={`${score}/10 rating`}>
      {Array.from({ length: total }).map((_, idx) => {
        const isFull = starValue >= idx + 1;
        const isHalf = !isFull && starValue > idx && starValue < idx + 1;
        return (
          <span key={`star-${idx}`} className="relative inline-flex h-3.5 w-3.5">
            <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full" aria-hidden="true">
              <path
                className="fill-slate-200 dark:fill-white/15"
                d="M12 2.5 14.9 8l6.1.9-4.4 4.3 1 6.2L12 16.9 6.4 19.4l1-6.2-4.4-4.3L9.1 8z"
              />
              {(isFull || isHalf) && (
                <path
                  className="fill-emerald-500"
                  d={
                    isHalf
                      ? 'M12 2.5 12 16.9 6.4 19.4l1-6.2-4.4-4.3L9.1 8z'
                      : 'M12 2.5 14.9 8l6.1.9-4.4 4.3 1 6.2L12 16.9 6.4 19.4l1-6.2-4.4-4.3L9.1 8z'
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

export type CombinedReview = {
  id: string | number;
  rating?: number | null;
  daysToArrive?: number | null;
  sellerName?: string;
  sellerId?: string | number | null;
  sellerImageUrl?: string | null;
  createdAt?: string | null;
  itemName?: string | null;
  refNum?: string | number | null;
  itemImageUrl?: string | null;
  text: string;
  images: string[];
  source: 'review' | 'media';
};

export default function LatestReviewsModal(): React.ReactElement | null {
  const [open, setOpen] = useAtom<boolean>(latestReviewsModalOpenAtom as any);
  const isrReviews = useAtomValue<any[] | null>(isrRecentReviewsAtom as any);
  const isrMedia = useAtomValue<any[] | null>(isrRecentMediaAtom as any);
  const router = useRouter();
  const [imagePreviewSignal, setImagePreviewSignal] = useState<any>(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [mediaEntries, setMediaEntries] = useState<any[]>([]);
  const [showOnlyWithImages, setShowOnlyWithImages] = useState(false);
  
  useBodyScrollLock(open);

  // Use centralized history manager
  useHistoryState({
    id: 'reviews-modal',
    type: 'reviews',
    isOpen: open,
    onClose: () => setOpen(false)
  });

  // Listen for external close requests (e.g., from SellerOverlay when navigating)
  useEffect(() => {
    if (!open) return;
    const onCloseReq = () => {
      if (open) setOpen(false);
    };
    window.addEventListener('lb:close-reviews-modal', onCloseReq);
    return () => {
      window.removeEventListener('lb:close-reviews-modal', onCloseReq);
    };
  }, [open, setOpen]);

  // Fetch data when modal opens - use ISR data first, fallback to API
  useEffect(() => {
    if (!open) return;
    
    // Use ISR data if available (pre-rendered, no API call needed)
    if (isrReviews && isrReviews.length > 0) {
      setReviews(isrReviews);
      setMediaEntries(isrMedia || []);
      setLoading(false);
      return;
    }
    
    // Fallback to API fetch only if ISR data not available
    setLoading(true);
    
    const mkt = getMarketFromPath(typeof window !== 'undefined' ? window.location.pathname : '/');
    const qs = `?mkt=${encodeURIComponent(mkt)}`;
    Promise.all([
      fetch(`/api/index/recent-reviews${qs}`).then(res => res.ok ? res.json() : []).catch(() => []),
      fetch(`/api/index/recent-media${qs}`).then(res => res.ok ? res.json() : []).catch(() => [])
    ])
      .then(([reviewsData, mediaData]) => {
        setReviews(Array.isArray(reviewsData) ? reviewsData : []);
        setMediaEntries(Array.isArray(mediaData) ? mediaData : []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [open, isrReviews, isrMedia]);

  // If the modal is closed while on its SEO route, normalize the URL back to '/'
  useEffect(() => {
    if (!open && router?.pathname === '/latest-reviews') {
      router.replace('/');
    }
  }, [open, router]);

  // Combine reviews and media entries into a unified list
  const combinedReviews = useMemo<CombinedReview[]>(() => {
    const reviewItems = (reviews || []).map((review) => {
      const { text, images } = extractReviewContent(review);
      // Handle both createdAt (ISO string) and created (unix timestamp)
      let createdAt = review.createdAt;
      if (!createdAt && review.created) {
        createdAt = typeof review.created === 'number' 
          ? new Date(review.created * 1000).toISOString()
          : review.created;
      }
      
      return {
        id: review.id || `review-${review.created}`,
        rating: review.rating,
        daysToArrive: review.daysToArrive,
        sellerName: decodeEntities(review.sellerName || ''),
        sellerId: review.sellerId,
        sellerImageUrl: review.sellerImageUrl,
        createdAt,
        itemName: decodeEntities(review.itemName || review.item?.name || ''),
        refNum: review.refNum || review.item?.refNum,
        itemImageUrl: review.itemImageUrl,
        text,
        images,
        source: 'review' as const
      };
    });

    const mediaItems: CombinedReview[] = (mediaEntries || []).map((entry) => ({
      id: entry.id,
      rating: entry.rating,
      daysToArrive: entry.daysToArrive,
      sellerName: decodeEntities(entry.sellerName || ''),
      sellerId: entry.sellerId,
      sellerImageUrl: entry.sellerImageUrl,
      createdAt: entry.createdAt,
      itemName: decodeEntities(entry.itemName || ''),
      refNum: entry.refNum,
      itemImageUrl: entry.itemImageUrl || null, // Use actual item image, not review image
      text: entry.text,
      images: entry.images || [],
      source: 'media'
    }));

    // Combine and sort by date
    const combined = [...reviewItems, ...mediaItems];
    combined.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA; // Most recent first
    });

    return combined; // Return all, filter happens below
  }, [reviews, mediaEntries]);

  // Apply image filter and limit
  const filteredReviews = useMemo(() => {
    const filtered = showOnlyWithImages 
      ? combinedReviews.filter(review => review.images && review.images.length > 0)
      : combinedReviews;

    return filtered.slice(0, RECENT_REVIEWS_LIMIT); // Keep in sync with seller crawler limit
  }, [combinedReviews, showOnlyWithImages]);

  const handleImageClick = (imageUrl: string, allImages: string[], startIndex: number) => {
    setImagePreviewSignal({ images: allImages, index: startIndex, ts: Date.now() });
  };

  // Translations for modal
  let tModal: any;
  let tReviews: any;
  try { tModal = useTranslations('LatestReviews'); } catch { tModal = (k: string, v?: any) => k; }
  try { tReviews = useTranslations('Reviews'); } catch { tReviews = (k: string, v?: any) => k; }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={() => {
          // Don't close if image preview is open
          if (!imagePreviewOpen) setOpen(false);
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-4xl max-h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950/30 dark:to-blue-950/30">
            <div className="flex items-center justify-between px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{tModal('title')}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                  {showOnlyWithImages 
                    ? tModal('withImagesCount', { count: filteredReviews.length })
                    : tModal('recentCount', { count: filteredReviews.length })
                  }
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                aria-label={tModal('close')}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" stroke="currentColor" strokeWidth={2} fill="none">
                  <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            
            {/* Filter toggle */}
            <div className="px-6 pb-3">
              <button
                type="button"
                onClick={() => setShowOnlyWithImages(!showOnlyWithImages)}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  showOnlyWithImages
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-white/60 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700'
                )}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                {showOnlyWithImages ? tModal('toggleOn') : tModal('toggleOff')}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="h-12 w-12 rounded-full border-4 border-gray-300 dark:border-gray-600 border-t-emerald-500 animate-spin" />
              </div>
            )}

            {!loading && filteredReviews.length === 0 && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {showOnlyWithImages 
                      ? tModal('emptyWithImages')
                      : tModal('empty')
                    }
                  </p>
                </div>
              </div>
            )}

            {!loading && filteredReviews.length > 0 && (
              <ul className="space-y-3">
                {filteredReviews.map((review) => (
                  <ReviewRow
                    key={review.id}
                    review={review}
                    onImageClick={handleImageClick}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">{tModal('footerRefresh')}</p>
          </div>
        </motion.div>

        {/* Image zoom preview */}
        {imagePreviewSignal && (
          <ImageZoomPreview
            imageUrl={imagePreviewSignal.images?.[imagePreviewSignal.index] || imagePreviewSignal.images?.[0]}
            imageUrls={imagePreviewSignal.images || []}
            alt={tModal('reviewMediaAlt')}
            openSignal={imagePreviewSignal as any}
            hideTrigger={true}
            onOpenChange={(isOpen: boolean) => {
              setImagePreviewOpen(isOpen);
              if (!isOpen) setImagePreviewSignal(null);
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function ReviewRow({ review, onImageClick }: { review: CombinedReview; onImageClick: (src: string, images: string[], index: number) => void }) {
  const tRel = useTranslations('Rel');
  const { locale } = useLocale();
  const tReviews = useTranslations('Reviews');
  const scoreRaw = typeof review.rating === 'number' ? review.rating : null;
  const scoreKey = scoreRaw != null ? Math.min(10, Math.max(1, Math.round(scoreRaw))) : null;
  const panelClass = panelClassForReviewScore(scoreKey as any);
  const arrivalLabel = formatArrival(review.daysToArrive ?? null, tReviews);
  const capturedLabel = review.createdAt ? relativeLong(review.createdAt, locale, tRel('now') || 'now') : (tRel('now') || 'now');
  const hasText = review.text && review.text.trim().length > 0;
  const hasImages = Array.isArray(review.images) && review.images.length > 0;
  const hasItemImage = Boolean(review.itemImageUrl);
  
  const openSeller = useSetAtom(expandedSellerIdAtom as any);
  const pushOverlay = useSetAtom(pushOverlayAtom as any);

  const handleSellerClick = (e: React.MouseEvent) => {
    if (review.sellerId) {
      e.preventDefault();
      e.stopPropagation();
      pushOverlay('seller');
      openSeller(review.sellerId);
    }
  };

  return (
    <li
      className={cn(
        'relative rounded-xl border transition-colors duration-200',
        hasText
          ? `${panelClass} p-3.5 shadow-sm hover:shadow min-h-[80px]`
          : `border-dashed ${panelClass} px-3 py-2 text-sm font-medium min-h-[80px]`
      )}
    >
      {/* Item thumbnail (top right) */}
      {hasItemImage && (
        <div className="absolute right-3 top-3">
          <ItemImageTooltip
            imageUrl={review.itemImageUrl as any}
            itemName={review.itemName as any}
            fallbackText={tReviews('reviewImageAlt')}
          >
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm dark:border-white/20 dark:bg-white/10">
              <div className="relative h-12 w-12">
                <img
                  src={proxyImage(review.itemImageUrl as any, 96)}
                  alt={`${review.itemName} image`}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </ItemImageTooltip>
        </div>
      )}

      <div className={cn('flex flex-col gap-2', hasItemImage && 'pr-16')}>
        {/* Rating and metadata */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <StarRating rating={scoreRaw ?? undefined} />
            {arrivalLabel && (
              <span className="text-[11px] font-semibold text-slate-500 dark:text-white/65">
                {arrivalLabel}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium text-slate-400 dark:text-white/55">
            {capturedLabel}
          </span>
        </div>

        {/* Item and seller info */}
        {review.itemName && (
          <div className="text-sm">
            {review.refNum ? (
              <Link
                href={`/item/${review.refNum}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition"
              >
                {review.itemName}
              </Link>
            ) : (
              <span className="font-semibold text-slate-900 dark:text-white">
                {review.itemName}
              </span>
            )}
            {review.sellerName && (
              <span className="ml-2 text-[11px] font-medium text-slate-500 dark:text-white/60">
                – {tReviews('soldBy')}{' '}
                {review.sellerId ? (
                  <SellerAvatarTooltip
                    sellerName={review.sellerName}
                    sellerImageUrl={review.sellerImageUrl as any}
                  >
                    <button
                      type="button"
                      onClick={handleSellerClick}
                      className="underline decoration-dotted underline-offset-2 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer transition-colors"
                    >
                      {review.sellerName}
                    </button>
                  </SellerAvatarTooltip>
                ) : (
                  review.sellerName
                )}
              </span>
            )}
          </div>
        )}

        {/* Review text */}
        {hasText && (
          <div className="[&>*:last-child]:mb-0">
            {renderParagraphs(review.text)}
          </div>
        )}

        {/* Review images */}
        {hasImages && (
          <div className="flex flex-wrap gap-2 mt-1">
            {review.images.map((src, idx) => (
              <button
                key={`${review.id}-img-${idx}`}
                type="button"
                onClick={() => onImageClick(src, review.images, idx)}
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-slate-300/70 bg-slate-100 dark:border-white/20 dark:bg-white/10 hover:ring-2 hover:ring-emerald-500/60 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <img
                  src={proxyImage(src, 128)}
                  alt={tReviews('reviewImageAlt')}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform group-hover:scale-110"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

// Full-word relative time using Intl.RelativeTimeFormat for the current locale
function relativeLong(ts: number | string | Date | null | undefined, locale: string, nowToken: string): string {
  if (ts == null || ts === '') return '';
  let ms: number | null = null;
  if (typeof ts === 'number') {
    ms = ts < 1e12 ? ts * 1000 : ts;
  } else if (ts instanceof Date) {
    ms = ts.getTime();
  } else if (typeof ts === 'string') {
    const num = Number(ts);
    if (!isNaN(num) && ts.trim().match(/^\d+$/)) {
      ms = num < 1e12 ? num * 1000 : num;
    } else {
      const parsed = Date.parse(ts);
      ms = isNaN(parsed) ? null : parsed;
    }
  }
  if (ms == null) return '';
  const now = Date.now();
  let diff = now - ms;
  if (diff < 0) diff = 0;
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return nowToken || 'now';
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1]
  ];
  const rtf = new Intl.RelativeTimeFormat(locale || undefined, { numeric: 'auto', style: 'long' });
  for (const [unit, size] of units) {
    if (sec >= size) {
      const val = -Math.floor(sec / size); // negative for past
      return rtf.format(val, unit);
    }
  }
  return rtf.format(0, 'second');
}
