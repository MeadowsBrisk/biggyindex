import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

export const config = { runtime: 'nodejs' };

type Store = { get: (key: string) => Promise<string | null> } | null;

type Detail = any; // keep broad, just pass-through JSON

type Market = 'GB' | 'DE' | 'FR' | 'PT' | 'IT';

function normalizeMarket(mkt: any): Market {
  const s = String(mkt || 'GB').toUpperCase();
  return (s === 'GB' || s === 'DE' || s === 'FR' || s === 'PT' || s === 'IT') ? (s as Market) : 'GB';
}

function marketStoreName(mkt: Market) {
  const envMap: Record<Market, string | undefined> = {
    GB: process.env.MARKET_STORE_GB,
    DE: process.env.MARKET_STORE_DE,
    FR: process.env.MARKET_STORE_FR,
    PT: process.env.MARKET_STORE_PT,
    IT: process.env.MARKET_STORE_IT,
  } as any;
  if (envMap[mkt]) return envMap[mkt] as string;
  return `site-index-${mkt.toLowerCase()}`;
}

async function getStoreSafe(name: string): Promise<Store> {
  try {
    const mod: any = await import('@netlify/blobs').catch(() => null);
    if (!mod || !mod.getStore) return null;
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    let store: any = null;
    if (siteID && token) {
      try { store = mod.getStore({ name, siteID, token, consistency: 'strong' }); }
      catch { store = null; }
    }
    if (!store) {
      try { store = mod.getStore({ name, consistency: 'strong' }); } catch { store = null; }
    }
    return store as Store;
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const refNum = (req.query as any).refNum;
  try { res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive'); } catch { }
  if (!refNum || Array.isArray(refNum)) { res.status(400).json({ error: 'invalid refNum' }); return; }
  const storeName = process.env.SHARED_STORE_NAME || 'site-index-shared';
  const candidateKeys = [`items/${encodeURIComponent(String(refNum))}.json`];
  let authMode: 'explicit' | 'implicit' | 'none' = 'none';
  let attemptedKey: string | null = null;
  let detailObj: Detail | null = null;

  try {
    const mod: any = await import('@netlify/blobs').catch(() => null);
    if (mod && mod.getStore) {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
      let store: any = null;
      if (siteID && token) {
        try { store = mod.getStore({ name: storeName, siteID, token, consistency: 'strong' }); authMode = 'explicit'; }
        catch (e: any) { console.warn('[detail-api] explicit getStore failed', e?.message); }
      }
      if (!store) {
        try { store = mod.getStore({ name: storeName, consistency: 'strong' }); authMode = authMode === 'explicit' ? 'explicit' : 'implicit'; }
        catch (e: any) { console.warn('[detail-api] implicit getStore failed', e?.message); store = null; }
      }
      res.setHeader('X-Crawler-Detail-Auth', authMode);
      if (store) {
        for (const key of candidateKeys) {
          try {
            attemptedKey = key;
            const raw = await store.get(key);
            if (raw) {
              try { detailObj = JSON.parse(raw); } catch { detailObj = null; }
              if (detailObj) {
                console.log('[detail-api] blob hit', key, 'auth=' + authMode, 'bytes=' + raw.length);
                break;
              }
            }
          } catch { }
        }
      }

      if (detailObj) {
        const mkt = normalizeMarket((req.query as any).mkt);
        try {
          const marketName = marketStoreName(mkt);
          const siteID2 = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
          const token2 = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
          let marketStore: any = null;
          if (siteID2 && token2 && mod.getStore) {
            try { marketStore = mod.getStore({ name: marketName, siteID: siteID2, token: token2, consistency: 'strong' }); }
            catch (e: any) { console.warn('[detail-api] explicit market getStore failed', e?.message); }
          }
          if (!marketStore && mod.getStore) {
            try { marketStore = mod.getStore({ name: marketName, consistency: 'strong' }); }
            catch (e: any) { console.warn('[detail-api] implicit market getStore failed', e?.message); }
          }
          try { res.setHeader('X-Crawler-Ship-Mkt', mkt); } catch { }
          try { res.setHeader('X-Crawler-Ship-Store', marketName); } catch { }

          const candidateShipKeys: string[] = [];
          candidateShipKeys.push(`market-shipping/${encodeURIComponent(String(refNum))}.json`);
          const possibleId = (detailObj && (detailObj.id || detailObj.ref || detailObj.refNum));
          if (possibleId && possibleId !== refNum) {
            candidateShipKeys.push(`market-shipping/${encodeURIComponent(String(possibleId))}.json`);
          }

          let merged = false;
          if (marketStore) {
            for (const shipKey of candidateShipKeys) {
              let shipRaw: any = null;
              try { shipRaw = await marketStore.get(shipKey); } catch { }
              if (!shipRaw) continue;
              try {
                const ship = JSON.parse(shipRaw);
                if (ship && Array.isArray(ship.options)) {
                  // Use translated shipping options if available (non-GB), fall back to English
                  const shippingOptions = (ship.translations?.shippingOptions && Array.isArray(ship.translations.shippingOptions))
                    ? ship.translations.shippingOptions
                    : ship.options;
                  (detailObj as any).shipping = { ...((detailObj as any).shipping || {}), options: shippingOptions };
                  // Also keep original English labels for reference/toggle
                  (detailObj as any).shippingOptionsEn = ship.options;
                  merged = true;
                  try { res.setHeader('X-Crawler-Ship-Key', shipKey); } catch { }

                  // Extract translated description from shipping blob (non-GB markets only)
                  if (ship.translations?.description) {
                    (detailObj as any).descriptionTranslated = ship.translations.description;
                  }

                  break;
                }
              } catch { }
            }
          }
          if (!merged) {
            try { res.setHeader('X-Crawler-Ship-Attempted', candidateShipKeys.join(',')); } catch { }
          }
        } catch { }
      }

      if (detailObj) {
        const body = JSON.stringify(detailObj);
        const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 32) + '"';
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
        res.setHeader('ETag', etag);
        res.setHeader('X-Crawler-Storage', 'blob');
        if ((req.headers['if-none-match'] as any) === etag) { res.status(304).end(); return; }
        res.status(200).send(body);
        return;
      }
    }
  } catch { }
  console.warn('[detail-api] miss ref=' + refNum, 'auth=' + authMode, attemptedKey ? 'attempted=' + attemptedKey : '');
  res.setHeader('X-Crawler-Storage', 'miss');
  res.status(404).json({ error: 'not_found' });
}
