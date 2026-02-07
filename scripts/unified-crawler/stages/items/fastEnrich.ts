/**
 * Fast-enrich module: called immediately after index diff detects new/changed
 * items. Runs within the index function's remaining time budget (~12 min).
 *
 * For each item:
 *   1. Full crawl via processSingleItem (description, reviews, shipping)
 *   2. R2 image optimization via processImage (thumb + full AVIF)
 *   3. Collect aggregate updates for caller to flush
 *
 * Safety: 20-item cap, 10-min deadline, try/catch per item.
 * Fallback: Items that fail here are picked up by the 4h items function.
 */

import type { MarketCode } from '../../shared/env/loadEnv';
import type { IndexDiffItem } from '../../shared/logic/indexDiff';
import type { ProcessItemResult } from './processItem';
import type { ItemAggregateUpdates } from './aggregates';
import { log } from '../../shared/logging/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FastEnrichOptions {
  /** Maximum items to enrich in this run */
  maxItems?: number;
  /** Absolute deadline (Date.now()-based) — stop enqueueing items after this */
  deadlineMs?: number;
  /** Whether to process R2 images inline */
  processImages?: boolean;
  /** Markets configured in the environment */
  markets: MarketCode[];
  /** Stores config from loadEnv() */
  stores: { shared: string; [key: string]: string };
}

