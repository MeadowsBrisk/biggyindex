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

/**
 * Fetch full item detail by merging shared blob + per-market shipping blob.
 *
 * Data layout:
 *  1. site-index-shared/items/{id}.json  → description, reviews, shareLink,
 *     PLUS locale-independent index fields: images (i, is), seller (sn, sid),
 *     variants (v), prices (uMin, uMax), timestamps (fsa, lua, lur),
 *     shipsFrom (sf), reviewStats (rs), endorsements (ec), category (c, sc),
 *     and _markets array (which markets carry this item).
 *
 *  2. site-index-{mkt}/market-shipping/{id}.json → shipping options +
 *     translated SEO fields (n, sn, sid, i, is, c, sc for BUG-002 fallback).
 *     The translated `n` (name) takes priority for non-GB markets.
 *     Blob existence = item is available in this market.
 */
export async function fetchItemDetail(refNum: string | number, market: string = 'GB'): Promise<any | null> {
  if (!refNum) return null;
  const storeName = process.env.SHARED_STORE_NAME || 'site-index-shared';
  const itemKey = `items/${encodeURIComponent(String(refNum))}.json`;
  let detailObj: any = null;

  try {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;

    // Helper to get a blob store handle
    const getStoreHandle = (name: string) => {
      let store: any = null;
      if (siteID && token) {
        try { store = getStore({ name, siteID, token, consistency: 'strong' }); } catch { }
      }
      if (!store) {
        try { store = getStore({ name, consistency: 'strong' }); } catch { }
      }
      return store;
    };

    // 1. Load shared blob (all locale-independent data)
    const sharedStore = getStoreHandle(storeName);
    if (sharedStore) {
      try {
        const raw = await sharedStore.get(itemKey);
        if (raw) {
          try { detailObj = JSON.parse(raw); } catch { detailObj = null; }
        }
      } catch { }
    }

    if (detailObj) {
      const mkt = normalizeMarket(market);

      // Expand shared blob minified keys into long-form for the front-end
      if (detailObj.i && !detailObj.imageUrl) detailObj.imageUrl = detailObj.i;
      if (Array.isArray(detailObj.is) && detailObj.is.length && !detailObj.imageUrls) detailObj.imageUrls = detailObj.is;
      if (detailObj.sn && !detailObj.sellerName) detailObj.sellerName = detailObj.sn;
      if (detailObj.sid != null && !detailObj.sellerId) detailObj.sellerId = detailObj.sid;
      if (detailObj.c && !detailObj.category) detailObj.category = detailObj.c;
      if (Array.isArray(detailObj.sc) && !detailObj.subcategories) detailObj.subcategories = detailObj.sc;
      if (detailObj.uMin != null && !detailObj.priceMin) detailObj.priceMin = detailObj.uMin;
      if (detailObj.uMax != null && !detailObj.priceMax) detailObj.priceMax = detailObj.uMax;
      if (detailObj.fsa && !detailObj.firstSeenAt) detailObj.firstSeenAt = detailObj.fsa;
      if (detailObj.lua && !detailObj.lastUpdatedAt) detailObj.lastUpdatedAt = detailObj.lua;
      if (detailObj.sf && !detailObj.shipsFrom) detailObj.shipsFrom = detailObj.sf;
      // Normalize variants from index format
      if (Array.isArray(detailObj.v) && detailObj.v.length && !detailObj.variants) {
        detailObj.variants = detailObj.v.map((v: any) => ({
          id: v.vid ?? v.id,
          description: v.d ?? v.description,
          baseAmount: typeof v.usd === 'number' ? v.usd : v.baseAmount,
          priceUSD: typeof v.usd === 'number' ? v.usd : v.priceUSD,
          ...v,
        }));
      }
      // Name is locale-specific — NOT stored in shared blob.
      // It will be set from the shipping blob's translated `n` field below.
      // Until then, use any existing name field as a fallback.
      if (!detailObj.name && detailObj.n) detailObj.name = detailObj.n;
      detailObj.refNum = detailObj.refNum ?? detailObj.ref ?? refNum;
      detailObj.id = detailObj.id ?? refNum;

      try {
        const mktStoreName = marketStoreName(mkt);
        const mktStore = getStoreHandle(mktStoreName);
        if (!mktStore) throw new Error('no market store');

        // 2. Load per-market shipping blob (shipping options + translated SEO)
        const shipKey = `market-shipping/${encodeURIComponent(String(refNum))}.json`;
        let ship: any = null;
        try {
          const shipRaw = await mktStore.get(shipKey);
          if (shipRaw) ship = JSON.parse(shipRaw);
        } catch { }

        // Try fallback key if item has a different internal ID
        if (!ship) {
          const possibleId = detailObj.id || detailObj.ref || detailObj.refNum;
          if (possibleId && String(possibleId) !== String(refNum)) {
            try {
              const altKey = `market-shipping/${encodeURIComponent(String(possibleId))}.json`;
              const altRaw = await mktStore.get(altKey);
              if (altRaw) ship = JSON.parse(altRaw);
            } catch { }
          }
        }

        if (ship) {
          // Shipping blob exists → item is available in this market
          detailObj._foundInMarketIndex = true;

          // Merge shipping options
          if (Array.isArray(ship.options)) {
            detailObj.shipping = { ...(detailObj.shipping || {}), options: ship.options };
          }

          // Translated name from shipping blob takes priority (locale-specific)
          if (ship.n) {
            detailObj.n = ship.n;
            detailObj.name = ship.n;
          }
          // Also preserve other translated SEO fields for BUG-002 fallback
          if (ship.c) { detailObj.c = ship.c; detailObj.category = ship.c; }
          if (Array.isArray(ship.sc)) { detailObj.sc = ship.sc; detailObj.subcategories = ship.sc; }
        }
      } catch (e) {
        console.warn('Failed to load market data:', e);
      }
    }

    return detailObj;
  } catch (e) {
    console.error('fetchItemDetail error:', e);
    return null;
  }
}
