"use client";
import React, { memo } from 'react';
import ReviewsList, { REVIEWS_DISPLAY_LIMIT } from '@/components/reviews/ReviewsList';
import { useTranslations } from 'next-intl';

interface ReviewsSectionProps {
    reviews: any[];
    baseItem: any;
    reviewMeta: any;
    loading: boolean;
    error: any;
    reload: () => void;
    fullTimeAgo: (ts?: number | null) => string;
    onImageClick: (src: string, images: string[], index: number) => void;
    sl: string | null;
    /** If true, render the ultrawide (column 3) variant */
    ultrawide?: boolean;
}

/**
 * Isolated reviews section with stats header.
 * Prevents recalculating stats on every parent re-render.
 */
function ReviewsSectionInner({
    reviews,
    baseItem,
    reviewMeta,
    loading,
    error,
    reload,
    fullTimeAgo,
    onImageClick,
    sl,
    ultrawide = false,
}: ReviewsSectionProps) {
    const tOv = useTranslations('Overlay');

    // Compute stats
    const stats = (baseItem as any)?.rs ?? (baseItem as any)?.reviewStats;
    const avgRating = typeof (stats?.avg ?? stats?.averageRating) === 'number'
        ? (stats?.avg ?? stats?.averageRating)
        : (reviews.length
            ? (reviews.map((r: any) => typeof r.rating === 'number' ? r.rating : 0).reduce((a: number, b: number) => a + b, 0) /
                ((reviews as any[]).filter((r: any) => typeof r.rating === 'number').length || 1))
            : null);
    const reviewsTotal = typeof (stats?.cnt ?? stats?.numberOfReviews) === 'number' ? (stats?.cnt ?? stats?.numberOfReviews) : (reviewMeta?.fetched || reviews.length);
    const avgDays = typeof (stats?.days ?? stats?.averageDaysToArrive) === 'number' ? (stats?.days ?? stats?.averageDaysToArrive) : null;
    const displayLimit = REVIEWS_DISPLAY_LIMIT;

    const leftTokens: string[] = [];
    if (avgRating != null) leftTokens.push(`${avgRating.toFixed(1)} ${tOv('avgShort')}`);
    if (reviewsTotal != null) {
        if (reviewsTotal > displayLimit && reviews.length >= displayLimit) {
            leftTokens.push(`${displayLimit} ${tOv('recentShort')} (${reviewsTotal} ${tOv('totalShort')})`);
        } else {
            leftTokens.push(`${reviewsTotal} ${tOv('totalShort')}`);
        }
    }
    const rightText = (avgDays != null) ? tOv('avgArrival', { days: Math.round(avgDays) }) : null;

    const isTruncated = reviewsTotal > reviews.length && reviews.length >= REVIEWS_DISPLAY_LIMIT;

    // Ultrawide column variant returns different wrapper
    if (ultrawide) {
        return (
            <>
                <div className="mb-2">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200" data-nosnippet>{tOv('reviews')}</h3>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-baseline justify-between gap-3">
                        <span>{leftTokens.join(' • ')}</span>
                        {rightText && <span className="shrink-0">{rightText}</span>}
                    </div>
                </div>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="h-10 w-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                    </div>
                ) : (
                    <ReviewsList
                        reviews={reviews}
                        fullTimeAgo={fullTimeAgo as any}
                        onImageClick={onImageClick}
                    />
                )}
                {!loading && reviews.length > 0 && isTruncated && sl && (
                    <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 text-right pr-3">
                        {tOv('readMoreReviewsAt')}
                    </div>
                )}
            </>
        );
    }

    // Standard (non-ultrawide) variant
    return (
        <div className="2xl:hidden">
            <div className="mb-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200" data-nosnippet>{tOv('reviews')}</h3>
                {(leftTokens.length > 0 || rightText) && (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-baseline justify-between gap-3">
                        <span>{leftTokens.join(' • ')}</span>
                        {rightText && <span className="shrink-0">{rightText}</span>}
                    </div>
                )}
            </div>
            {loading && (
                <div className="flex items-center justify-center py-8">
                    <div className="h-10 w-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                </div>
            )}
            {error && (
                <div className="text-xs text-red-500">{tOv('failedToLoad')} <button className="underline" onClick={reload}>{tOv('retry')}</button></div>
            )}
            {!loading && reviews.length === 0 && !error && (
                <div className="text-xs text-gray-500">{tOv('noReviews')}</div>
            )}
            {!loading && reviews.length > 0 && (
                <ReviewsList
                    reviews={reviews}
                    fullTimeAgo={fullTimeAgo as any}
                    onImageClick={onImageClick}
                />
            )}
            {!loading && reviews.length > 0 && isTruncated && sl && (
                <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 text-right pr-2">
                    {tOv('readMoreReviewsAt')}
                </div>
            )}
        </div>
    );
}

const ReviewsSection = memo(ReviewsSectionInner);
export default ReviewsSection;
