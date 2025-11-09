import { getMarketFromHost, getMarketFromPath, isHostBasedEnv } from '@/lib/market';
const API_ENDPOINT = '/api/index/sellers';
const STATIC_ENDPOINT = '/sellers.json';

// Maintain separate caches per market to avoid cross-market contamination when switching.
type MarketKey = string;
let sellersCacheByMarket: Map<MarketKey, { byName: Map<string, any>; byId: Map<string, any> }> = new Map();

let sellersByName: Map<string, any> | null = null; // active market view
let sellersById: Map<string, any> | null = null;   // active market view
let loadPromise: Promise<{ byName: Map<string, any>, byId: Map<string, any> }> | null = null;
let activeMarket: string | null = null; // tracked when explicitly loaded or auto-detected

const normaliseName = (name: string) => {
  if (typeof name !== 'string' || !name) return '';
  return name.trim().toLowerCase();
};

function buildIndexes(list: any[], market: string) {
  const byName = new Map<string, any>();
  const byId = new Map<string, any>();
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.name) byName.set(normaliseName(entry.name), entry);
      if (entry.id != null) byId.set(String(entry.id), entry);
    }
  }
  sellersByName = byName;
  sellersById = byId;
  activeMarket = market;
  sellersCacheByMarket.set(market.toUpperCase(), { byName, byId });
}

function autoDetectMarket(): string {
  try {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (isHostBasedEnv(host)) return getMarketFromHost(host);
      return getMarketFromPath(window.location.pathname);
    }
  } catch {}
  return '';
}

async function fetchSellersList(market?: string): Promise<any[]> {
  let list: any[] = [];
  const resolvedMarket = market || autoDetectMarket();
  const code = resolvedMarket ? String(resolvedMarket).toUpperCase() : '';
  const url = code ? `${API_ENDPOINT}?mkt=${encodeURIComponent(code)}` : API_ENDPOINT;
  try {
    const resApi = await fetch(url, { cache: 'no-store' });
    if (resApi && resApi.ok) {
      const json = await resApi.json();
      if (Array.isArray(json?.sellers)) list = json.sellers;
    }
  } catch {}
  if (!Array.isArray(list) || list.length === 0) {
    try {
      const resStatic = await fetch(STATIC_ENDPOINT, { cache: 'force-cache' });
      if (resStatic && resStatic.ok) {
        const json = await resStatic.json();
        if (Array.isArray(json)) list = json;
        else if (Array.isArray(json?.sellers)) list = json.sellers;
      }
    } catch {}
  }
  return list;
}

export async function loadSellersIndex(market?: string) {
  const resolvedMarket = market || autoDetectMarket();
  const code = resolvedMarket ? String(resolvedMarket).toUpperCase() : '';
  if (code && sellersCacheByMarket.has(code)) {
    const cached = sellersCacheByMarket.get(code)!;
    sellersByName = cached.byName;
    sellersById = cached.byId;
    activeMarket = code;
    return { byName: sellersByName, byId: sellersById } as any;
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      const list = await fetchSellersList(code);
      buildIndexes(list, code);
      return { byName: sellersByName!, byId: sellersById! };
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}

export function getCachedSellerByName(name: string, market?: string) {
  if (!sellersByName) return null;
  return sellersByName.get(normaliseName(name)) || null;
}

export function getCachedSellerById(id: string | number | null | undefined, market?: string) {
  if (!sellersById) return null;
  if (id == null) return null;
  return sellersById.get(String(id)) || null;
}

// // Fallback: attempt to locate a seller by name across multiple markets (lightweight sequential fetch)
// // markets param defaults to common set if not provided. Caches results per market once fetched.
// export async function findSellerAcrossMarkets(name: string, markets: string[] = ['GB','DE','FR','PT','IT']) {
//   const norm = normaliseName(name);
//   for (const m of markets) {
//     // If we already have cache for that market, check directly; otherwise load it.
//     if (!sellersCacheByMarket.has(m)) {
//       try { await loadSellersIndex(m); } catch {}
//     } else if (activeMarket !== m) {
//       // Activate cached market so getCachedSellerByName uses correct map
//       const cached = sellersCacheByMarket.get(m)!;
//       sellersByName = cached.byName; sellersById = cached.byId; activeMarket = m;
//     }
//     const hit = sellersByName ? sellersByName.get(norm) : null;
//     if (hit) return { seller: hit, market: m };
//   }
//   return { seller: null, market: null };
// }
