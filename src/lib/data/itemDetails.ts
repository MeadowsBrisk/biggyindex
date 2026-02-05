// used for item slug pages and item detail fetching

import { getStore } from '@netlify/blobs';
import { MARKETS, type Market } from '@/lib/market/market';

function normalizeMarket(mkt: any): Market {
  const s = String(mkt || 'GB').toUpperCase();
  return MARKETS.includes(s as Market) ? (s as Market) : 'GB';
}



function marketStoreName(mkt: Market) {
  const envMap: Record<Market, string | undefined> = {
    GB: process.env.MARKET_STORE_GB,
    DE: process.env.MARKET_STORE_DE,
    FR: process.env.MARKET_STORE_FR,
    PT: process.env.MARKET_STORE_PT,
    IT: process.env.MARKET_STORE_IT,
    ES: process.env.MARKET_STORE_ES,
  } as any;
  if (envMap[mkt]) return envMap[mkt] as string;
  return `site-index-${mkt.toLowerCase()}`;
}

// Global cache to prevent fetching the full index on every request (persists in warm serverless instances)
const indexCache: Record<string, { data: any[]; ts: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchItemDetail(refNum: string | number, market: string = 'GB'): Promise<any | null> {
  if (!refNum) return null;
  const storeName = process.env.SHARED_STORE_NAME || 'site-index-shared';
  const candidateKeys = [`items/${encodeURIComponent(String(refNum))}.json`];
  let detailObj: any = null;

  try {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;

    let store: any = null;
    if (siteID && token) {
      try { store = getStore({ name: storeName, siteID, token, consistency: 'strong' }); } catch { }
    }
    if (!store) {
      try { store = getStore({ name: storeName, consistency: 'strong' }); } catch { }
    }

    if (store) {
      for (const key of candidateKeys) {
        try {
          const raw = await store.get(key);
          if (raw) {
            try { detailObj = JSON.parse(raw); } catch { detailObj = null; }
            if (detailObj) break;
          }
        } catch { }
      }
    }

    if (detailObj) {
      const mkt = normalizeMarket(market);
      try {
        const marketName = marketStoreName(mkt);
        let marketStore: any = null;
        if (siteID && token) {
          try { marketStore = getStore({ name: marketName, siteID, token, consistency: 'strong' }); } catch { }
        }
        if (!marketStore) {
          try { marketStore = getStore({ name: marketName, consistency: 'strong' }); } catch { }
        }

        const candidateShipKeys: string[] = [];
        candidateShipKeys.push(`market-shipping/${encodeURIComponent(String(refNum))}.json`);
        const possibleId = (detailObj && (detailObj.id || detailObj.ref || detailObj.refNum));
        if (possibleId && possibleId !== refNum) {
          candidateShipKeys.push(`market-shipping/${encodeURIComponent(String(possibleId))}.json`);
        }

        if (marketStore) {
          // 1. Fetch shipping options
          for (const shipKey of candidateShipKeys) {
            let shipRaw: any = null;
            try { shipRaw = await marketStore.get(shipKey); } catch { }
            if (!shipRaw) continue;
            try {
              const ship = JSON.parse(shipRaw);
              if (ship && Array.isArray(ship.options)) {
                detailObj.shipping = { ...(detailObj.shipping || {}), options: ship.options };
                break;
              }
            } catch { }
          }

          // 2. Fetch item from market index to backfill missing fields (price, variants, images)
          // This avoids loading the full index on the client for standalone pages
          try {
            const indexKey = `indexed_items.json`; // Standard index key
            const cacheKey = `${mkt}:${indexKey}`;
            let index: any[] | null = null;

            // Check in-memory cache first
            if (indexCache[cacheKey] && (Date.now() - indexCache[cacheKey].ts < CACHE_TTL_MS)) {
              index = indexCache[cacheKey].data;
            } else {
              // Fetch fresh if missing or stale
              const indexRaw = await marketStore.get(indexKey);
              if (indexRaw) {
                const parsed = JSON.parse(indexRaw);
                if (Array.isArray(parsed)) {
                  index = parsed;
                  indexCache[cacheKey] = { data: parsed, ts: Date.now() };
                }
              }
            }

            if (index) {
              // Find item by refNum (preferred) or id
              const found = index.find((it: any) =>
                String(it.refNum || it.ref || it.id) === String(refNum)
              );
              if (found) {
                // Merge index data into detailObj, preferring detailObj for description/reviews
                // but using index for price, variants, images, seller, etc.

                // Map compact index fields to full names if needed (similar to atoms.tsx normalization)
                const normalizedIndexItem = {
                  ...found,
                  id: found.id ?? found.refNum ?? found.ref,
                  name: found.n ?? found.name,
                  sellerName: found.sn ?? found.sellerName,
                  sellerId: found.sid ?? found.sellerId,
                  image: found.i ?? found.image,
                  images: Array.isArray(found.is) ? found.is : (found.i ? [found.i] : []),
                  variants: Array.isArray(found.v) ? found.v.map((v: any) => ({
                    id: v.vid ?? v.id,
                    description: v.d ?? v.description,
                    baseAmount: typeof v.usd === 'number' ? v.usd : v.baseAmount,
                    priceUSD: typeof v.usd === 'number' ? v.usd : v.priceUSD,
                  })) : found.variants,
                  priceMin: found.uMin ?? found.priceMin,
                  priceMax: found.uMax ?? found.priceMax,
                  category: found.c ?? found.category,
                  subcategories: found.sc ?? found.subcategories,
                  shipsFrom: found.sf ?? found.shipsFrom,
                  hotness: found.h ?? found.hotness,
                  firstSeenAt: found.fsa ?? found.firstSeenAt,
                  lastUpdatedAt: found.lua ?? found.lastUpdatedAt,
                };

                // Merge strategy: keep existing detailObj fields (desc, reviews), fill gaps from index
                detailObj = {
                  ...normalizedIndexItem,
                  ...detailObj, // detailObj wins for description, reviews, shipping
                  // Ensure arrays/objects are merged if needed, but usually detailObj has better specific data
                  // except for variants/images which are often missing in detailObj
                  variants: normalizedIndexItem.variants || detailObj.variants,
                  images: (normalizedIndexItem.images && normalizedIndexItem.images.length) ? normalizedIndexItem.images : detailObj.images,
                  imageUrl: normalizedIndexItem.image || detailObj.imageUrl,
                  priceMin: normalizedIndexItem.priceMin ?? detailObj.priceMin,
                  priceMax: normalizedIndexItem.priceMax ?? detailObj.priceMax,
                  sellerName: normalizedIndexItem.sellerName || detailObj.sellerName,
                  // Flag for caller to know item was found in market index (for 404 logic)
                  _foundInMarketIndex: true,
                };
              }
            }
          } catch (e) {
            console.warn('Failed to backfill from index:', e);
          }
        }
      } catch { }
    }

    return detailObj;
  } catch (e) {
    console.error('fetchItemDetail error:', e);
    return null;
  }
}
