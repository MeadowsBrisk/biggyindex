import type { MarketCode } from "../../shared/env/loadEnv";
import type { SellerStateAggregate } from "../../shared/types";
import { loadEnv } from "../../shared/env/loadEnv";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { buildSellerWorklist } from "../../shared/sellers/worklist";
import { planSellerEnrichmentSync, buildSellerStateEntry, runSellerEnrichment, type SellerEnrichmentConfig, type SellerPipelineTask } from "../../shared/sellers/enrichment";
import { processSellerAnalytics } from "../../shared/sellers/analytics";
import { log, timer } from "../../shared/logging/logger";
import { processImages } from "../images/optimizer";

export interface SellersRunResult {
  ok: boolean;
  markets: MarketCode[];
  counts?: { processed?: number; images?: number };
  note?: string;
}

export async function runSellers(markets: MarketCode[]): Promise<SellersRunResult> {
  const stageTimer = timer();
  
  try {
    log.sellers.banner(`SELLERS START markets=${markets.join(",")}`);
    const env = loadEnv();
    const sharedBlob = getBlobClient(env.stores.shared);

    // Canonical env var: SELLERS_LIMIT (legacy aliases kept for backwards compat)
    const sellersLimit = Number(process.env.SELLERS_LIMIT || process.env.SELLER_LIMIT || 0);
    const worklist = await buildSellerWorklist(markets, sellersLimit > 0 ? sellersLimit : undefined);
    const selectedSellerIds = worklist.selectedSellerIds;
    if (!selectedSellerIds.length) {
      log.sellers.info("no sellers discovered, exiting early");
      return { ok: true, markets, counts: { processed: 0 }, note: "no sellers" };
    }
    log.sellers.info(`discovered ${selectedSellerIds.length} sellers`);

    const refreshDays = Number(process.env.SELLER_MANIFESTO_REFRESH_DAYS || 3);
    const refreshMs = refreshDays * 24 * 60 * 60 * 1000;
    const requireManifesto = /^(1|true|yes|on)$/i.test(String(process.env.SELLER_REQUIRE_MANIFESTO || "").trim());
    const forceFull = /^(1|true|yes|on)$/i.test(String(process.env.CRAWLER_FORCE || process.env.SELLER_FORCE || "").trim());
    const blacklistRaw = String(process.env.SELLER_BLACKLIST || "").trim();
    const blacklist = new Set<string>((blacklistRaw ? blacklistRaw.split(/[\s,]+/).filter(Boolean) : []).map(String));
    const rawEnrichLimit = process.env.SELLER_ENRICH_LIMIT;
    const configuredEnrichLimit = rawEnrichLimit != null ? Number(rawEnrichLimit) : 0;
    const enrichLimit = configuredEnrichLimit > 0 ? configuredEnrichLimit : selectedSellerIds.length || worklist.totalDiscovered || 0;

    // Load seller state aggregate ONCE for fast sync planning (vs ~200 blob reads)
    const planTimer = timer();
    let sellerState: SellerStateAggregate | null = null;
    try {
      sellerState = await sharedBlob.getJSON<SellerStateAggregate>(Keys.shared.aggregates.sellerState());
    } catch {
      // First run or missing aggregate - all sellers will be enriched
      log.sellers.info("no seller-state aggregate found, will enrich all");
    }

    // Sync planning - NO per-seller blob reads, just in-memory lookups
    const plan = planSellerEnrichmentSync({
      sellerMeta: worklist.sellerMeta,
      selectedSellerIds,
      sellerState,
      refreshMs,
      requireManifesto,
      blacklist,
      forceFull,
      enrichLimit: Math.max(0, enrichLimit),
    });
    log.sellers.success(`planning complete`, {
      time: `${planTimer.elapsed()}ms`,
      toEnrich: plan.toEnrich.length,
      fresh: plan.skippedFresh.length,
      blacklist: plan.skippedBlacklist.length,
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
      log.sellers.info("no tasks after planning, exiting early");
      return { ok: true, markets, counts: { processed: 0 }, note: "no seller tasks" };
    }

    // Log skipped sellers (debug level, summarize if many)
    const skipLogLimit = Number(process.env.SELLER_ENRICH_SKIP_LOG_LIMIT || 5);
    if (plan.skippedFresh.length > 0) {
      const shown = plan.skippedFresh.slice(0, skipLogLimit).join(", ");
      const extra = plan.skippedFresh.length > skipLogLimit ? ` (+${plan.skippedFresh.length - skipLogLimit} more)` : "";
      log.sellers.skip(`fresh: ${shown}${extra}`);
    }
    if (plan.skippedBlacklist.length > 0) {
      const shown = plan.skippedBlacklist.slice(0, skipLogLimit).join(", ");
      const extra = plan.skippedBlacklist.length > skipLogLimit ? ` (+${plan.skippedBlacklist.length - skipLogLimit} more)` : "";
      log.sellers.skip(`blacklisted: ${shown}${extra}`);
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
      log.sellers.fail(`enrichment phase failed: ${e?.message || e}`);
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
      log.sellers.retry(`essentials attempt=${essentialAttempts}`, { sellers: retryIds.length });
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
        log.sellers.warn(`retry essentials failed attempt=${essentialAttempts}: ${retryErr?.message || retryErr}`);
        break;
      }
    }
    if (pendingEssential.length) {
      log.sellers.warn(`missing essentials after retries`, { sellers: pendingEssential.length });
    }

    const totalReviewEntries = Array.from(reviewsBySeller.values()).reduce((acc, reviews) => acc + (Array.isArray(reviews) ? reviews.length : 0), 0);
    log.sellers.stats("reviews fetched", {
      sellers: reviewsBySeller.size,
      reviews: totalReviewEntries,
      processed: processedTotal,
      failed: reviewFailures,
    });

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

    // Update seller state aggregate with results from this run
    // This enables fast sync planning on subsequent runs
    try {
      const stateUpdateStart = Date.now();
      const updatedState: SellerStateAggregate = {
        version: 1,
        updatedAt: new Date().toISOString(),
        sellers: { ...(sellerState?.sellers || {}) },
      };

      // Update state for all processed sellers (full mode tasks)
      const processedFullIds = tasks
        .filter((t) => t.mode === "full")
        .map((t) => t.sid);

      for (const sid of processedFullIds) {
        try {
          const profile = await sharedBlob.getJSON<any>(Keys.shared.seller(sid));
          if (profile) {
            updatedState.sellers[sid] = buildSellerStateEntry(profile);
          }
        } catch {
          // Keep existing state entry if read fails
        }
      }

      await sharedBlob.putJSON(Keys.shared.aggregates.sellerState(), updatedState);
      log.sellers.success(`updated seller-state aggregate`, {
        entries: Object.keys(updatedState.sellers).length,
        time: `${Date.now() - stateUpdateStart}ms`,
      });
    } catch (stateErr: any) {
      log.sellers.warn(`failed to update seller-state aggregate: ${stateErr?.message || stateErr}`);
    }

    // Process seller avatar images to R2
    // Read from seller-images.json (already populated by enrichment)
    let imagesProcessed = 0;
    const skipSellerImages = /^(1|true|yes|on)$/i.test(String(process.env.SELLER_SKIP_IMAGES || "").trim());
    if (!skipSellerImages) {
      try {
        const sellerImagesMap = await sharedBlob.getJSON<Record<string, string>>(Keys.shared.images.sellers());
        if (sellerImagesMap && Object.keys(sellerImagesMap).length > 0) {
          const uniqueUrls = [...new Set(Object.values(sellerImagesMap).filter(Boolean))];
          log.sellers.info(`processing seller avatars`, { count: uniqueUrls.length });
          const { stats } = await processImages(uniqueUrls, {
            concurrency: 5,
            force: forceFull,
            sharedBlob,
          });
          imagesProcessed = stats.processed;
          log.sellers.success(`seller avatars complete`, {
            processed: stats.processed,
            cached: stats.cached,
            failed: stats.failed,
          });
        }
      } catch (imgErr: any) {
        log.sellers.warn(`failed to process seller avatars: ${imgErr?.message || imgErr}`);
      }
    }

    log.sellers.complete(stageTimer.elapsed(), { processed: processedTotal });
    return { ok: true, markets, counts: { processed: processedTotal, images: imagesProcessed } };
  } catch (e: any) {
    log.sellers.fail(`error: ${e?.message || e}`);
    return { ok: false, markets, counts: { processed: 0 }, note: e?.message || String(e) } as any;
  }
}
