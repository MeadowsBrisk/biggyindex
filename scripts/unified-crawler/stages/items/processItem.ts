import type { AxiosInstance } from "axios";
import type { MarketCode } from "../../shared/env/loadEnv";
import { loadEnv } from "../../shared/env/loadEnv";
import { marketStore } from "../../shared/env/markets";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { ensureAuthedClient } from "../../shared/http/authedClient";
import { fetchFirstReviews } from "./reviews";
import { fetchItemDescription } from "./details";
import { extractAllMarketsShippingParallel } from "./shipping";
import { fetchItemShareLink } from "./share";
import { loadShippingMeta, isShippingStale, updateShippingMeta, saveShippingMeta, type ShippingMetaAggregate } from "./shippingMeta";
import { seedLocationFilterCookie } from "../../shared/http/lfCookie";
import { log } from "../../shared/logging/logger";

export interface ProcessItemResult {
  ok: boolean;
  itemId: string;
  reviewsWritten: boolean;
  descriptionWritten: boolean;
  shippingWritten: number;
  shareLink?: string | null;
  shipSummaryByMarket?: Record<string, { min: number; max: number; free: number }>;
  shippingMetaUpdate?: { lastRefresh: string; markets?: Record<string, string>; lastIndexedLua?: string; lastFullCrawl?: string };
  errors?: string[];
}

