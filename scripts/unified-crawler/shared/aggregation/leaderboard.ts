// TypeScript port of seller leaderboard logic
export interface LeaderboardInput {
  weeklyPositives: Map<string, any>; // { positive, total, ratings: Map<number, number>, lastCreated }
  allRatings: Map<string, any>; // { sellerId, positive, negative, total, imageUrl, url, lastCreated }
  sellerNameById: Map<string, string>;
  leaderboardLimit?: number;
  minBottomNegatives?: number;
  useWeek?: boolean;
}

export interface LeaderboardEntry {
  sellerId: string;
  sellerName: string | null;
  imageUrl: string | null;
  url: string | null;
  positive: number;
  negative: number;
  total: number;
  score: number;
  lastReviewAt: string | null;
}

export interface LeaderboardResult {
  top: LeaderboardEntry[];
  bottom: LeaderboardEntry[];
  metadata: Record<string, any>;
}

export function computeLeaderboard({ weeklyPositives, allRatings, sellerNameById, leaderboardLimit = 10, minBottomNegatives = 2, useWeek = false }: LeaderboardInput): LeaderboardResult {
  const priorPositive = 35;
  const priorTotal = 40;

  const computeWilsonScore = (positive: number, total: number) => {
    const pHat = (positive + priorPositive) / (total + priorTotal);
    const z = 1.96;
    const denom = 1 + (z * z) / (total + priorTotal);
    const center = pHat + (z * z) / (2 * (total + priorTotal));
    const margin = z * Math.sqrt((pHat * (1 - pHat) + (z * z) / (4 * (total + priorTotal))) / (total + priorTotal));
    return (center - margin) / denom;
  };

  const countNegatives = (ratings: Map<number, number>) => {
    let n = 0;
    if (ratings instanceof Map) {
      for (const [rating, count] of ratings.entries()) {
        if (Number.isFinite(rating) && rating <= 5) n += count || 0;
      }
    }
    return n;
  };

  const scoredAll: LeaderboardEntry[] = (useWeek
    ? Array.from(weeklyPositives.values()).map((rec: any) => {
        const positive = rec.positive || 0;
        const total = rec.total || 0;
        const negative = countNegatives(rec.ratings || new Map());
        const score = computeWilsonScore(positive, total || 1);
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
    : Array.from(allRatings.values()).map((rec: any) => {
        const positive = rec.positive || 0;
        const total = rec.total || 0;
        const score = computeWilsonScore(positive, total || 1);
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

  const topAll = [...scoredAll]
    .filter(entry => (entry.negative || 0) <= 5)
    .sort((a, b) => (b.score - a.score) || ((b.lastReviewAt || '') > (a.lastReviewAt || '') ? 1 : -1))
    .slice(0, leaderboardLimit);

  const topIds = new Set(topAll.map(entry => entry.sellerId));

  const bottomAll = [...scoredAll]
    .filter(s => (s.negative || 0) >= minBottomNegatives && !topIds.has(s.sellerId))
    .sort((a, b) => (b.negative - a.negative) || ((b.lastReviewAt || '') > (a.lastReviewAt || '') ? 1 : -1))
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
