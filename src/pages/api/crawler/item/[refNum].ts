import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { MARKETS, type Market } from '@/lib/market/market';
import { readR2JSON, buildR2Key } from '@/lib/data/r2Client';

export const config = { runtime: 'nodejs' };

type Detail = any; // keep broad, just pass-through JSON

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const refNum = (req.query as any).refNum;
  try { res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive'); } catch { }
  if (!refNum || Array.isArray(refNum)) { res.status(400).json({ error: 'invalid refNum' }); return; }

  const storeName = process.env.SHARED_STORE_NAME || 'site-index-shared';
  const key = `items/${encodeURIComponent(String(refNum))}.json`;
  const r2Key = buildR2Key(storeName, key);

  try {
    const detailObj: Detail = await readR2JSON<any>(r2Key);
    if (!detailObj) {
      res.setHeader('X-Crawler-Storage', 'miss');
      res.status(404).json({ error: 'not_found' });
      return;
    }

    // Merge market shipping
    const mkt = normalizeMarket((req.query as any).mkt);
    const marketName = marketStoreName(mkt);

    const candidateShipKeys: string[] = [];
    candidateShipKeys.push(`market-shipping/${encodeURIComponent(String(refNum))}.json`);
    const possibleId = detailObj.id || detailObj.ref || detailObj.refNum;
    if (possibleId && possibleId !== refNum) {
      candidateShipKeys.push(`market-shipping/${encodeURIComponent(String(possibleId))}.json`);
    }

    for (const shipKey of candidateShipKeys) {
      try {
        const ship = await readR2JSON<any>(buildR2Key(marketName, shipKey));
        if (ship && Array.isArray(ship.options)) {
          const shippingOptions = (ship.translations?.shippingOptions && Array.isArray(ship.translations.shippingOptions))
            ? ship.translations.shippingOptions
            : ship.options;
          detailObj.shipping = { ...(detailObj.shipping || {}), options: shippingOptions };
          detailObj.shippingOptionsEn = ship.options;
          if (ship.translations?.description) {
            detailObj.descriptionTranslated = ship.translations.description;
          }
          // Apply variant translations from shipping blob to .v entries
          if (ship.translations?.v && Array.isArray(ship.translations.v) && Array.isArray(detailObj.v)) {
            const translatedMap = new Map<string, string>();
            for (const tv of ship.translations.v) {
              if (tv.vid && tv.d) translatedMap.set(String(tv.vid), tv.d);
            }
            for (const vItem of detailObj.v) {
              const vid = String(vItem.vid ?? vItem.id);
              const translated = translatedMap.get(vid);
              if (translated) {
                vItem.dEn = vItem.dEn || vItem.d;
                vItem.d = translated;
              }
            }
          }
          detailObj._shipSeo = {
            n: ship.n, sn: ship.sn, sid: ship.sid,
            i: ship.i, is: ship.is, c: ship.c, sc: ship.sc,
          };
          break;
        }
      } catch {}
    }

    const body = JSON.stringify(detailObj);
    const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 32) + '"';
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    res.setHeader('ETag', etag);
    res.setHeader('X-Crawler-Storage', 'r2');
    if ((req.headers['if-none-match'] as any) === etag) { res.status(304).end(); return; }
    res.status(200).send(body);
  } catch (e: any) {
    console.error('[detail-api] Error:', e?.message);
    res.setHeader('X-Crawler-Storage', 'error');
    res.status(500).json({ error: 'internal_error' });
  }
}
