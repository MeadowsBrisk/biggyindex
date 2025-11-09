// Legacy seller analytics migration helper
// Reads legacy aggregate from legacy store (default 'site-index') under path 'seller-crawler/seller-analytics.json'
// and returns a per-market seeded aggregate filtered to active sellers in that market.

import { getBlobClient } from './blobs';

type AnyRec = Record<string, any>;

export async function seedMarketAnalyticsFromLegacy(params: {
  market: string;
  activeSellerIds: Set<string>;
  legacyStoreName?: string;
}) {
  const legacyStore = params.legacyStoreName || process.env.LEGACY_SELLER_ANALYTICS_STORE || 'site-index';
  try {
    const legacyClient = getBlobClient(legacyStore);
    // Legacy path
    const legacy = await legacyClient.getJSON<any>('seller-crawler/seller-analytics.json');
    if (!legacy || !Array.isArray(legacy?.sellers)) return null;
    const filtered = (legacy.sellers as AnyRec[]).filter((rec) => {
      const sid = rec?.sellerId;
      if (sid == null) return false;
      return params.activeSellerIds.has(String(sid));
    });
    return {
      generatedAt: new Date().toISOString(),
      totalSellers: filtered.length,
      dataVersion: 1,
      sellers: filtered,
    } as AnyRec;
  } catch {
    return null;
  }
}
