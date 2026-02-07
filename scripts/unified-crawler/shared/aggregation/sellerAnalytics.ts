// TypeScript port of seller analytics: compute long-term aggregates from reviews
export type Review = {
  rating?: number;
  daysToArrive?: number;
  reviewDate?: string | number;
  date?: string | number;
  created?: string | number; // epoch seconds or ISO
};

export type SellerMeta = {
  sellerId: string;
  sellerName?: string;
  sellerUrl?: string;
  imageUrl?: string;
};

export type Lifetime = {
  totalReviews: number;
  positiveCount: number;
  negativeCount: number;
  perfectScoreCount: number;
  avgRating: number | null;
  /** Raw sum of all ratings — prevents back-calculation drift from rounded avgRating */
  sumRatings?: number;
  oldestReviewSeen: string | null;
  newestReviewSeen: string | null;
  tenureMonths: number;
  avgDaysToArrive: number | null;
  /** Raw sum of all daysToArrive — prevents back-calculation drift */
  sumDaysToArrive?: number;
  reviewsWithShippingData: number;
};

export type SellerAnalytics = {
  sellerId: string;
  sellerName: string;
  sellerUrl: string;
  imageUrl: string;
  lastSeenAt: string;
  lifetime: Lifetime;
};

export function computeReviewStats(reviews: Review[], newestSeenBefore: string | null = null) {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return {
      reviewCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      perfectScoreCount: 0,
      sumRatings: 0,
      sumDaysToArrive: 0,
      reviewsWithShippingData: 0,
      oldestReviewDate: null as string | null,
      newestReviewDate: null as string | null,
    };
  }
  let reviewsToCount = reviews;
  if (newestSeenBefore) {
    const cutoffDate = new Date(newestSeenBefore);
    if (!isNaN(cutoffDate.getTime())) {
      reviewsToCount = reviews.filter(review => {
        const reviewDate: any = (review as any).reviewDate ?? (review as any).date ?? (review as any).created;
        if (!reviewDate) return true;
        const date = typeof reviewDate === 'number' ? new Date(reviewDate * 1000) : new Date(reviewDate);
        return !isNaN(date.getTime()) && date > cutoffDate;
      });
    }
  }

  let positiveCount = 0;
  let negativeCount = 0;
  let perfectScoreCount = 0;
  let sumRatings = 0;
  let sumDaysToArrive = 0;
  let reviewsWithShippingData = 0;
  let oldestReviewDate: Date | null = null;
  let newestReviewDate: Date | null = null;

  for (const review of reviews) {
    const reviewDate: any = (review as any).reviewDate ?? (review as any).date ?? (review as any).created;
    if (reviewDate) {
      const date = typeof reviewDate === 'number' ? new Date(reviewDate * 1000) : new Date(reviewDate);
      if (!isNaN(date.getTime())) {
        if (!oldestReviewDate || date < oldestReviewDate) oldestReviewDate = date;
        if (!newestReviewDate || date > newestReviewDate) newestReviewDate = date;
      }
    }
  }

  for (const review of reviewsToCount) {
    const rating = typeof review.rating === 'number' ? review.rating : null;
    const dta = typeof review.daysToArrive === 'number' ? review.daysToArrive : null;
    if (rating != null) {
      sumRatings += rating;
      if (rating <= 5) negativeCount++; else if (rating >= 9) positiveCount++;
      if (rating === 10) perfectScoreCount++;
    }
    if (dta != null && dta >= 0) { sumDaysToArrive += dta; reviewsWithShippingData++; }
  }

  return {
    reviewCount: reviewsToCount.length,
    positiveCount,
    negativeCount,
    perfectScoreCount,
    sumRatings,
    sumDaysToArrive,
    reviewsWithShippingData,
    oldestReviewDate: oldestReviewDate ? oldestReviewDate.toISOString() : null,
    newestReviewDate: newestReviewDate ? newestReviewDate.toISOString() : null,
  };
}

export function calculateTenureMonths(oldestReviewDate: string | null) {
  if (!oldestReviewDate) return 0;
  const oldest = new Date(oldestReviewDate);
  if (isNaN(oldest.getTime())) return 0;
  const now = new Date();
  const diffMs = now.getTime() - oldest.getTime();
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44);
  return Math.max(0, Math.round(diffMonths));
}

