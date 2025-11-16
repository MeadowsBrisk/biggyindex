import type { MarketCode } from "../env/loadEnv";
import { marketStore } from "../env/markets";
import { getBlobClient } from "../persistence/blobs";
import { Keys } from "../persistence/keys";
import { seedMarketAnalyticsFromLegacy } from "../persistence/sellerAnalyticsMigration";
import { computeSellerAnalytics, updateAnalyticsAggregate } from "../aggregation/sellerAnalytics";
import { computeLeaderboard } from "../aggregation/leaderboard";
import type { SellerMetaRecord } from "./worklist";

export interface ProcessSellerAnalyticsInput {
  markets: MarketCode[];
  sellerItemsByMarket: Map<MarketCode, Map<string, Set<string>>>;
  sellerMeta: Map<string, SellerMetaRecord>;
  sellerMarkets: Map<string, Set<MarketCode>>;
  reviewsBySeller: Map<string, any[]>;
  stores: Record<string, string>;
  leaderboardWindowMs: number;
  recentWindowMs: number;
  mediaWindowMs: number;
  leaderboardLimit: number;
  minBottomNeg: number;
  recentReviewLimit: number;
  recentMediaLimit: number;
  limitedScan: boolean;
}

interface MarketAnalyticsState {
  blob: ReturnType<typeof getBlobClient>;
  existingAgg: any;
  existingById: Map<string, any>;
  processed: Map<string, any>;
  sellerNameById: Map<string, string>;
  allReviewsBySeller: Map<string, Array<any>>;
  activeSellerIds: Set<string>;
}

