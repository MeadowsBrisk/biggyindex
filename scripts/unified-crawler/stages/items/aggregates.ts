/**
 * Shared aggregate-write logic for the items stage.
 * Both cli.ts and crawler-items-background.ts collect per-item updates
 * during a run, then merge-write them to Blobs once at the end.
 *
 * Extracted to avoid ~80 lines of duplication between CLI and Netlify function.
 */
import { getBlobClient } from '../../shared/persistence/blobs';
import { Keys } from '../../shared/persistence/keys';
import { marketStore } from '../../shared/env/markets';
import type { MarketCode } from '../../shared/types';

export interface ItemAggregateUpdates {
  shareUpdates: Record<string, string>;
  shipUpdatesByMarket: Record<string, Record<string, { min: number; max: number; free: number }>>;
  shippingMetaUpdates: Record<string, { lastRefresh: string; markets?: Record<string, string>; lastIndexedLua?: string; lastFullCrawl?: string }>;
}

interface WriteResult {
  sharesWritten: boolean;
  shipSummariesWritten: string[];
  metaWritten: boolean;
}

/**
 * Merge-write all item aggregate updates (shares, shipping summaries, shipping metadata) to Blobs.
 * @param updates - Collected updates from the item-processing loop
 * @param stores - Store configuration from loadEnv()
 * @param logger - Logging function for progress/status messages
 */
export async function writeItemAggregates(
  updates: ItemAggregateUpdates,
  stores: { shared: string; [key: string]: string },
  logger: (msg: string) => void,
): Promise<WriteResult> {
  const result: WriteResult = { sharesWritten: false, shipSummariesWritten: [], metaWritten: false };

  // 1. Shared shares aggregate
  const sharedBlob = getBlobClient(stores.shared);
  const sharesKey = Keys.shared.aggregates.shares();
  const existingShares = ((await sharedBlob.getJSON<any>(sharesKey)) || {}) as Record<string, string>;
  let sharesChanged = false;
  for (const [id, link] of Object.entries(updates.shareUpdates)) {
    if (typeof link !== 'string' || !link) continue;
    if (existingShares[id] !== link) {
      existingShares[id] = link;
      sharesChanged = true;
    }
  }
  if (sharesChanged) {
    await sharedBlob.putJSON(sharesKey, existingShares);
    logger(`aggregates: wrote shares (${Object.keys(updates.shareUpdates).length} updates, total ${Object.keys(existingShares).length})`);
    result.sharesWritten = true;
  } else {
    logger(`aggregates: shares unchanged (${Object.keys(updates.shareUpdates).length} candidates)`);
  }

  // 2. Per-market shipping summary aggregates
  for (const [mkt, mktUpdates] of Object.entries(updates.shipUpdatesByMarket)) {
    const storeName = marketStore(mkt as MarketCode, stores as any);
    const marketBlob = getBlobClient(storeName);
    const key = Keys.market.aggregates.shipSummary();
    const existing = ((await marketBlob.getJSON<any>(key)) || {}) as Record<string, { min: number; max: number; free: number }>;
    let changed = false;
    for (const [id, summary] of Object.entries(mktUpdates)) {
      const prev = existing[id];
      const same = prev && prev.min === summary.min && prev.max === summary.max && prev.free === summary.free;
      if (!same) {
        existing[id] = summary;
        changed = true;
      }
    }
    if (changed) {
      await marketBlob.putJSON(key, existing);
      logger(`aggregates: wrote shipSummary for ${mkt} (${Object.keys(mktUpdates).length} updates, total ${Object.keys(existing).length})`);
      result.shipSummariesWritten.push(mkt);
    } else {
      logger(`aggregates: shipSummary unchanged for ${mkt} (${Object.keys(mktUpdates).length} candidates)`);
    }
  }

  // 3. Shipping metadata aggregate (staleness tracking)
  if (Object.keys(updates.shippingMetaUpdates).length > 0) {
    const metaKey = Keys.shared.aggregates.shippingMeta();
    const existingMeta = ((await sharedBlob.getJSON<any>(metaKey)) || {}) as Record<string, any>;
    let metaChanged = false;
    for (const [id, update] of Object.entries(updates.shippingMetaUpdates)) {
      const prev = existingMeta[id];
      const same = prev
        && prev.lastRefresh === update.lastRefresh
        && prev.lastIndexedLua === update.lastIndexedLua
        && JSON.stringify(prev.markets || {}) === JSON.stringify(update.markets || {});
      if (!same) {
        existingMeta[id] = update;
        metaChanged = true;
      }
    }
    if (metaChanged) {
      await sharedBlob.putJSON(metaKey, existingMeta);
      logger(`aggregates: wrote shippingMeta (${Object.keys(updates.shippingMetaUpdates).length} updates, total ${Object.keys(existingMeta).length})`);
      result.metaWritten = true;
    } else {
      logger(`aggregates: shippingMeta unchanged (${Object.keys(updates.shippingMetaUpdates).length} candidates)`);
    }
  }

  return result;
}
