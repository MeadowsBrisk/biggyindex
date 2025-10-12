/**
 * Seller leaderboard computation with fairness-aware scoring (Wilson + Bayesian prior)
 */

/**
 * Compute seller leaderboards (top performers and bottom performers)
 * @param {Object} params
 * @param {Map} params.weeklyPositives - Map of seller weekly review data
 * @param {Map} params.allRatings - Map of all seller rating data
 * @param {Map} params.sellerNameById - Map of seller IDs to names
 * @param {number} params.leaderboardLimit - Number of sellers in each list
 * @param {number} params.minBottomNegatives - Minimum negatives for bottom list
 * @param {boolean} params.useWeek - Whether to use weekly data vs all data
 * @returns {Object} { top: Array, bottom: Array, metadata: Object }
 */
function computeLeaderboard({ weeklyPositives, allRatings, sellerNameById, leaderboardLimit = 10, minBottomNegatives = 2, useWeek = false }) {
  // Algorithm constants (tuned for quality marketplace)
  const priorPositive = 35;  // 87.5% baseline - optimistic but fair
  const priorTotal = 40;

  // Wilson lower bound with Bayesian prior for fairness
  const computeWilsonScore = (positive, total) => {
    const pHat = (positive + priorPositive) / (total + priorTotal);
    const z = 1.96; // 95% confidence interval
    const denom = 1 + (z * z) / (total + priorTotal);
    const center = pHat + (z * z) / (2 * (total + priorTotal));
    const margin = z * Math.sqrt((pHat * (1 - pHat) + (z * z) / (4 * (total + priorTotal))) / (total + priorTotal));
    const lowerBound = (center - margin) / denom;
    return lowerBound;
  };

  // Compute negative count from ratings map
  const countNegatives = (ratings) => {
    let n = 0;
    if (ratings instanceof Map) {
      for (const [rating, count] of ratings.entries()) {
        if (Number.isFinite(rating) && rating <= 5) n += count || 0;
      }
    }
    return n;
  };

  // Score all sellers based on window (week vs all)
  const scoredAll = (useWeek
    ? Array.from(weeklyPositives.values()).map((rec) => {
        const positive = rec.positive;
        const total = rec.total;
        const negative = countNegatives(rec.ratings);
        const score = computeWilsonScore(positive, total);
        const meta = allRatings.get(rec.sellerId);
        return {
          sellerId: rec.sellerId,
          sellerName: rec.sellerName || sellerNameById.get(rec.sellerId) || null,
          imageUrl: meta?.imageUrl || null,
          url: meta?.url || null,
          positive,
          negative,
          total,
          score,
          lastReviewAt: rec.lastCreated || null,
        };
      })
    : Array.from(allRatings.values()).map((rec) => {
        const positive = rec.positive;
        const total = rec.total;
        const score = computeWilsonScore(positive, total);
        return {
          sellerId: rec.sellerId,
          sellerName: rec.sellerName || sellerNameById.get(rec.sellerId) || null,
          imageUrl: rec.imageUrl || null,
          url: rec.url || null,
          positive,
          negative: rec.negative || 0,
          total,
          score,
          lastReviewAt: rec.lastCreated || null,
        };
      })
  ).filter(s => s.total > 0);

  // Top performers: highest scores, excluding those with too many negatives
  const topAll = [...scoredAll]
    .filter(entry => (entry.negative || 0) <= 5) // filter out high negative ratings
    .sort((a, b) => (b.score - a.score) || (b.lastReviewAt - a.lastReviewAt))
    .slice(0, leaderboardLimit);

  const topIds = new Set(topAll.map(entry => entry.sellerId));

  // Bottom performers: most negatives, excluding those in top list
  const bottomAll = [...scoredAll]
    .filter(s => (s.negative || 0) >= minBottomNegatives && !topIds.has(s.sellerId))
    .sort((a, b) => (b.negative - a.negative) || (b.lastReviewAt - a.lastReviewAt))
    .slice(0, leaderboardLimit);

  return {
    top: topAll,
    bottom: bottomAll,
    metadata: {
      type: 'wilson_bayesian',
      window: useWeek ? 'week' : 'all',
      priorPositive,
      priorTotal,
      positiveThreshold: 10,
      negativeThreshold: 5,
    },
  };
}

module.exports = { computeLeaderboard };
