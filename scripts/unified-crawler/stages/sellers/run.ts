import type { MarketCode } from "../../shared/env/loadEnv";
import { loadEnv } from "../../shared/env/loadEnv";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { buildSellerWorklist } from "../../shared/sellers/worklist";
import { planSellerEnrichment, runSellerEnrichment, type SellerEnrichmentConfig, type SellerPipelineTask } from "../../shared/sellers/enrichment";
import { processSellerAnalytics } from "../../shared/sellers/analytics";

export interface SellersRunResult {
  ok: boolean;
  markets: MarketCode[];
  counts?: { processed?: number };
  note?: string;
}

export async function runSellers(markets: MarketCode[]): Promise<SellersRunResult> {
  try {
    console.log(`[crawler:sellers] start markets=${markets.join(',')}`);
    const env = loadEnv();
    const sharedBlob = getBlobClient(env.stores.shared);

    const sellersLimit = Number(process.env.SELLERS_LIMIT || process.env.SELLER_LIMIT || process.env.SELLERS_SCAN_LIMIT || 0);
    const worklist = await buildSellerWorklist(markets, sellersLimit > 0 ? sellersLimit : undefined);
    const selectedSellerIds = worklist.selectedSellerIds;
    if (!selectedSellerIds.length) {
      console.log(`[crawler:sellers] no sellers discovered; exiting early`);
      return { ok: true, markets, counts: { processed: 0 }, note: "no sellers" };
    }

    const refreshDays = Number(process.env.SELLER_MANIFESTO_REFRESH_DAYS || 3);
    const refreshMs = refreshDays * 24 * 60 * 60 * 1000;
    const requireManifesto = /^(1|true|yes|on)$/i.test(String(process.env.SELLER_REQUIRE_MANIFESTO || "").trim());
    const forceFull = /^(1|true|yes|on)$/i.test(String(process.env.CRAWLER_FORCE || process.env.SELLER_FORCE || "").trim());
    const blacklistRaw = String(process.env.SELLER_BLACKLIST || "").trim();
    const blacklist = new Set<string>((blacklistRaw ? blacklistRaw.split(/[\s,]+/).filter(Boolean) : []).map(String));
    const rawEnrichLimit = process.env.SELLER_ENRICH_LIMIT;
    const configuredEnrichLimit = rawEnrichLimit != null ? Number(rawEnrichLimit) : 0;
    const enrichLimit = configuredEnrichLimit > 0 ? configuredEnrichLimit : selectedSellerIds.length || worklist.totalDiscovered || 0;

    const plan = await planSellerEnrichment({
      sellerMeta: worklist.sellerMeta,
      selectedSellerIds,
      sharedBlob,
      refreshMs,
      requireManifesto,
      blacklist,
      forceFull,
      enrichLimit: Math.max(0, enrichLimit),
    });

    const enrichmentConfig: SellerEnrichmentConfig = {
      concurrency: Number(process.env.SELLER_ENRICH_CONCURRENCY || 4),
      requireManifesto,
      forceShare: /^(1|true|yes|on)$/i.test(String(process.env.SELLER_REFRESH_SHARE || process.env.CRAWLER_REFRESH_SHARE || "").trim()),
      t1Ms: Number(process.env.SELLER_FETCH_T1_MS || 60000),
      t2Ms: Number(process.env.SELLER_FETCH_T2_MS || 140000),
      t3Ms: Number(process.env.SELLER_FETCH_T3_MS || 300000),
      fb1Ms: Number(process.env.SELLER_FALLBACK_T1_MS || Math.max(45000, Math.floor(Number(process.env.SELLER_FETCH_T1_MS || 60000) * 0.8))),
      fb2Ms: Number(process.env.SELLER_FALLBACK_T2_MS || 100000),
      fb3Ms: Number(process.env.SELLER_FALLBACK_T3_MS || 180000),
    };

    const essentialRetryLimit = Math.max(0, Number(process.env.SELLER_ESSENTIAL_RETRY_LIMIT || 1));

    const reviewOptions = {
      pageSize: Number(process.env.SELLER_REVIEWS_PAGE_SIZE || 100),
      maxStore: Number(process.env.SELLER_REVIEWS_MAX_STORE || process.env.CRAWLER_REVIEW_MAX_STORE || 150),
      enableSkip: /^(1|true|yes|on)$/i.test(String(process.env.SELLER_REVIEWS_ENABLE_SKIP || "").trim()),
    };

    const enrichSet = new Set(plan.toEnrich.map((task) => String(task.sid)));
    const blacklistSet = new Set(plan.skippedBlacklist.map((sid) => String(sid)));
    const tasks: SellerPipelineTask[] = plan.toEnrich.map((task) => ({ ...task, mode: "full" as const }));
    for (const sellerId of selectedSellerIds) {
      const sid = String(sellerId);
      if (enrichSet.has(sid) || blacklistSet.has(sid)) continue;
      const meta = worklist.sellerMeta.get(sid) || { sellerId: sid };
      tasks.push({ sid, meta, mode: "reviews" });
    }

    if (!tasks.length) {
      console.log(`[crawler:sellers] no seller tasks after planning; exiting early`);
      return { ok: true, markets, counts: { processed: 0 }, note: "no seller tasks" };
    }

    const skipLogLimit = Number(process.env.SELLER_ENRICH_SKIP_LOG_LIMIT || 20);
    for (const sid of plan.skippedFresh.slice(0, skipLogLimit)) {
      console.log(`[cli:seller] skip enrichment id=${sid} reason=fresh`);
    }
    if (plan.skippedFresh.length > skipLogLimit) {
      console.log(`[cli:seller] skip enrichment additionalFresh=${plan.skippedFresh.length - skipLogLimit}`);
    }
    for (const sid of plan.skippedBlacklist.slice(0, skipLogLimit)) {
      console.log(`[cli:seller] skip enrichment id=${sid} reason=blacklisted`);
    }
    if (plan.skippedBlacklist.length > skipLogLimit) {
      console.log(`[cli:seller] skip enrichment additionalBlacklisted=${plan.skippedBlacklist.length - skipLogLimit}`);
    }

    let enrichmentResult: Awaited<ReturnType<typeof runSellerEnrichment>>;
    try {
      enrichmentResult = await runSellerEnrichment({ tasks, sharedBlob, config: enrichmentConfig, reviewOptions });
      for (const sid of selectedSellerIds) {
        try {
          const profile = await sharedBlob.getJSON<any>(Keys.shared.seller(String(sid)));
          if (profile?.imageUrl) {
            const meta = worklist.sellerMeta.get(String(sid));
            if (meta) meta.imageUrl = profile.imageUrl;
          }
        } catch {/* ignore individual profile read errors */}
      }
    } catch (e: any) {
      console.warn(`[crawler:sellers] enrichment phase failed ${e?.message || e}`);
      enrichmentResult = {
        wrote: 0,
        noHtml: 0,
        writeErr: 0,
        imagesAgg: {},
        reviewsBySeller: new Map(),
        reviewsMetaBySeller: new Map(),
        processed: 0,
        reviewFailures: 0,
        essentialMissing: [],
      };
    }

    let reviewsBySeller = enrichmentResult.reviewsBySeller;
    let reviewsMetaBySeller = enrichmentResult.reviewsMetaBySeller;
    let processedTotal = enrichmentResult.processed;
    let reviewFailures = enrichmentResult.reviewFailures || 0;
    let pendingEssential = enrichmentResult.essentialMissing || [];

    let essentialAttempts = 0;
    while (pendingEssential.length && essentialAttempts < essentialRetryLimit) {
      essentialAttempts++;
      const retryIds = Array.from(new Set(pendingEssential.map((entry) => String(entry.sellerId))));
      if (!retryIds.length) break;
      console.warn(`[crawler:sellers] retry essentials attempt=${essentialAttempts} sellers=${retryIds.length}`);
      const retryTasks: SellerPipelineTask[] = retryIds.map((sid) => ({
        sid,
        meta: worklist.sellerMeta.get(sid) || { sellerId: sid },
        mode: "full",
      }));
      try {
        const retryConfig: SellerEnrichmentConfig = { ...enrichmentConfig, forceShare: true };
        const retryResult = await runSellerEnrichment({ tasks: retryTasks, sharedBlob, config: retryConfig, reviewOptions });
        processedTotal += retryResult.processed;
        reviewFailures += retryResult.reviewFailures || 0;
        for (const [sid, list] of retryResult.reviewsBySeller.entries()) {
          reviewsBySeller.set(sid, list);
        }
        for (const [sid, meta] of retryResult.reviewsMetaBySeller.entries()) {
          reviewsMetaBySeller.set(sid, meta);
        }
        pendingEssential = retryResult.essentialMissing || [];
      } catch (retryErr: any) {
        console.warn(`[crawler:sellers] retry essentials failed attempt=${essentialAttempts} reason=${retryErr?.message || retryErr}`);
        break;
      }
    }
    if (pendingEssential.length) {
      console.warn(`[crawler:sellers] missing essentials after retries sellers=${pendingEssential.length}`);
    }

    const totalReviewEntries = Array.from(reviewsBySeller.values()).reduce((acc, reviews) => acc + (Array.isArray(reviews) ? reviews.length : 0), 0);
    console.log(`[crawler:sellers] reviews fetched sellers=${reviewsBySeller.size} totalReviews=${totalReviewEntries} processed=${processedTotal} failed=${reviewFailures}`);

    const leaderboardWindowDays = Number(process.env.SELLER_LEADERBOARD_WINDOW_DAYS || 14);
    const leaderboardWindowMs = leaderboardWindowDays * 24 * 60 * 60 * 1000;
    const recentWindowDays = Number(process.env.SELLER_RECENT_WINDOW_DAYS || 0);
    const recentWindowMs = recentWindowDays > 0 ? recentWindowDays * 24 * 60 * 60 * 1000 : 0;
    const mediaWindowDays = Number(process.env.SELLER_MEDIA_WINDOW_DAYS || 0);
    const mediaWindowMs = mediaWindowDays > 0 ? mediaWindowDays * 24 * 60 * 60 * 1000 : 0;
    const leaderboardLimit = Number(process.env.SELLERS_LEADERBOARD_LIMIT || 8);
    const minBottomNeg = Number(process.env.SELLERS_MIN_BOTTOM_NEG || 2);
    const recentReviewLimit = Number(process.env.SELLER_RECENT_REVIEWS_LIMIT || 150);
    const recentMediaLimit = Number(process.env.SELLER_RECENT_MEDIA_LIMIT || 60);

    await processSellerAnalytics({
      markets,
      sellerItemsByMarket: worklist.sellerItemsByMarket,
      sellerMeta: worklist.sellerMeta,
      sellerMarkets: worklist.sellerMarkets,
      reviewsBySeller,
      stores: env.stores as Record<string, string>,
      leaderboardWindowMs,
      recentWindowMs,
      mediaWindowMs,
      leaderboardLimit,
      minBottomNeg,
      recentReviewLimit,
      recentMediaLimit,
      limitedScan: sellersLimit > 0,
    });

    return { ok: true, markets, counts: { processed: processedTotal } };
  } catch (e: any) {
    console.error(`[crawler:sellers] error`, e?.message || e);
    return { ok: false, markets, counts: { processed: 0 }, note: e?.message || String(e) } as any;
  }
}
