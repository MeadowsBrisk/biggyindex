// Unified background function: indexes all markets, then fast-enriches any
// new/changed items (description, reviews, shipping, R2 images) within the
// same invocation. This reduces new-item latency from hours to minutes.
//
// Markets are processed in concurrency-bounded batches. Each market's
// `runIndexMarket` is invoked with `deferSharedFlush: true` so the per-market
// writes never race on `shared/aggregates/index-meta.json`; the orchestrator
// collects the per-market `metaUpdates` and flushes once at the end via
// `flushSharedIndexMeta`. CLI single-market invocations are unaffected.

import type { Handler } from "@netlify/functions";
import { loadEnv } from "../../scripts/unified-crawler/shared/env/loadEnv";
import { listMarkets, marketStore } from "../../scripts/unified-crawler/shared/env/markets";
import { indexMarket } from "../../scripts/unified-crawler/indexer/indexMarket";
import { flushSharedIndexMeta } from "../../scripts/unified-crawler/stages/index/run";
import { appendRunMeta } from "../../scripts/unified-crawler/shared/persistence/runMeta";
import { Keys } from "../../scripts/unified-crawler/shared/persistence/keys";
import { getBlobClient } from "../../scripts/unified-crawler/shared/persistence/blobs";
import { tryRevalidateAllMarkets } from "../../scripts/unified-crawler/shared/revalidation/revalidate";
import { computeIndexDiff, mergeMarketDiffs, type IndexSnapshot } from "../../scripts/unified-crawler/shared/logic/indexDiff";
import type { MarketCode } from "../../scripts/unified-crawler/shared/env/loadEnv";
import type { IndexMetaEntry } from "../../scripts/unified-crawler/shared/logic/indexMetaStore";

import { since } from "../../scripts/unified-crawler/shared/timing";
import { createFnLogger } from "../../scripts/unified-crawler/shared/fnLogger";

// Cap concurrency so we don't hammer LB's items-wall API. Tunable via env.
const DEFAULT_INDEX_CONCURRENCY = 3;

function parseConcurrency(): number {
  const raw = process.env.INDEX_CONCURRENCY;
  if (!raw) return DEFAULT_INDEX_CONCURRENCY;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_INDEX_CONCURRENCY;
  return Math.min(Math.max(1, Math.floor(n)), 6);
}

