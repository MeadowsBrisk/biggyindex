/**
 * Compute cumulative seller analytics for long-term performance tracking
 * Merges new review data with existing historical records
 */

/**
 * Extract stats from a batch of reviews, optionally filtering to only new reviews
 * @param {Array} reviews - Array of review objects
 * @param {string|null} newestSeenBefore - ISO date of newest review seen in previous crawls (to avoid duplicates)
 * @returns {Object} Computed statistics
 */
function computeReviewStats(reviews, newestSeenBefore = null) {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return {
      reviewCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      perfectScoreCount: 0,
      sumRatings: 0,
      sumDaysToArrive: 0,
      reviewsWithShippingData: 0,
      oldestReviewDate: null,
      newestReviewDate: null
    };
  }

  // Filter to only NEW reviews (those after newestSeenBefore)
  let reviewsToCount = reviews;
  if (newestSeenBefore) {
    const cutoffDate = new Date(newestSeenBefore);
    if (!isNaN(cutoffDate.getTime())) {
      reviewsToCount = reviews.filter(review => {
        const reviewDate = review.reviewDate || review.date || review.created;
        if (!reviewDate) return true; // include if no date (to be safe)
        const date = typeof reviewDate === 'number' 
          ? new Date(reviewDate * 1000) // Unix timestamp
          : new Date(reviewDate);
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
  let oldestReviewDate = null;
  let newestReviewDate = null;

  // Process ALL reviews for date tracking (not just new ones)
  for (const review of reviews) {
    if (!review || typeof review !== 'object') continue;

    const reviewDate = review.reviewDate || review.date || review.created;
    if (reviewDate) {
      const date = typeof reviewDate === 'number' 
        ? new Date(reviewDate * 1000) 
        : new Date(reviewDate);
      if (!isNaN(date.getTime())) {
        if (!oldestReviewDate || date < oldestReviewDate) {
          oldestReviewDate = date;
        }
        if (!newestReviewDate || date > newestReviewDate) {
          newestReviewDate = date;
        }
      }
    }
  }

  // But only COUNT new reviews for stats
  for (const review of reviewsToCount) {
    if (!review || typeof review !== 'object') continue;

    const rating = typeof review.rating === 'number' ? review.rating : null;
    const daysToArrive = typeof review.daysToArrive === 'number' ? review.daysToArrive : null;

    if (rating != null) {
      sumRatings += rating;
      
      // Negative: <=5 (CRITICAL: DO NOT CHANGE)
      // Positive: >=9
      // 6-8 are neutral (not counted)
      if (rating <= 5) {
        negativeCount++;
      } else if (rating >= 9) {
        positiveCount++;
      }
      
      if (rating === 10) {
        perfectScoreCount++;
      }
    }

    if (daysToArrive != null && daysToArrive >= 0) {
      sumDaysToArrive += daysToArrive;
      reviewsWithShippingData++;
    }
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
    newestReviewDate: newestReviewDate ? newestReviewDate.toISOString() : null
  };
}

/**
 * Compute recent (30-day) stats from reviews
 * @param {Array} reviews - Array of review objects
 * @returns {Object} Recent 30-day statistics
 */
function computeRecent30Days(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return {
      reviewCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      avgRating: null,
      avgDaysToArrive: null
    };
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentReviews = reviews.filter(review => {
    const reviewDate = review.reviewDate || review.date;
    if (!reviewDate) return false;
    const date = new Date(reviewDate);
    return !isNaN(date.getTime()) && date >= thirtyDaysAgo;
  });

  if (recentReviews.length === 0) {
    return {
      reviewCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      avgRating: null,
      avgDaysToArrive: null
    };
  }

  let positiveCount = 0;
  let negativeCount = 0;
  let sumRatings = 0;
  let sumDaysToArrive = 0;
  let reviewsWithShippingData = 0;

  for (const review of recentReviews) {
    const rating = typeof review.rating === 'number' ? review.rating : null;
    const daysToArrive = typeof review.daysToArrive === 'number' ? review.daysToArrive : null;

    if (rating != null) {
      sumRatings += rating;
      // Negative: <=5 (CRITICAL: DO NOT CHANGE)
      // Positive: >=9
      // 6-8 are neutral (not counted)
      if (rating <= 5) {
        negativeCount++;
      } else if (rating >= 9) {
        positiveCount++;
      }
    }

    if (daysToArrive != null && daysToArrive >= 0) {
      sumDaysToArrive += daysToArrive;
      reviewsWithShippingData++;
    }
  }

  return {
    reviewCount: recentReviews.length,
    positiveCount,
    negativeCount,
    avgRating: recentReviews.length > 0 ? Math.round((sumRatings / recentReviews.length) * 10) / 10 : null,
    avgDaysToArrive: reviewsWithShippingData > 0 ? Math.round((sumDaysToArrive / reviewsWithShippingData) * 10) / 10 : null
  };
}

/**
 * Calculate tenure in months from oldest review
 * @param {string} oldestReviewDate - ISO date string
 * @returns {number} Months since oldest review
 */
function calculateTenureMonths(oldestReviewDate) {
  if (!oldestReviewDate) return 0;
  
  const oldest = new Date(oldestReviewDate);
  if (isNaN(oldest.getTime())) return 0;
  
  const now = new Date();
  const diffMs = now - oldest;
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44); // avg days per month
  
  return Math.max(0, Math.round(diffMonths));
}

/**
 * Merge new stats with existing analytics record
 * @param {Object} existing - Existing analytics record for seller
 * @param {Object} newStats - Stats from current crawl
 * @param {Object} sellerMeta - Seller metadata (name, url, image)
 * @returns {Object} Merged analytics record
 */
function mergeAnalytics(existing, newStats, sellerMeta) {
  // If no existing record, create from scratch
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
        oldestReviewSeen: newStats.oldestReviewDate,
        newestReviewSeen: newStats.newestReviewDate,
        tenureMonths: calculateTenureMonths(newStats.oldestReviewDate),
        avgDaysToArrive: newStats.reviewsWithShippingData > 0 ? Math.round((newStats.sumDaysToArrive / newStats.reviewsWithShippingData) * 10) / 10 : null,
        reviewsWithShippingData: newStats.reviewsWithShippingData
      },
      
      recent30Days: sellerMeta.recent30Days || {
        reviewCount: 0,
        positiveCount: 0,
        negativeCount: 0,
        avgRating: null,
        avgDaysToArrive: null
      }
    };
  }

  // Merge: accumulate counts, update timestamps
  const mergedTotalReviews = existing.lifetime.totalReviews + newStats.reviewCount;
  const mergedPositiveCount = existing.lifetime.positiveCount + newStats.positiveCount;
  const mergedNegativeCount = existing.lifetime.negativeCount + newStats.negativeCount;
  const mergedPerfectScoreCount = existing.lifetime.perfectScoreCount + newStats.perfectScoreCount;
  const mergedReviewsWithShippingData = existing.lifetime.reviewsWithShippingData + newStats.reviewsWithShippingData;

  // To calculate merged averages, we need the original sums
  // We can derive them from existing avgRating * totalReviews
  const existingSumRatings = existing.lifetime.avgRating != null ? existing.lifetime.avgRating * existing.lifetime.totalReviews : 0;
  const existingSumDaysToArrive = existing.lifetime.avgDaysToArrive != null ? existing.lifetime.avgDaysToArrive * existing.lifetime.reviewsWithShippingData : 0;
  
  const mergedSumRatings = existingSumRatings + newStats.sumRatings;
  const mergedSumDaysToArrive = existingSumDaysToArrive + newStats.sumDaysToArrive;

  // Update oldest/newest review dates
  let oldestReviewSeen = existing.lifetime.oldestReviewSeen;
  if (newStats.oldestReviewDate) {
    if (!oldestReviewSeen || new Date(newStats.oldestReviewDate) < new Date(oldestReviewSeen)) {
      oldestReviewSeen = newStats.oldestReviewDate;
    }
  }

  let newestReviewSeen = existing.lifetime.newestReviewSeen;
  if (newStats.newestReviewDate) {
    if (!newestReviewSeen || new Date(newStats.newestReviewDate) > new Date(newestReviewSeen)) {
      newestReviewSeen = newStats.newestReviewDate;
    }
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
      oldestReviewSeen,
      newestReviewSeen,
      tenureMonths: calculateTenureMonths(oldestReviewSeen),
      avgDaysToArrive: mergedReviewsWithShippingData > 0 ? Math.round((mergedSumDaysToArrive / mergedReviewsWithShippingData) * 10) / 10 : null,
      reviewsWithShippingData: mergedReviewsWithShippingData
    },
    
    recent30Days: sellerMeta.recent30Days || existing.recent30Days || {
      reviewCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      avgRating: null,
      avgDaysToArrive: null
    }
  };
}

