import { getStore } from '@netlify/blobs';

export type Market = 'GB' | 'DE' | 'FR' | 'PT' | 'IT';

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
      try { store = getStore({ name: storeName, siteID, token, consistency: 'strong' }); } catch {}
    }
    if (!store) {
      try { store = getStore({ name: storeName, consistency: 'strong' }); } catch {}
    }

    if (store) {
      for (const key of candidateKeys) {
        try {
          const raw = await store.get(key);
          if (raw) {
            try { detailObj = JSON.parse(raw); } catch { detailObj = null; }
            if (detailObj) break;
          }
        } catch {}
      }
    }

    if (detailObj) {
      const mkt = normalizeMarket(market);
      try {
        const marketName = marketStoreName(mkt);
        let marketStore: any = null;
        if (siteID && token) {
          try { marketStore = getStore({ name: marketName, siteID, token, consistency: 'strong' }); } catch {}
        }
        if (!marketStore) {
          try { marketStore = getStore({ name: marketName, consistency: 'strong' }); } catch {}
        }

        const candidateShipKeys: string[] = [];
        candidateShipKeys.push(`market-shipping/${encodeURIComponent(String(refNum))}.json`);
        const possibleId = (detailObj && (detailObj.id || detailObj.ref || detailObj.refNum));
        if (possibleId && possibleId !== refNum) {
          candidateShipKeys.push(`market-shipping/${encodeURIComponent(String(possibleId))}.json`);
        }

        if (marketStore) {
          for (const shipKey of candidateShipKeys) {
            let shipRaw: any = null;
            try { shipRaw = await marketStore.get(shipKey); } catch {}
            if (!shipRaw) continue;
            try {
              const ship = JSON.parse(shipRaw);
              if (ship && Array.isArray(ship.options)) {
                detailObj.shipping = { ...(detailObj.shipping || {}), options: ship.options };
                break;
              }
            } catch {}
          }
        }
      } catch {}
    }
    
    return detailObj;
  } catch (e) {
    console.error('fetchItemDetail error:', e);
    return null;
  }
}