export function mergeAnalytics(existing: any, newStats: any, sellerMeta: SellerMeta): SellerAnalytics {
  if (!existing || !existing.lifetime) {
    return {
      sellerId: sellerMeta.sellerId,
      sellerName: sellerMeta.sellerName || '',
      sellerUrl: sellerMeta.sellerUrl || '',
      imageUrl: sellerMeta.imageUrl || '',
      lastSeenAt: new Date().toISOString(),
      lifetime: {
        totalReviews: newStats.reviewCount,
        positiveCount: newStats.positiveCount,
        negativeCount: newStats.negativeCount,
        perfectScoreCount: newStats.perfectScoreCount,
        avgRating: newStats.reviewCount > 0 ? Math.round((newStats.sumRatings / newStats.reviewCount) * 10) / 10 : null,
        sumRatings: newStats.sumRatings,
        oldestReviewSeen: newStats.oldestReviewDate,
        newestReviewSeen: newStats.newestReviewDate,
        tenureMonths: calculateTenureMonths(newStats.oldestReviewDate),
        avgDaysToArrive: newStats.reviewsWithShippingData > 0 ? Math.round((newStats.sumDaysToArrive / newStats.reviewsWithShippingData) * 10) / 10 : null,
        sumDaysToArrive: newStats.sumDaysToArrive,
        reviewsWithShippingData: newStats.reviewsWithShippingData,
      },
    };
  }

  const mergedTotalReviews = (existing.lifetime.totalReviews || 0) + newStats.reviewCount;
  const mergedPositiveCount = (existing.lifetime.positiveCount || 0) + newStats.positiveCount;
  const mergedNegativeCount = (existing.lifetime.negativeCount || 0) + newStats.negativeCount;
  const mergedPerfectScoreCount = (existing.lifetime.perfectScoreCount || 0) + newStats.perfectScoreCount;
  const mergedReviewsWithShippingData = (existing.lifetime.reviewsWithShippingData || 0) + newStats.reviewsWithShippingData;

  // Use stored sumRatings/sumDaysToArrive when available; fall back to back-calculation for legacy data
  const existingSumRatings = existing.lifetime.sumRatings ?? (existing.lifetime.avgRating != null ? existing.lifetime.avgRating * existing.lifetime.totalReviews : 0);
  const existingSumDaysToArrive = existing.lifetime.sumDaysToArrive ?? (existing.lifetime.avgDaysToArrive != null ? existing.lifetime.avgDaysToArrive * existing.lifetime.reviewsWithShippingData : 0);
  const mergedSumRatings = existingSumRatings + newStats.sumRatings;
  const mergedSumDaysToArrive = existingSumDaysToArrive + newStats.sumDaysToArrive;

  let oldestReviewSeen = existing.lifetime.oldestReviewSeen || null;
  if (newStats.oldestReviewDate && (!oldestReviewSeen || new Date(newStats.oldestReviewDate) < new Date(oldestReviewSeen))) {
    oldestReviewSeen = newStats.oldestReviewDate;
  }

  let newestReviewSeen = existing.lifetime.newestReviewSeen || null;
  if (newStats.newestReviewDate && (!newestReviewSeen || new Date(newStats.newestReviewDate) > new Date(newestReviewSeen))) {
    newestReviewSeen = newStats.newestReviewDate;
  }

  return {
    sellerId: sellerMeta.sellerId,
    sellerName: sellerMeta.sellerName || existing.sellerName || '',
    sellerUrl: sellerMeta.sellerUrl || existing.sellerUrl || '',
    imageUrl: sellerMeta.imageUrl || existing.imageUrl || '',
    lastSeenAt: new Date().toISOString(),
    lifetime: {
      totalReviews: mergedTotalReviews,
      positiveCount: mergedPositiveCount,
      negativeCount: mergedNegativeCount,
      perfectScoreCount: mergedPerfectScoreCount,
      avgRating: mergedTotalReviews > 0 ? Math.round((mergedSumRatings / mergedTotalReviews) * 10) / 10 : null,
      sumRatings: mergedSumRatings,
      oldestReviewSeen,
      newestReviewSeen,
      tenureMonths: calculateTenureMonths(oldestReviewSeen),
      avgDaysToArrive: mergedReviewsWithShippingData > 0 ? Math.round((mergedSumDaysToArrive / mergedReviewsWithShippingData) * 10) / 10 : null,
      sumDaysToArrive: mergedSumDaysToArrive,
      reviewsWithShippingData: mergedReviewsWithShippingData,
    },
  };
}

export function computeSellerAnalytics({ sellerId, reviews, sellerMeta, existing }: { sellerId: string; reviews: Review[]; sellerMeta: SellerMeta; existing: any; }) {
  const newestSeenBefore = existing?.lifetime?.newestReviewSeen || null;
  const newStats = computeReviewStats(reviews, newestSeenBefore);
  return mergeAnalytics(existing, newStats, { ...sellerMeta, sellerId });
}

export function updateAnalyticsAggregate(existingAggregate: any, sellerRecords: Map<string, any>) {
  const existingSellers = new Map((existingAggregate.sellers || []).map((s: any) => [String(s.sellerId), s]));
  for (const [sellerId, record] of sellerRecords) {
    existingSellers.set(String(sellerId), record);
  }
  const sellers = Array.from(existingSellers.values())
    .sort((a: any, b: any) => (b.lifetime?.totalReviews || 0) - (a.lifetime?.totalReviews || 0));
  return {
    generatedAt: new Date().toISOString(),
    totalSellers: sellers.length,
    dataVersion: 1,
    sellers,
  };
}