/**
 * Compute analytics for a single seller
 * @param {Object} params
 * @param {number} params.sellerId - Seller ID
 * @param {Array} params.reviews - Array of review objects
 * @param {Object} params.sellerMeta - Seller metadata (name, url, image)
 * @param {Object} params.existing - Existing analytics record (if any)
 * @returns {Object} Updated analytics record
 */
function computeSellerAnalytics({ sellerId, reviews, sellerMeta, existing }) {
  // Get the newest review we've already counted to avoid duplicates
  const newestSeenBefore = existing?.lifetime?.newestReviewSeen || null;
  
  // Compute stats from current batch of reviews (only counting NEW ones)
  const newStats = computeReviewStats(reviews, newestSeenBefore);
  
  // Compute recent 30-day window (from ALL reviews, not just new)
  const recent30Days = computeRecent30Days(reviews);

  // Merge with existing data
  return mergeAnalytics(existing, newStats, {
    ...sellerMeta,
    sellerId,
    recent30Days
  });
}

/**
 * Load existing analytics aggregate from storage
 * @param {Object} storage - Storage backend (Blob or FS)
 * @returns {Promise<Object>} Existing analytics object with sellers array
 */
async function loadExistingAnalytics(storage) {
  try {
    const data = await storage.readSellerAnalytics();
    if (data && typeof data === 'object' && Array.isArray(data.sellers)) {
      return data;
    }
  } catch (err) {
    // File doesn't exist or invalid - start fresh
  }
  
  return {
    generatedAt: new Date().toISOString(),
    totalSellers: 0,
    dataVersion: 1,
    sellers: []
  };
}

/**
 * Update analytics aggregate with new/updated seller records
 * @param {Object} existingAggregate - Existing analytics aggregate
 * @param {Map<number, Object>} sellerRecords - Map of sellerId -> analytics record
 * @returns {Object} Updated aggregate
 */
function updateAnalyticsAggregate(existingAggregate, sellerRecords) {
  // Create a map of existing sellers for quick lookup
  const existingSellers = new Map(
    (existingAggregate.sellers || []).map(s => [s.sellerId, s])
  );

  // Merge: update existing sellers with new data, preserve sellers not in current run
  for (const [sellerId, record] of sellerRecords) {
    existingSellers.set(sellerId, record);
  }

  // Convert back to array and sort by totalReviews descending
  const sellers = Array.from(existingSellers.values())
    .sort((a, b) => (b.lifetime?.totalReviews || 0) - (a.lifetime?.totalReviews || 0));

  return {
    generatedAt: new Date().toISOString(),
    totalSellers: sellers.length,
    dataVersion: 1,
    sellers
  };
}

module.exports = {
  computeSellerAnalytics,
  loadExistingAnalytics,
  updateAnalyticsAggregate,
  computeReviewStats,
  computeRecent30Days,
  calculateTenureMonths,
  mergeAnalytics
};
