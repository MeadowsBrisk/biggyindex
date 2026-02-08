// used for item slug pages and item detail fetching

import { MARKETS, type Market } from '@/lib/market/market';
import { readR2JSON, buildR2Key } from '@/lib/data/r2Client';

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
 * Fetch full item detail by merging shared data + per-market shipping data.
 *
 * Data layout:
 *  1. shared/items/{id}.json  → description, reviews, shareLink,
 *     PLUS locale-independent index fields: images (i, is), seller (sn, sid),
 *     variants (v), prices (uMin, uMax), timestamps (fsa, lua, lur),
 *     shipsFrom (sf), reviewStats (rs), endorsements (ec), category (c, sc),
 *     and _markets array (which markets carry this item).
 *
 *  2. markets/{mkt}/market-shipping/{id}.json → shipping options +
 *     translated SEO fields (n, sn, sid, i, is, c, sc for BUG-002 fallback).
 *     The translated `n` (name) takes priority for non-GB markets.
 *     R2 key existence = item is available in this market.
 */
export async function fetchItemDetail(refNum: string | number, market: string = 'GB'): Promise<any | null> {
  if (!refNum) return null;

  try {
    const mkt = normalizeMarket(market);
    const sharedStoreName = process.env.SHARED_STORE_NAME || 'site-index-shared';
    const mktStoreName = marketStoreName(mkt);

    // 1. Load shared data (all locale-independent data)
    const itemKey = `items/${encodeURIComponent(String(refNum))}.json`;
    let detailObj = await readR2JSON<any>(buildR2Key(sharedStoreName, itemKey));
    if (!detailObj) return null;

    // Expand minified keys
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
    if (Array.isArray(detailObj.v) && detailObj.v.length && !detailObj.variants) {
      detailObj.variants = detailObj.v.map((v: any) => ({
        id: v.vid ?? v.id,
        description: v.d ?? v.description,
        baseAmount: typeof v.usd === 'number' ? v.usd : v.baseAmount,
        priceUSD: typeof v.usd === 'number' ? v.usd : v.priceUSD,
        ...v,
      }));
    }
    if (!detailObj.name && detailObj.n) detailObj.name = detailObj.n;
    detailObj.refNum = detailObj.refNum ?? detailObj.ref ?? refNum;
    detailObj.id = detailObj.id ?? refNum;

    // 2. Load per-market shipping data
    const shipKey = `market-shipping/${encodeURIComponent(String(refNum))}.json`;
    let ship = await readR2JSON<any>(buildR2Key(mktStoreName, shipKey));

    // Try fallback key if item has a different internal ID
    if (!ship) {
      const possibleId = detailObj.id || detailObj.ref || detailObj.refNum;
      if (possibleId && String(possibleId) !== String(refNum)) {
        const altKey = `market-shipping/${encodeURIComponent(String(possibleId))}.json`;
        ship = await readR2JSON<any>(buildR2Key(mktStoreName, altKey));
      }
    }

    if (ship) {
      detailObj._foundInMarketIndex = true;
      if (Array.isArray(ship.options)) {
        const translatedOpts = ship.translations?.shippingOptions;
        const shippingOptions = (Array.isArray(translatedOpts) && translatedOpts.length > 0)
          ? translatedOpts : ship.options;
        detailObj.shipping = { ...(detailObj.shipping || {}), options: shippingOptions };
        detailObj.shippingOptionsEn = ship.options;
      }
      if (ship.translations?.description) {
        detailObj.descriptionTranslated = ship.translations.description;
      }
      if (ship.n) { detailObj.n = ship.n; detailObj.name = ship.n; }
      if (ship.c) { detailObj.c = ship.c; detailObj.category = ship.c; }
      if (Array.isArray(ship.sc)) { detailObj.sc = ship.sc; detailObj.subcategories = ship.sc; }
    }

    // 3. Apply variant translations from shipping blob (non-GB markets)
    if (mkt !== 'GB' && ship?.translations?.v && Array.isArray(ship.translations.v) && Array.isArray(detailObj.variants)) {
      const translatedMap = new Map<string, string>();
      for (const tv of ship.translations.v) {
        if (tv.vid && tv.d) translatedMap.set(String(tv.vid), tv.d);
      }
      for (const variant of detailObj.variants) {
        const vid = String(variant.vid ?? variant.id);
        const translated = translatedMap.get(vid);
        if (translated) {
          variant.dEn = variant.dEn || variant.d || variant.description;
          variant.d = translated;
          variant.description = translated;
        }
      }
      // Also update minified v[] so components reading .v get translated text
      if (Array.isArray(detailObj.v)) {
        for (const vItem of detailObj.v) {
          const vid = String(vItem.vid ?? vItem.id);
          const translated = translatedMap.get(vid);
          if (translated) {
            vItem.dEn = vItem.dEn || vItem.d;
            vItem.d = translated;
          }
        }
      }
    }

    return detailObj;
  } catch (e) {
    console.error('[itemDetails] fetchItemDetail error:', e);
    return null;
  }
}