export interface FastEnrichResult {
  /** Items successfully enriched */
  enriched: number;
  /** Items that failed (will be retried by 4h items function) */
  failed: number;
  /** Items skipped due to deadline */
  skippedDeadline: number;
  /** Images processed via R2 */
  imagesProcessed: number;
  /** Total elapsed time in ms */
  elapsedMs: number;
  /** Aggregate updates to write (caller handles this) */
  aggregateUpdates: ItemAggregateUpdates;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FAST_ENRICH = 20;
const DEFAULT_DEADLINE_S = 600; // 10 minutes

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Fast-enrich new/changed items within the index function's time budget.
 *
 * @param items - Items from the index diff (new + changed, pre-merged across markets)
 * @param opts - Configuration options
 * @returns Results including aggregate updates for the caller to flush
 */
export async function fastEnrich(
  items: IndexDiffItem[],
  opts: FastEnrichOptions,
): Promise<FastEnrichResult> {
  const started = Date.now();
  const maxItems = Math.min(opts.maxItems ?? MAX_FAST_ENRICH, MAX_FAST_ENRICH);
  const deadline = opts.deadlineMs ?? (Date.now() + DEFAULT_DEADLINE_S * 1000);
  const doImages = opts.processImages !== false;

  // Cap the list
  const toProcess = items.slice(0, maxItems);

  if (toProcess.length === 0) {
    return {
      enriched: 0, failed: 0, skippedDeadline: 0,
      imagesProcessed: 0, elapsedMs: 0,
      aggregateUpdates: { shareUpdates: {}, shipUpdatesByMarket: {}, shippingMetaUpdates: {} },
    };
  }

  log.index.info('fast-enrich starting', {
    items: toProcess.length,
    maxItems,
    doImages,
    deadlineS: Math.round((deadline - Date.now()) / 1000),
  });

  // Lazy-load heavy modules (avoids import cost when fast-enrich isn't needed)
  const { ensureAuthedClient } = await import('../../shared/http/authedClient');
  const { processSingleItem } = await import('./processItem');

  // Authenticate once for all items
  const { client } = await ensureAuthedClient();
  log.index.info('fast-enrich authenticated');

  // Pre-load shares aggregate for reuse across items (avoids per-item blob reads)
  let sharesAgg: Record<string, string> = {};
  try {
    const { getBlobClient } = await import('../../shared/persistence/blobs');
    const { Keys } = await import('../../shared/persistence/keys');
    const sharedBlob = getBlobClient(opts.stores.shared);
    const existing = await sharedBlob.getJSON<any>(Keys.shared.aggregates.shares());
    if (existing && typeof existing === 'object') sharesAgg = existing;
  } catch {}

  // Collect aggregate updates
  const shareUpdates: Record<string, string> = {};
  const shipUpdatesByMarket: Record<string, Record<string, { min: number; max: number; free: number }>> = {};
  const shippingMetaUpdates: Record<string, { lastRefresh: string; markets?: Record<string, string>; lastIndexedLua?: string; lastFullCrawl?: string }> = {};

  let enriched = 0;
  let failed = 0;
  let skippedDeadline = 0;
  let imagesProcessed = 0;

  for (let idx = 0; idx < toProcess.length; idx++) {
    const item = toProcess[idx];

    // Deadline check before starting each item
    if (Date.now() > deadline) {
      skippedDeadline = toProcess.length - idx;
      log.index.warn('fast-enrich deadline reached', {
        processed: enriched + failed,
        skipped: skippedDeadline,
      });
      break;
    }

    const t0 = Date.now();
    const itemMarkets = item.markets.length > 0 ? item.markets : opts.markets;

    try {
      // 1. Full crawl (description, reviews, shipping)
      const result: ProcessItemResult = await processSingleItem(
        item.id,
        itemMarkets,
        {
          client,
          logPrefix: '[fast-enrich]',
          mode: 'full',
          indexLua: item.indexEntry?.lua || undefined,
          sharesAgg,
          indexEntry: item.indexEntry,
        },
      );

      if (result.ok) {
        enriched++;

        // Collect aggregate updates
        if (result.shareLink) {
          shareUpdates[item.id] = result.shareLink;
        }
        if (result.shipSummaryByMarket) {
          for (const [mkt, summary] of Object.entries(result.shipSummaryByMarket)) {
            if (!shipUpdatesByMarket[mkt]) shipUpdatesByMarket[mkt] = {};
            shipUpdatesByMarket[mkt][item.id] = summary as any;
          }
        }
        if (result.shippingMetaUpdate) {
          shippingMetaUpdates[item.id] = result.shippingMetaUpdate;
        }
      } else {
        failed++;
        log.index.warn('fast-enrich item failed', {
          id: item.id,
          reason: item.reason,
          errors: result.errors?.join(', '),
        });
      }

      // 2. R2 image optimization (if enabled and item has images)
      if (doImages && result.ok) {
        try {
          const imageUrls = collectImageUrls(item.indexEntry);
          if (imageUrls.length > 0) {
            const processed = await processItemImages(imageUrls);
            imagesProcessed += processed;
          }
        } catch (imgErr: any) {
          // Non-fatal — images will be picked up by the 3x daily images stage
          log.index.debug('fast-enrich images failed', {
            id: item.id,
            error: imgErr?.message || String(imgErr),
          });
        }
      }

      const ms = Date.now() - t0;
      log.index.info('fast-enrich item done', {
        pos: `${idx + 1}/${toProcess.length}`,
        id: item.id,
        reason: item.reason,
        ok: result.ok ? 1 : 0,
        ms,
      });

    } catch (err: any) {
      failed++;
      const ms = Date.now() - t0;
      log.index.error('fast-enrich item error', {
        id: item.id,
        reason: item.reason,
        error: err?.message || String(err),
        ms,
      });
    }
  }

  const elapsedMs = Date.now() - started;
  log.index.info('fast-enrich complete', {
    enriched,
    failed,
    skippedDeadline,
    imagesProcessed,
    elapsedMs,
  });

  return {
    enriched,
    failed,
    skippedDeadline,
    imagesProcessed,
    elapsedMs,
    aggregateUpdates: { shareUpdates, shipUpdatesByMarket, shippingMetaUpdates },
  };
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

/** Extract image URLs from an index entry (primary + gallery) */
function collectImageUrls(indexEntry: any): string[] {
  if (!indexEntry) return [];
  const urls: string[] = [];
  if (indexEntry.i && typeof indexEntry.i === 'string') urls.push(indexEntry.i);
  if (Array.isArray(indexEntry.is)) {
    for (const url of indexEntry.is) {
      if (typeof url === 'string' && !urls.includes(url)) urls.push(url);
    }
  }
  // Safety cap — don't process more than 10 images per item
  return urls.slice(0, 10);
}

/**
 * Process images for a single item via R2 (Sharp → AVIF).
 * Returns number of images actually processed (not cached).
 */
async function processItemImages(urls: string[]): Promise<number> {
  // Lazy-load the optimizer to avoid Sharp import cost when not needed
  const { createR2Client, processImage } = await import('../images/optimizer');
  const r2Client = createR2Client();

  let processed = 0;
  for (const url of urls) {
    try {
      const result = await processImage(r2Client, url, { force: false });
      if (result.error) {
        log.index.debug('image processing failed', { url: url.slice(0, 80), error: result.error });
      } else if (!result.cached) {
        processed++;
      }
    } catch (err: any) {
      log.index.debug('image processing error', { url: url.slice(0, 80), error: err?.message || String(err) });
    }
  }

  return processed;
}
