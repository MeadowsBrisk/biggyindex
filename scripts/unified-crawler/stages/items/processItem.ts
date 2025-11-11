import type { AxiosInstance } from "axios";
import type { MarketCode } from "../../shared/env/loadEnv";
import { loadEnv } from "../../shared/env/loadEnv";
import { marketStore } from "../../shared/env/markets";
import { getBlobClient } from "../../shared/persistence/blobs";
import { Keys } from "../../shared/persistence/keys";
import { ensureAuthedClient } from "../../shared/http/authedClient";
import { fetchFirstReviews } from "./reviews";
import { fetchItemDescription } from "./details";
import { extractMarketShipping } from "./shipping";
import { fetchItemShareLink } from "./share";
import { loadShippingMeta, isShippingStale, updateShippingMeta, saveShippingMeta, type ShippingMetaAggregate } from "./shippingMeta";

export interface ProcessItemResult {
  ok: boolean;
  itemId: string;
  reviewsWritten: boolean;
  descriptionWritten: boolean;
  shippingWritten: number;
  shareLink?: string | null;
  shipSummaryByMarket?: Record<string, { min: number; max: number; free: number }>;
  errors?: string[];
}

export async function processSingleItem(
  itemId: string,
  markets: MarketCode[],
  opts: { client?: AxiosInstance; logPrefix?: string; mode?: "full" | "reviews-only"; currentSignature?: string; sharesAgg?: Record<string, string>; forceShare?: boolean; shippingMarkets?: MarketCode[] } = {}
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
    const existing = (await sharedBlob.getJSON<any>(key)) || {};

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
      const descMarket = markets && markets.length > 0 ? markets[0] : undefined;
      const [revP, descP] = await Promise.allSettled([
        fetchFirstReviews(client!, itemId, Number(process.env.CRAWLER_REVIEW_FETCH_SIZE || 100)),
        fetchItemDescription(client!, itemId, { maxBytes: 160_000, shipsTo: descMarket })
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
    if (opts.currentSignature) {
      merged.signature = opts.currentSignature;
    }

    if (mode === "full") {
      if (descRes && descRes.ok && descRes.description) {
        merged.description = descRes.description;
        merged.descriptionMeta = descRes.meta;
        merged.lastDescriptionRefresh = new Date().toISOString();
        descriptionWritten = true;
      } else if (existing && existing.description) {
        // preserve existing description if fetch failed
        merged.description = existing.description;
        if (existing.descriptionMeta != null) merged.descriptionMeta = existing.descriptionMeta;
        if (existing.lastDescriptionRefresh) merged.lastDescriptionRefresh = existing.lastDescriptionRefresh;
      }
    } else if (existing && existing.description) {
      // reviews-only mode: carry forward existing description if present
      merged.description = existing.description;
      if (existing.descriptionMeta != null) merged.descriptionMeta = existing.descriptionMeta;
      if (existing.lastDescriptionRefresh) merged.lastDescriptionRefresh = existing.lastDescriptionRefresh;
    }

    if (revRes && revRes.ok) {
      const reviewsArray = Array.isArray((revRes as any)?.data?.reviews)
        ? (revRes as any).data.reviews
        : existing.reviews || [];
      merged.reviews = reviewsArray;
      merged.lastReviewsRefresh = new Date().toISOString();
      reviewsWritten = true;
    } else if (existing && existing.reviews) {
      merged.reviews = existing.reviews;
      if (existing.lastReviewsRefresh) merged.lastReviewsRefresh = existing.lastReviewsRefresh;
      if (revRes && !revRes.ok) errors.push(`reviews:${revRes.error || "unknown"}`);
    }

    // If full mode succeeded for description, mark lastFullCrawl in same write
    if (mode === "full" && descriptionWritten) {
      merged.lastFullCrawl = new Date().toISOString();
    } else if (existing && existing.lastFullCrawl) {
      merged.lastFullCrawl = existing.lastFullCrawl;
    }

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
      const cached = (existing && typeof existing.sl === 'string') ? existing.sl : (aggregates[itemId] || undefined);
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
          } else if (existing && typeof existing.sl === 'string') {
            merged.sl = existing.sl; // preserve prior if present
          }
        } catch (e: any) {
          errors.push(`share:${e?.message || 'unknown'}`);
          if (cached) merged.sl = cached;
          else if (existing && typeof existing.sl === 'string') merged.sl = existing.sl;
        }
      }
    } else if (existing && typeof existing.sl === 'string') {
      merged.sl = existing.sl;
    } else if (aggregates[itemId]) {
      merged.sl = aggregates[itemId];
    }

    // Preserve any other existing fields not explicitly set
    for (const [k, v] of Object.entries(existing)) {
      if (!(k in merged)) (merged as any)[k] = v;
    }

    // Single write for core
    await sharedBlob.putJSON(key, merged);
  const descLen = merged.description ? (merged.descriptionMeta && (merged.descriptionMeta as any).length) || merged.description.length : 0;
    const revCount = Array.isArray(merged.reviews) ? merged.reviews.length : 0;
  // Enhanced logging: include share reuse/generation info and placeholder for shipping summary counts
  const shareStatus = shareWritten ? 'share=new' : (merged.sl ? 'share=reused' : 'share=none');
  console.log(`${prefix} stored id=${itemId} descLen=${descLen} reviews=${revCount}${descriptionWritten?" full=1":""} ${shareStatus}`);

    // Shipping per-present market (SEQUENTIAL to avoid cookie race conditions)
    if (mode === "full") {
      const targetMarkets = Array.isArray(opts.shippingMarkets) && opts.shippingMarkets.length ? opts.shippingMarkets : markets;
      
      // Load shipping metadata aggregate to check staleness
      const shippingMetaAgg = await loadShippingMeta(sharedBlob);
      const { needsRefresh, staleMarkets } = isShippingStale(shippingMetaAgg, itemId, targetMarkets);
      
      const marketsToRefresh = needsRefresh ? staleMarkets : [];
      
      if (marketsToRefresh.length === 0) {
        console.log(`${prefix} shipping skipped id=${itemId} markets=${targetMarkets.join(',')} (fresh)`);
      } else {
        console.log(`${prefix} shipping start id=${itemId} markets=${marketsToRefresh.join(',')} (${staleMarkets.length < targetMarkets.length ? 'stale-only' : 'sequential'})`);
        
    // Use GB shipping from description HTML if available (optimization)
    // NOTE: Only use if description was fetched with proper GB location filter
    let gbShippingFromDesc: { options: Array<{ label: string; cost: number }>; warnings?: string[] } | undefined;
    if (marketsToRefresh.includes('GB') && descRes?.gbShipping) {
      // DISABLED: Description HTML is fetched without location filter, so pricing is wrong
      // Need to fetch with proper GB location filter to get correct pricing
      // gbShippingFromDesc = descRes.gbShipping;
      // console.log(`${prefix} shipping optimized id=${itemId} market=GB options=${gbShippingFromDesc!.options.length} (from-description)`);
    }        // Process markets sequentially to avoid location filter cookie conflicts
        for (const mkt of marketsToRefresh) {
          try {
            let shippingResult: { options: Array<{ label: string; cost: number }>; warnings?: string[] } | undefined;
            
            // Use description shipping for GB, extract for others
            if (mkt === 'GB' && gbShippingFromDesc) {
              shippingResult = gbShippingFromDesc;
            } else {
              const res = await extractMarketShipping(client!, itemId, mkt);
              if (res.ok) {
                shippingResult = { options: res.options || [], warnings: res.warnings };
              } else {
                console.warn(`${prefix} shipping failed id=${itemId} market=${mkt} err=${res.error || 'unknown'}`);
                errors.push(`shipping:${mkt}:${res.error || "unknown"}`);
                continue;
              }
            }
            
            if (shippingResult) {
              const store = marketStore(mkt, env.stores as any);
              const blob = getBlobClient(store);
              const shipKey = Keys.market.shipping(itemId);
              const payload = {
                id: itemId,
                market: mkt,
                options: shippingResult.options,
                warnings: shippingResult.warnings || [],
                lastShippingRefresh: new Date().toISOString(),
              };
              await blob.putJSON(shipKey, payload);
              shippingWritten++;
              const warnStr = (Array.isArray(payload.warnings) && payload.warnings.length)
                ? ` warns=${payload.warnings.join(',')}`
                : '';
              console.log(`${prefix} shipping stored id=${itemId} market=${mkt} options=${payload.options.length}${warnStr}`);
              
              // Compute compact summary for aggregator
              const costs = shippingResult.options.map((o: any) => Number(o?.cost)).filter((n: any) => Number.isFinite(n));
              if (costs.length) {
                const min = Math.min(...costs);
                const max = Math.max(...costs);
                const free = costs.some((c: number) => c === 0) ? 1 : 0;
                shipSummaryByMarket[mkt] = { min, max, free };
              }
            }
          } catch (e: any) {
            console.warn(`${prefix} shipping error id=${itemId} market=${mkt} ${e?.message || e}`);
            errors.push(`shipping:${mkt}:${e?.message || String(e)}`);
          }
        }
        
        // Update shipping metadata aggregate
        if (shippingWritten > 0) {
          const updatedShippingMeta = updateShippingMeta(shippingMetaAgg, itemId, marketsToRefresh);
          await saveShippingMeta(sharedBlob, updatedShippingMeta);
        }
      }
      if (targetMarkets.length) {
        const byMkt = Object.entries(shipSummaryByMarket)
          .map(([m, s]) => `${m}:${s.min}-${s.max}${s.free ? ' free' : ''}`)
          .join(' ');
        console.log(`${prefix} shipping done id=${itemId} wrote=${shippingWritten} ${byMkt}`);
      }
    }

    return {
      ok: true,
      itemId,
      reviewsWritten,
      descriptionWritten,
      shippingWritten,
      shareLink: merged.sl || null,
      shipSummaryByMarket: Object.keys(shipSummaryByMarket).length ? shipSummaryByMarket : undefined,
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
