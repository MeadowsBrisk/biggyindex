// Shipping metadata aggregates - centralized staleness tracking
import type { MarketCode } from "../../shared/types";
import { Keys } from "../../shared/persistence/keys";
import type { BlobClient } from "../../shared/persistence/blobs";

const SHIPPING_STALE_DAYS = 7; // 1 week

export interface ShippingMetaEntry {
  /** ISO timestamp of last shipping refresh for each market */
  markets: Partial<Record<MarketCode, string>>;
  /** Global last refresh timestamp (fallback) */
  lastRefresh?: string;
  /** Index lua (lastUpdatedAt) at last full crawl - for change detection */
  lastIndexedLua?: string;
  /** ISO timestamp of last full crawl (description + shipping) - for staleness detection */
  lastFullCrawl?: string;
}

export interface ShippingMetaAggregate {
  [itemId: string]: ShippingMetaEntry;
}

/**
 * Load shipping metadata aggregate from shared storage
 */
export async function loadShippingMeta(sharedBlob: BlobClient): Promise<ShippingMetaAggregate> {
  try {
    const data = await sharedBlob.getJSON<ShippingMetaAggregate>(Keys.shared.aggregates.shippingMeta());
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

/**
 * Check if shipping data is stale for any target markets
 */
export function isShippingStale(
  meta: ShippingMetaAggregate,
  itemId: string,
  targetMarkets: MarketCode[]
): { needsRefresh: boolean; staleMarkets: MarketCode[] } {
  const entry = meta[itemId];
  if (!entry) {
    // No metadata = never refreshed = all markets stale
    return { needsRefresh: true, staleMarkets: [...targetMarkets] };
  }

  const cutoffTime = Date.now() - (SHIPPING_STALE_DAYS * 24 * 60 * 60 * 1000);
  const staleMarkets: MarketCode[] = [];

  for (const market of targetMarkets) {
    const marketRefresh = entry.markets[market];
    const lastRefresh = marketRefresh || entry.lastRefresh;

    if (!lastRefresh || new Date(lastRefresh).getTime() < cutoffTime) {
      staleMarkets.push(market);
    }
  }

  return {
    needsRefresh: staleMarkets.length > 0,
    staleMarkets
  };
}

/**
 * Update shipping metadata for refreshed markets
 */
export function updateShippingMeta(
  meta: ShippingMetaAggregate,
  itemId: string,
  refreshedMarkets: MarketCode[],
  opts?: { lastIndexedLua?: string }
): ShippingMetaAggregate {
  const now = new Date().toISOString();
  const updated = { ...meta };

  if (!updated[itemId]) {
    updated[itemId] = { markets: {} };
  } else {
    updated[itemId] = { ...updated[itemId], markets: { ...updated[itemId].markets } };
  }

  // Update per-market timestamps
  for (const market of refreshedMarkets) {
    updated[itemId].markets[market] = now;
  }

  // Update global timestamp
  updated[itemId].lastRefresh = now;

  // Update lastIndexedLua if provided (tracks index lastUpdatedAt at last full crawl)
  if (opts?.lastIndexedLua) {
    updated[itemId].lastIndexedLua = opts.lastIndexedLua;
  }

  return updated;
}

/**
 * Save shipping metadata aggregate to shared storage
 */
export async function saveShippingMeta(sharedBlob: BlobClient, meta: ShippingMetaAggregate): Promise<void> {
  await sharedBlob.putJSON(Keys.shared.aggregates.shippingMeta(), meta);
}