export async function processSellerAnalytics(input: ProcessSellerAnalyticsInput): Promise<void> {
  const {
    markets,
    sellerItemsByMarket,
    sellerMeta,
    sellerMarkets,
    reviewsBySeller,
    stores,
    leaderboardWindowMs,
    recentWindowMs,
    mediaWindowMs,
    leaderboardLimit,
    minBottomNeg,
    recentReviewLimit,
    recentMediaLimit,
    limitedScan,
  } = input;

  const perMarketStates = new Map<MarketCode, MarketAnalyticsState>();

  for (const mkt of markets) {
    const storeName = marketStore(mkt, stores as any);
    const blobClient = getBlobClient(storeName);
    const marketSellers = sellerItemsByMarket.get(mkt);
    const activeSet = new Set<string>(marketSellers ? Array.from(marketSellers.keys()) : []);
    let existingAgg: any = null;
    try {
      existingAgg = await blobClient.getJSON<any>(Keys.market.aggregates.sellerAnalytics());
    } catch {
      existingAgg = null;
    }
    if (!existingAgg) {
      try {
        const seeded = await seedMarketAnalyticsFromLegacy({ market: mkt, activeSellerIds: activeSet });
        if (seeded) {
          existingAgg = seeded;
          console.log(`[crawler:sellers] legacy seed applied market=${mkt} sellers=${seeded.totalSellers}`);
        }
      } catch {}
    }
    if (!existingAgg) {
      existingAgg = { generatedAt: new Date().toISOString(), totalSellers: 0, dataVersion: 1, sellers: [] };
    }
    const existingById = new Map<string, any>();
    try {
      for (const rec of Array.isArray(existingAgg?.sellers) ? existingAgg.sellers : []) {
        if (rec && rec.sellerId != null) existingById.set(String(rec.sellerId), rec);
      }
    } catch {}
    perMarketStates.set(mkt, {
      blob: blobClient,
      existingAgg,
      existingById,
      processed: new Map<string, any>(),
      sellerNameById: new Map<string, string>(),
      allReviewsBySeller: new Map<string, Array<any>>(),
      activeSellerIds: activeSet,
    });
  }

  const now = Date.now();
  for (const [sid, sellerReviews] of reviewsBySeller.entries()) {
    const marketsForSeller = sellerMarkets.get(String(sid)) || new Set<MarketCode>();
    for (const [mkt, state] of perMarketStates.entries()) {
      const marketSellerMap = sellerItemsByMarket.get(mkt);
      const itemIds = marketSellerMap?.get(String(sid));
      if (!itemIds || itemIds.size === 0) {
        state.allReviewsBySeller.delete(String(sid));
        continue;
      }
      const requireItemMatch = /^(1|true|yes|on)$/i.test(String(process.env.SELLER_RECENT_REQUIRE_ITEM_MATCH || "").trim());
      const allowed = new Set<string>(Array.from(itemIds).map(String));
      const reviews: any[] = [];
      if (!requireItemMatch) {
        for (const r of sellerReviews) {
          const rec = { ...r };
          if (!rec.itemId) {
            const ref = (r?.item && (r.item.refNum || r.item.id || r.item.ref)) || r?.itemId || r?.itemRef;
            rec.itemId = ref != null ? String(ref) : null;
          }
          reviews.push(rec);
        }
      } else {
        for (const r of sellerReviews) {
          const ref = (r?.item && (r.item.refNum || r.item.id || r.item.ref)) || r?.itemId || r?.itemRef;
          const refStr = ref != null ? String(ref) : null;
          if (refStr && allowed.has(refStr)) {
            const rec = { ...r };
            if (!rec.itemId) rec.itemId = refStr;
            reviews.push(rec);
          }
        }
      }
      state.allReviewsBySeller.set(String(sid), reviews);
      const meta = sellerMeta.get(String(sid)) || { sellerId: String(sid) };
      const existing = state.existingById.get(String(sid));
      const analyticsRecord = computeSellerAnalytics({ sellerId: String(sid), reviews, sellerMeta: meta, existing });
      const marketsList = Array.from(marketsForSeller.values());
      (analyticsRecord as any).markets = marketsList;
      (analyticsRecord as any).market = mkt;
      state.processed.set(String(sid), analyticsRecord);
      if (meta?.sellerName) state.sellerNameById.set(String(sid), meta.sellerName);
    }
  }

  const writeTasks: Promise<any>[] = [];
  for (const [mkt, state] of perMarketStates.entries()) {
    const allowedIds = state.activeSellerIds;
    const updatedAgg = updateAnalyticsAggregate(state.existingAgg, state.processed);
    const filtered = Array.isArray(updatedAgg?.sellers) ? updatedAgg.sellers.filter((rec: any) => allowedIds.has(String(rec?.sellerId ?? ""))) : [];
    updatedAgg.sellers = filtered;
    updatedAgg.totalSellers = filtered.length;

    for (const sid of allowedIds) {
      const meta = sellerMeta.get(sid);
      if (meta?.sellerName) state.sellerNameById.set(String(sid), meta.sellerName);
    }

    const allRatings = new Map<string, any>();
    for (const recAny of filtered as any[]) {
      const rec = recAny as any;
      const sellerId = String(rec.sellerId);
      allRatings.set(sellerId, {
        sellerId,
        sellerName: rec.sellerName || state.sellerNameById.get(sellerId) || null,
        imageUrl: rec.imageUrl || null,
        url: rec.sellerUrl || (sellerMeta.get(sellerId)?.sellerUrl || null),
        positive: rec?.lifetime?.positiveCount || 0,
        negative: rec?.lifetime?.negativeCount || 0,
        total: rec?.lifetime?.totalReviews || 0,
        lastCreated: rec?.lifetime?.newestReviewSeen || null,
      });
    }

    const weeklyPositives = new Map<string, any>();
    for (const sid of allowedIds) {
      const reviews = state.allReviewsBySeller.get(String(sid)) || [];
      const counts = new Map<number, number>();
      let positive = 0;
      let total = 0;
      let lastCreated: string | null = null;
      for (const rv of reviews) {
        const dRaw = rv?.reviewDate || rv?.date || rv?.created;
        const d = typeof dRaw === "number" ? new Date(dRaw * 1000) : new Date(dRaw);
        if (!d || isNaN(d.getTime())) continue;
        if (now - d.getTime() > leaderboardWindowMs) continue;
        total++;
        const rating = typeof rv?.rating === "number" ? rv.rating : null;
        if (rating != null) {
          counts.set(rating, (counts.get(rating) || 0) + 1);
          if (rating >= 9) positive++;
        }
        if (!lastCreated || d > new Date(lastCreated)) lastCreated = d.toISOString();
      }
      weeklyPositives.set(String(sid), {
        sellerId: String(sid),
        sellerName: state.sellerNameById.get(String(sid)) || null,
        ratings: counts,
        positive,
        total,
        lastCreated,
      });
    }

    const leaderboardPayload = {
      generatedAt: new Date().toISOString(),
      all: computeLeaderboard({ weeklyPositives, allRatings, sellerNameById: state.sellerNameById, leaderboardLimit, minBottomNegatives: minBottomNeg, useWeek: false }),
      week: computeLeaderboard({ weeklyPositives, allRatings, sellerNameById: state.sellerNameById, leaderboardLimit, minBottomNegatives: minBottomNeg, useWeek: true }),
      metadata: { limitedScan },
    } as const;

    const recent: any[] = [];
    const mediaRecent: any[] = [];
    for (const sid of allowedIds) {
      const reviews = state.allReviewsBySeller.get(String(sid)) || [];
      const name = state.sellerNameById.get(String(sid)) || null;
      for (const rv of reviews) {
        const dRaw = rv?.reviewDate || rv?.date || rv?.created;
        const d = typeof dRaw === "number" ? new Date(dRaw * 1000) : new Date(dRaw);
        if (!d || isNaN(d.getTime())) continue;
        if (recentWindowMs > 0 && (now - d.getTime()) > recentWindowMs) {
          continue;
        }
        const createdEpochSeconds = Math.floor(d.getTime() / 1000);
        const itemRef = rv?.itemId ? String(rv.itemId) : ((rv?.item && (rv.item.refNum || rv.item.id)) || null);
        const itemObj = (rv?.item || itemRef) ? {
          refNum: (rv?.item && rv.item.refNum != null) ? rv.item.refNum : (itemRef != null ? String(itemRef) : null),
          name: (rv?.item && typeof rv.item.name === "string") ? rv.item.name : null,
          id: (rv?.item && rv.item.id != null ? rv.item.id : null),
        } : undefined;
        const base = {
          sellerId: String(sid),
          sellerName: name,
          id: rv?.id ?? null,
          created: createdEpochSeconds,
          rating: typeof rv?.rating === "number" ? rv.rating : null,
          daysToArrive: typeof rv?.daysToArrive === "number" ? rv.daysToArrive : null,
          segments: Array.isArray(rv?.segments) ? rv.segments : undefined,
          item: itemObj,
          itemId: itemRef,
        };
        if (recentWindowMs === 0 || (now - d.getTime()) <= recentWindowMs) {
          recent.push(base);
        }
        const segs = Array.isArray(rv?.segments) ? rv.segments : [];
        const urls: string[] = [];
        for (const seg of segs) {
          if (!seg) continue;
          const t = String(seg.type || "").toLowerCase();
          if ((t === "image" || t === "video") && seg.url) urls.push(String(seg.url));
        }
        if (urls.length) {
          if (mediaWindowMs > 0 && (now - d.getTime()) > mediaWindowMs) continue;
          mediaRecent.push({ ...base, mediaCount: urls.length, media: urls.slice(0, 3) });
        }
      }
    }

    recent.sort((a, b) => (a.created < b.created ? 1 : -1));
    mediaRecent.sort((a, b) => (a.created < b.created ? 1 : -1));
    const trimmedRecent = recent.slice(0, recentReviewLimit);
    const trimmedMedia = mediaRecent.slice(0, recentMediaLimit);

    writeTasks.push(
      state.blob.putJSON(Keys.market.aggregates.sellerAnalytics(), updatedAgg)
        .then(() => console.log(`[crawler:sellers] wrote seller-analytics market=${mkt} sellers=${updatedAgg.totalSellers}`))
        .catch((e: any) => console.warn(`[crawler:sellers] write seller-analytics failed market=${mkt} reason=${e?.message || e}`))
    );

    writeTasks.push(
      state.blob.putJSON(Keys.market.aggregates.sellersLeaderboard(), leaderboardPayload)
        .then(() => console.log(`[crawler:sellers] wrote sellers-leaderboard market=${mkt} top=${leaderboardPayload.all.top.length}/${leaderboardPayload.week.top.length}`))
        .catch((e: any) => console.warn(`[crawler:sellers] write sellers-leaderboard failed market=${mkt} reason=${e?.message || e}`))
    );

    writeTasks.push(
      state.blob.putJSON(Keys.market.aggregates.recentReviews(), trimmedRecent)
        .then(() => console.log(`[crawler:sellers] wrote recent-reviews market=${mkt} count=${trimmedRecent.length}`))
        .catch((e: any) => console.warn(`[crawler:sellers] write recent-reviews failed market=${mkt} reason=${e?.message || e}`))
    );

    writeTasks.push(
      state.blob.putJSON(Keys.market.aggregates.recentMedia(), trimmedMedia)
        .then(() => console.log(`[crawler:sellers] wrote recent-media market=${mkt} count=${trimmedMedia.length}`))
        .catch((e: any) => console.warn(`[crawler:sellers] write recent-media failed market=${mkt} reason=${e?.message || e}`))
    );
  }

  if (writeTasks.length) {
    try { await Promise.allSettled(writeTasks); } catch {}
  }
}