export const handler: Handler = async (event) => {
  const started = Date.now();
  const { log, warn, error: errlog } = createFnLogger('index-all-markets');

  try {
    log("start");

    // Ensure persistence defaults for Netlify runtime
    if (!process.env.CRAWLER_PERSIST) process.env.CRAWLER_PERSIST = "r2";

    const env = loadEnv();
    const markets = listMarkets(env.markets); // e.g., ["GB","DE","FR","IT","PT"]
    const concurrency = parseConcurrency();

    log(`indexing ${markets.length} markets concurrency=${concurrency}: ${markets.join(", ")}`);

    let totalIndexed = 0;
    const results: Array<{ market: string; items: number; elapsed: number; error?: string }> = [];
    const updatesByMarket: Record<string, Record<string, IndexMetaEntry>> = {};

    // Run a single market with deferred shared flush. Errors are caught here so
    // one market's failure can't reject the whole batch's Promise.allSettled.
    const runOne = async (code: MarketCode) => {
      const t0 = Date.now();
      log(`[${code}] start`);
      try {
        const res: any = await indexMarket(code, { deferSharedFlush: true });
        const itemCount = Number(res?.counts?.items || 0);
        totalIndexed += itemCount;
        const elapsed = since(t0);

        if (res?.metaUpdates && typeof res.metaUpdates === 'object') {
          updatesByMarket[code] = res.metaUpdates;
        }

        log(`[${code}] done items=${itemCount} elapsed=${elapsed}s metaUpdates=${Object.keys(res?.metaUpdates || {}).length}`);
        results.push({ market: code, items: itemCount, elapsed });

        // Append run meta (best-effort)
        try {
          const storeName = marketStore(code as any, env.stores as any);
          const key = Keys.runMeta.market(code as any);
          await appendRunMeta(storeName, key, {
            scope: `index:${code}`,
            counts: res?.counts || {},
            notes: { snapshotMeta: res?.snapshotMeta },
          });
        } catch {}
      } catch (e: any) {
        const elapsed = since(t0);
        errlog(`[${code}] error: ${e?.message || e}`);
        results.push({ market: code, items: 0, elapsed, error: e?.message || String(e) });
      }
    };

    // Concurrency-bounded batches. We use simple chunking rather than a
    // worker-pool because total work is small (≤9 markets) and predictable.
    for (let i = 0; i < markets.length; i += concurrency) {
      const batch = markets.slice(i, i + concurrency) as MarketCode[];
      log(`batch ${Math.floor(i / concurrency) + 1}: ${batch.join(", ")}`);
      await Promise.allSettled(batch.map((code) => runOne(code)));
    }

    // Single shared flush across ALL markets — avoids the read-modify-write
    // race that made parallel runs unsafe.
    try {
      const t0 = Date.now();
      const flushSummary = await flushSharedIndexMeta({ updatesByMarket });
      log(`shared index-meta flushed updates=${flushSummary.totalUpdates} markets=${flushSummary.markets} totalEntries=${flushSummary.totalEntries} elapsed=${since(t0)}s`);
    } catch (e: any) {
      warn(`shared index-meta flush failed: ${e?.message || e}`);
    }

    const totalElapsed = since(started);
    log(`index done total=${totalElapsed}s totalItems=${totalIndexed}`);

    // -----------------------------------------------------------------------
    // Phase: Index Diff — detect new/changed items across all markets
    // -----------------------------------------------------------------------
    let enrichResult: any = null;
    const skipEnrich = process.env.SKIP_FAST_ENRICH === '1' || process.env.SKIP_FAST_ENRICH === 'true';

    if (!skipEnrich && totalIndexed > 0) {
      try {
        const sharedBlob = getBlobClient(env.stores.shared);
        const SNAPSHOT_KEY = 'aggregates/index-snapshot.json';

        // Load previous snapshot (one per market)
        let allSnapshots: Record<string, IndexSnapshot> = {};
        try {
          const stored = await sharedBlob.getJSON<Record<string, IndexSnapshot>>(SNAPSHOT_KEY);
          if (stored && typeof stored === 'object') allSnapshots = stored;
        } catch {}

        // Compute per-market diffs
        const diffs = [];
        const newSnapshots: Record<string, IndexSnapshot> = {};

        for (const code of markets) {
          try {
            const storeName = marketStore(code as MarketCode, env.stores as any);
            const mktBlob = getBlobClient(storeName);
            const currentIndex = await mktBlob.getJSON<any[]>(Keys.market.index(code));
            if (!Array.isArray(currentIndex) || currentIndex.length === 0) continue;

            const prevSnap = allSnapshots[code] || {};
            const diff = computeIndexDiff(currentIndex, prevSnap, code as MarketCode);
            diffs.push(diff);
            newSnapshots[code] = diff.snapshot;

            if (diff.newItems.length > 0 || diff.changedItems.length > 0) {
              log(`[diff:${code}] new=${diff.newItems.length} changed=${diff.changedItems.length} removed=${diff.removedIds.length}`);
            }
          } catch (e: any) {
            warn(`[diff:${code}] error: ${e?.message || e}`);
            // Preserve previous snapshot for this market on error
            if (allSnapshots[code]) newSnapshots[code] = allSnapshots[code];
          }
        }

        // Merge diffs across markets (deduplicates items appearing in multiple markets)
        const merged = mergeMarketDiffs(diffs);
        const toEnrich = [...merged.newItems, ...merged.changedItems];

        log(`diff merged: new=${merged.newItems.length} changed=${merged.changedItems.length} toEnrich=${toEnrich.length}`);

        // -----------------------------------------------------------------------
        // Phase: Fast Enrich — process new/changed items inline
        // -----------------------------------------------------------------------
        if (toEnrich.length > 0) {
          const { fastEnrich } = await import('../../scripts/unified-crawler/stages/items/fastEnrich');
          const { writeItemAggregates } = await import('../../scripts/unified-crawler/stages/items/aggregates');

          // Deadline: leave 2 minutes buffer for snapshot save + ISR revalidation
          const deadlineMs = started + (13 * 60 * 1000); // 13 min of 15 min budget

          enrichResult = await fastEnrich(toEnrich, {
            markets: markets as MarketCode[],
            stores: env.stores as any,
            deadlineMs,
            processImages: true,
          });

          log(`fast-enrich done: enriched=${enrichResult.enriched} failed=${enrichResult.failed} skipped=${enrichResult.skippedDeadline} images=${enrichResult.imagesProcessed} elapsed=${enrichResult.elapsedMs}ms`);

          // Write aggregate updates (shares, shipping summaries, shipping metadata)
          if (enrichResult.enriched > 0) {
            try {
              await writeItemAggregates(
                enrichResult.aggregateUpdates,
                env.stores as any,
                log,
              );
            } catch (e: any) {
              warn(`aggregates write failed: ${e?.message || e}`);
            }
          }
        }

        // Save updated snapshots (always, even if no enrichment — tracks removals)
        try {
          await sharedBlob.putJSON(SNAPSHOT_KEY, newSnapshots);
        } catch (e: any) {
          warn(`snapshot save failed: ${e?.message || e}`);
        }

      } catch (e: any) {
        // Fast-enrich failures must NEVER break the index function
        warn(`fast-enrich phase error (non-fatal): ${e?.message || e}`);
      }
    } else if (skipEnrich) {
      log('fast-enrich skipped (SKIP_FAST_ENRICH=1)');
    }

    // Trigger on-demand ISR revalidation for all markets after successful indexing
    log("triggering ISR revalidation for all markets");
    const tRevalidate = Date.now();
    await tryRevalidateAllMarkets();
    log(`revalidation complete elapsed=${since(tRevalidate)}s`);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        ok: true, 
        totalItems: totalIndexed,
        elapsed: since(started),
        markets: results,
        enriched: enrichResult ? {
          new: enrichResult.enriched,
          failed: enrichResult.failed,
          skipped: enrichResult.skippedDeadline,
          images: enrichResult.imagesProcessed,
        } : null
      }),
    } as any;
  } catch (e: any) {
    errlog(`fatal: ${e?.stack || e?.message || String(e)}`);
    return { statusCode: 500, body: "error" } as any;
  }
};

export default handler;
