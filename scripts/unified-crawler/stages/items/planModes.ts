/**
 * Shared mode-planning logic for the items stage.
 *
 * Decides whether each item needs a 'full' crawl or 'reviews-only' based on
 * staleness (lastFullCrawl vs CRAWLER_FULL_REFRESH_DAYS) and index-change
 * detection (lastIndexedLua vs current index lua).
 *
 * Used by both CLI and Netlify background function so behaviour stays in sync.
 */

import type { MarketCode } from '../../shared/types';
import { getBlobClient } from '../../shared/persistence/blobs';
import { Keys } from '../../shared/persistence/keys';

export interface PlanModesInput {
  /** Unique item IDs to plan */
  uniqueIds: string[];
  /** Map from item ID → set of markets the item appears in */
  presenceMap: Map<string, Set<string>>;
  /** Map from item ID → lastUpdatedAt value from the index */
  idLua: Map<string, string>;
  /** Name of the shared Blob store */
  sharedStoreName: string;
  /** Force full mode for every item (CLI --force or env CRAWLER_FORCE) */
  forceAll?: boolean;
  /** Override CRAWLER_FULL_REFRESH_DAYS (default: read from env or 80) */
  fullRefreshDays?: number;
}

export interface PlannedItem {
  id: string;
  markets: MarketCode[];
  mode: 'full' | 'reviews-only';
  lua?: string;
}

export interface PlanModesResult {
  planned: PlannedItem[];
  indexChangedCount: number;
  noFullCrawlCount: number;
}

/**
 * Plan crawl modes for a set of items.
 *
 * Rules (applied in order):
 * 1. forceAll → everything is 'full'
 * 2. No shipping-meta entry → 'full' (new item)
 * 3. Has lastRefresh but no lastFullCrawl → 'full' (stuck in reviews-only)
 * 4. lastFullCrawl older than fullRefreshDays → 'full' (stale)
 * 5. Index lua newer than stored lastIndexedLua → 'full' (index changed)
 * 6. Otherwise → 'reviews-only'
 */
export async function planItemModes(input: PlanModesInput): Promise<PlanModesResult> {
  const {
    uniqueIds,
    presenceMap,
    idLua,
    sharedStoreName,
    forceAll = false,
    fullRefreshDays,
  } = input;

  const resolvedDays = fullRefreshDays
    ?? Number.parseInt(process.env.CRAWLER_FULL_REFRESH_DAYS || '80', 10);
  const fullRefreshMs = resolvedDays * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - fullRefreshMs;

  // Force-all short circuit
  if (forceAll) {
    const planned: PlannedItem[] = uniqueIds.map(id => ({
      id,
      markets: Array.from(presenceMap.get(id) || []) as MarketCode[],
      mode: 'full',
      lua: idLua.get(id) || undefined,
    }));
    return { planned, indexChangedCount: 0, noFullCrawlCount: 0 };
  }

  // Load shipping-meta aggregate once (one file instead of N individual loads)
  const sharedBlob = getBlobClient(sharedStoreName);
  const shippingMeta: Record<string, {
    lastRefresh?: string;
    lastFullCrawl?: string;
    lastIndexedLua?: string;
    markets?: Record<string, string>;
  }> = await sharedBlob.getJSON<any>(Keys.shared.aggregates.shippingMeta()).catch(() => ({})) || {};

  const planned: PlannedItem[] = [];
  let indexChangedCount = 0;
  let noFullCrawlCount = 0;

  for (const id of uniqueIds) {
    const marketsFor = Array.from(presenceMap.get(id) || []) as MarketCode[];
    const indexLua = idLua.get(id);
    const metaEntry = shippingMeta[id];

    let mode: 'full' | 'reviews-only' = 'reviews-only';

    if (!metaEntry || !metaEntry.lastRefresh) {
      // New item — never crawled
      mode = 'full';
    } else if (!metaEntry.lastFullCrawl) {
      // Crawled (has lastRefresh) but never had a full crawl (e.g. only got reviews).
      // Without this, such items get stuck in reviews-only forever.
      mode = 'full';
      noFullCrawlCount++;
    } else {
      const lastFullCrawlTime = new Date(metaEntry.lastFullCrawl).getTime();
      if (lastFullCrawlTime < cutoffTime) {
        // Stale — lastFullCrawl older than fullRefreshDays
        mode = 'full';
      } else if (indexLua) {
        // Compare index lua to stored lastIndexedLua
        const lastIndexedLua = metaEntry.lastIndexedLua;
        if (!lastIndexedLua || new Date(indexLua) > new Date(lastIndexedLua)) {
          mode = 'full';
          indexChangedCount++;
        }
      }
    }

    planned.push({ id, markets: marketsFor, mode, lua: indexLua });
  }

  return { planned, indexChangedCount, noFullCrawlCount };
}