export async function processSingleItem(
  itemId: string,
  markets: MarketCode[],
  opts: { client?: AxiosInstance; logPrefix?: string; mode?: "full" | "reviews-only"; indexLua?: string; sharesAgg?: Record<string, string>; forceShare?: boolean; shippingMarkets?: MarketCode[] } = {}
): Promise<ProcessItemResult> {
  const env = loadEnv();
  const prefix = opts.logPrefix || "[crawler:item]";
  const mode = opts.mode || "full";
  let client = opts.client;
  const errors: string[] = [];

  try {
    if (!client) {
      const res = await ensureAuthedClient();
      client = res.client;
    }

    // Shared store for item core
    const sharedBlob = getBlobClient(env.stores.shared);
    const key = Keys.shared.itemCore(itemId);

    // CRITICAL: Load existing item with defensive error handling
    // If load fails, we should NOT proceed with a minimal write that would lose data
    let existing: any = null;
    let existingLoadFailed = false;
    try {
      existing = await sharedBlob.getJSON<any>(key);
    } catch (e: any) {
      existingLoadFailed = true;
      log.items.error(`CRITICAL: failed to load existing item - aborting to prevent data loss`, { id: itemId, reason: e?.message || String(e) });
      throw new Error(`Failed to load existing item data - cannot proceed safely to prevent data loss`);
    }

    // null means item doesn't exist (new item), {} handles edge case
    const base = existing || {};

    let reviewsWritten = false;
    let descriptionWritten = false;
    let shippingWritten = 0;
    const shipSummaryByMarket: Record<string, { min: number; max: number; free: number }> = {};
    let shareWritten = false;

    // Fetch description and reviews (parallel when full mode)
    let descRes: any | null = null;
    let revRes: any | null = null;
    if (mode === "full") {
      // Use first market for description fetch to ensure proper location filter
      const descMarket = markets && markets.length > 0 ? markets[0] : 'GB';
      // CRITICAL: Seed the LF cookie for the description fetch to get locale-specific shipping
      await seedLocationFilterCookie(client!, descMarket as MarketCode);
      const [revP, descP] = await Promise.allSettled([
        fetchFirstReviews(client!, itemId, Number(process.env.CRAWLER_REVIEW_FETCH_SIZE || 100)),
        fetchItemDescription(client!, itemId, { maxBytes: 100_000, shipsTo: descMarket })
      ]);
      if (revP.status === "fulfilled") revRes = revP.value; else errors.push(`reviews:${(revP as any).reason?.message || "unknown"}`);
      if (descP.status === "fulfilled") descRes = descP.value; else errors.push(`description:${(descP as any).reason?.message || "unknown"}`);
    } else {
      try {
        revRes = await fetchFirstReviews(client!, itemId, Number(process.env.CRAWLER_REVIEW_FETCH_SIZE || 100));
      } catch (e: any) {
        errors.push(`reviews:${e?.message || String(e)}`);
      }
    }

    // Build merged core in desired field order: id -> description/meta -> reviews
    const merged: any = {};
    merged.id = itemId;

    if (mode === "full") {
      if (descRes && descRes.ok && descRes.description) {
        merged.description = descRes.description;
        merged.descriptionMeta = descRes.meta;
        merged.lastDescriptionRefresh = new Date().toISOString();
        descriptionWritten = true;
      } else if (base && base.description) {
        // preserve existing description if fetch failed
        merged.description = base.description;
        if (base.descriptionMeta != null) merged.descriptionMeta = base.descriptionMeta;
        if (base.lastDescriptionRefresh) merged.lastDescriptionRefresh = base.lastDescriptionRefresh;
      }
    } else if (base && base.description) {
      // reviews-only mode: carry forward existing description if present
      merged.description = base.description;
      if (base.descriptionMeta != null) merged.descriptionMeta = base.descriptionMeta;
      if (base.lastDescriptionRefresh) merged.lastDescriptionRefresh = base.lastDescriptionRefresh;
    }

    if (revRes && revRes.ok) {
      const reviewsArray = Array.isArray((revRes as any)?.data?.reviews)
        ? (revRes as any).data.reviews
        : base.reviews || [];
      merged.reviews = reviewsArray;
      merged.lastReviewsRefresh = new Date().toISOString();
      reviewsWritten = true;
    } else if (base && base.reviews) {
      merged.reviews = base.reviews;
      if (base.lastReviewsRefresh) merged.lastReviewsRefresh = base.lastReviewsRefresh;
      if (revRes && !revRes.ok) errors.push(`reviews:${revRes.error || "unknown"}`);
    }

    // If full mode succeeded for description, mark lastFullCrawl in same write
    if (mode === "full" && descriptionWritten) {
      merged.lastFullCrawl = new Date().toISOString();
    } else if (base && base.lastFullCrawl) {
      merged.lastFullCrawl = base.lastFullCrawl;
    }

    // Always update lastRefresh timestamp when we process the item
    merged.lastRefresh = new Date().toISOString();

    // Share link (full mode best-effort), with aggregate reuse and optional force refresh.
    const forceShare = Boolean(opts.forceShare || /^(1|true|yes|on)$/i.test(String(process.env.CRAWLER_REFRESH_SHARE || '').trim()));
    const aggregates = opts.sharesAgg || ((await (async () => {
      try {
        const m = await sharedBlob.getJSON<any>(Keys.shared.aggregates.shares());
        return (m && typeof m === 'object') ? (m as Record<string, string>) : {};
      } catch { return {}; }
    })()));

    if (mode === "full") {
      // Prefer existing core value, then aggregate cache, unless forced refresh
      const cached = (base && typeof base.sl === 'string') ? base.sl : (aggregates[itemId] || undefined);
      if (cached && !forceShare) {
        merged.sl = cached;
      } else {
        try {
          const jar = (client as any)?.__jar || (client as any)?.defaults?.jar;
          const { link, ok } = await fetchItemShareLink(client!, jar, itemId, { html: descRes?.html });
          if (ok && link) {
            merged.sl = link;
            shareWritten = true;
          } else if (cached) {
            merged.sl = cached;
          } else if (base && typeof base.sl === 'string') {
            merged.sl = base.sl; // preserve prior if present
          }
        } catch (e: any) {
          errors.push(`share:${e?.message || 'unknown'}`);
          if (cached) merged.sl = cached;
          else if (base && typeof base.sl === 'string') merged.sl = base.sl;
        }
      }
    } else if (base && typeof base.sl === 'string') {
      merged.sl = base.sl;
    } else if (aggregates[itemId]) {
      merged.sl = aggregates[itemId];
    }

    // CRITICAL: Preserve any other existing fields not explicitly set (defensive merge)
    for (const [k, v] of Object.entries(base)) {
      if (!(k in merged)) (merged as any)[k] = v;
    }

    // CRITICAL: Don't write minimal/empty JSONs that would lose data
    // If we have no reviews AND no description AND base was empty, this is a failed crawl
    // Writing would create a minimal stub that could overwrite good data on retry
    const hasReviews = Array.isArray(merged.reviews) && merged.reviews.length > 0;
    const hasDescription = typeof merged.description === 'string' && merged.description.length > 0;
    const hasExistingData = base && (
      (Array.isArray(base.reviews) && base.reviews.length > 0) ||
      (typeof base.description === 'string' && base.description.length > 0)
    );

    if (!hasReviews && !hasDescription && !hasExistingData) {
      // All fetches failed and no existing data to preserve - abort write
      const errMsg = `All fetches failed for ${itemId} - aborting write to prevent data loss. Errors: ${errors.join(', ')}`;
      log.items.error(`CRITICAL: all fetches failed, aborting write`, { id: itemId, errors: errors.join(', ') });
      return {
        ok: false,
        itemId,
        reviewsWritten: false,
        descriptionWritten: false,
        shippingWritten: 0,
        errors: [errMsg, ...errors],
      };
    }

    // Log warning if fetches failed but we're preserving existing data
    if (hasExistingData && !reviewsWritten && !descriptionWritten) {
      log.items.warn(`fetches failed, preserving existing data`, { id: itemId, errors: errors.join(', ') });
    }

    // Single write for core
    await sharedBlob.putJSON(key, merged);
    const descLen = merged.description ? (merged.descriptionMeta && (merged.descriptionMeta as any).length) || merged.description.length : 0;
    const revCount = Array.isArray(merged.reviews) ? merged.reviews.length : 0;
    // Enhanced logging: include share reuse/generation info and placeholder for shipping summary counts
    const shareStatus = shareWritten ? 'share=new' : (merged.sl ? 'share=reused' : 'share=none');
    log.items.info(`stored`, { id: itemId, descLen, reviews: revCount, full: descriptionWritten ? 1 : 0, shareStatus });

    // Load shipping metadata aggregate (needed for both full and reviews-only modes)
    const shippingMetaAgg = await loadShippingMeta(sharedBlob);

    // Shipping per-present market (SEQUENTIAL to avoid cookie race conditions)
    if (mode === "full") {
      const targetMarkets = Array.isArray(opts.shippingMarkets) && opts.shippingMarkets.length ? opts.shippingMarkets : markets;
      const forceRefreshShipping = process.env.CRAWLER_REFRESH_SHIPPING === '1';
      const { needsRefresh, staleMarkets } = isShippingStale(shippingMetaAgg, itemId, targetMarkets);

      const marketsToRefresh = (needsRefresh || forceRefreshShipping) ? (forceRefreshShipping ? targetMarkets : staleMarkets) : [];

      if (marketsToRefresh.length === 0) {
        log.items.info(`shipping skipped`, { id: itemId, markets: targetMarkets.join(','), reason: 'fresh' });
      } else {
        log.items.info(`shipping start`, { id: itemId, markets: marketsToRefresh.join(','), mode: forceRefreshShipping ? 'forced' : staleMarkets.length < targetMarkets.length ? 'stale-only' : 'sequential' });

        // Track markets actually refreshed (for metadata update)
        const marketsRefreshed: MarketCode[] = [];

        // Use GB shipping from description HTML if available (optimization)
        // Description is fetched with shipsTo=markets[0] (GB), so shipping is accurate
        if (marketsToRefresh.includes('GB') && descRes?.gbShipping) {
          const gbShipping = descRes.gbShipping;

          // Write GB shipping immediately and remove from refresh list
          // Note: GB is English source, never has translations - no need to preserve existing
          const store = marketStore('GB', env.stores as any);
          const blob = getBlobClient(store);
          const shipKey = Keys.market.shipping(itemId);
          const payload = {
            id: itemId,
            market: 'GB' as MarketCode,
            options: gbShipping.options,
            warnings: [...(gbShipping.warnings || []), 'from_description'],
            lastShippingRefresh: new Date().toISOString(),
          };
          await blob.putJSON(shipKey, payload);
          shippingWritten++;
          marketsRefreshed.push('GB'); // Track GB as refreshed for metadata update

          // Compute compact summary for aggregator
          const costs = gbShipping.options.map((o: any) => Number(o?.cost)).filter((n: any) => Number.isFinite(n));
          if (costs.length) {
            const min = Math.min(...costs);
            const max = Math.max(...costs);
            const free = costs.some((c: number) => c === 0) ? 1 : 0;
            shipSummaryByMarket['GB'] = { min, max, free };
          }

          log.items.info(`shipping cached`, { id: itemId, market: 'GB', options: gbShipping.options.length, warns: 'from_description' });

          // Remove GB from markets to refresh (already handled via cache)
          const gbIndex = marketsToRefresh.indexOf('GB');
          if (gbIndex >= 0) {
            marketsToRefresh.splice(gbIndex, 1);
          }
        }

        // Fetch shipping for remaining markets in PARALLEL using isolated per-market clients
        // Each market gets its own cookie jar to prevent LF cookie conflicts
        if (marketsToRefresh.length > 0) {
          log.items.info(`shipping parallel`, { id: itemId, markets: marketsToRefresh.join(',') });

          const shippingResults = await extractAllMarketsShippingParallel(itemId, marketsToRefresh);

          // Process results and write to per-market blobs
          for (const [mkt, res] of shippingResults) {
            if (res.ok) {
              const store = marketStore(mkt, env.stores as any);
              const blob = getBlobClient(store);
              const shipKey = Keys.market.shipping(itemId);
              // Load existing to preserve translations field (added by translate stage)
              const existingMkt = await blob.getJSON<any>(shipKey) || {};
              const payload = {
                ...existingMkt,  // Preserve translations if present
                id: itemId,
                market: mkt,
                options: res.options || [],
                warnings: res.warnings || [],
                lastShippingRefresh: new Date().toISOString(),
              };
              await blob.putJSON(shipKey, payload);
              shippingWritten++;
              marketsRefreshed.push(mkt);
              const warnStr = (Array.isArray(payload.warnings) && payload.warnings.length)
                ? ` warns=${payload.warnings.join(',')}`
                : '';
              log.items.info(`shipping stored`, { id: itemId, market: mkt, options: payload.options.length, warns: warnStr.trim() || undefined });

              // Compute compact summary for aggregator
              const costs = (res.options || []).map((o: any) => Number(o?.cost)).filter((n: any) => Number.isFinite(n));
              if (costs.length) {
                const min = Math.min(...costs);
                const max = Math.max(...costs);
                const free = costs.some((c: number) => c === 0) ? 1 : 0;
                shipSummaryByMarket[mkt] = { min, max, free };
              }
            } else {
              log.items.warn(`shipping failed`, { id: itemId, market: mkt, err: res.error || 'unknown' });
              errors.push(`shipping:${mkt}:${res.error || "unknown"}`);
            }
          }
        }

        // Prepare shipping metadata update (will be batched at end by cli.ts)
        // Include lastIndexedLua on full crawls to enable change detection on future runs
        // Include lastFullCrawl when description is actually written (critical for mode detection on next run)
        if (marketsRefreshed.length > 0) {
          const updated = updateShippingMeta(shippingMetaAgg, itemId, marketsRefreshed, { lastIndexedLua: opts.indexLua });
          const entry = updated[itemId];
          if (entry) {
            // Add lastFullCrawl if this was a successful full crawl with description
            if (descriptionWritten) {
              (entry as any).lastFullCrawl = new Date().toISOString();
            }
            shipSummaryByMarket['__shippingMetaUpdate'] = entry as any; // temporary holder
          }
        }
      }

      if (targetMarkets.length) {
        const byMkt = Object.entries(shipSummaryByMarket)
          .map(([m, s]) => `${m}:${s.min}-${s.max}${s.free ? ' free' : ''}`)
          .join(' ');
        log.items.info(`shipping done`, { id: itemId, wrote: shippingWritten, summary: byMkt });
      }
    }

    // Extract shippingMetaUpdate from temporary holder (set in both full and reviews-only modes)
    let shippingMetaUpdate = shipSummaryByMarket['__shippingMetaUpdate'] as any;
    delete shipSummaryByMarket['__shippingMetaUpdate'];

    // For full mode: ensure lastFullCrawl AND lastIndexedLua are set when description was written
    // This is critical for mode detection on future runs - without it, items get stuck in reviews-only
    // BUG FIX: Always set lastIndexedLua so the next run knows we already processed this index change!
    if (mode === 'full' && descriptionWritten) {
      const now = new Date().toISOString();
      if (!shippingMetaUpdate) {
        // Create a new entry if shipping wasn't refreshed (but description was)
        const existingEntry = shippingMetaAgg[itemId];
        shippingMetaUpdate = existingEntry
          ? { ...existingEntry, lastRefresh: now, lastFullCrawl: now, lastIndexedLua: opts.indexLua || existingEntry.lastIndexedLua }
          : { markets: {}, lastRefresh: now, lastFullCrawl: now, lastIndexedLua: opts.indexLua };
      } else {
        // Ensure lastFullCrawl and lastIndexedLua are set
        if (!shippingMetaUpdate.lastFullCrawl) {
          shippingMetaUpdate.lastFullCrawl = now;
        }
        // CRITICAL: Always update lastIndexedLua to record we've processed this index version
        if (opts.indexLua) {
          shippingMetaUpdate.lastIndexedLua = opts.indexLua;
        }
      }
    }

    // For reviews-only mode, create the update if not already set
    // BUG FIX: Also set lastIndexedLua so change detection works on subsequent runs
    if (mode === 'reviews-only' && !shippingMetaUpdate) {
      const now = new Date().toISOString();
      const existingEntry = shippingMetaAgg[itemId];
      const updateEntry = existingEntry
        ? { ...existingEntry, lastRefresh: now, lastIndexedLua: opts.indexLua || existingEntry.lastIndexedLua }
        : { markets: {}, lastRefresh: now, lastIndexedLua: opts.indexLua };
      return {
        ok: true,
        itemId,
        reviewsWritten,
        descriptionWritten,
        shippingWritten,
        shareLink: merged.sl || null,
        shipSummaryByMarket: Object.keys(shipSummaryByMarket).length ? shipSummaryByMarket : undefined,
        shippingMetaUpdate: updateEntry,
        errors: errors.length ? errors : undefined,
      };
    }

    return {
      ok: true,
      itemId,
      reviewsWritten,
      descriptionWritten,
      shippingWritten,
      shareLink: merged.sl || null,
      shipSummaryByMarket: Object.keys(shipSummaryByMarket).length ? shipSummaryByMarket : undefined,
      shippingMetaUpdate: shippingMetaUpdate || undefined,
      // note: shareWritten not yet used by callers; can be added to result if needed
      errors: errors.length ? errors : undefined,
    };
  } catch (e: any) {
    errors.push(e?.message || String(e));
    return {
      ok: false,
      itemId,
      reviewsWritten: false,
      descriptionWritten: false,
      shippingWritten: 0,
      errors,
    };
  }
}
