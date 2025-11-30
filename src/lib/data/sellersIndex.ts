import { getMarketFromHost, getMarketFromPath, isHostBasedEnv, type Market } from '@/lib/market/market';

const API_ENDPOINT = '/api/index/sellers';
const STATIC_ENDPOINT = '/sellers.json';

// Maintain per-market caches so navigating between locales loads correct index
const sellersByName: Partial<Record<Market, Map<string, any>>> = {};
const sellersById: Partial<Record<Market, Map<string, any>>> = {};
const loadPromises: Partial<Record<Market, Promise<{ byName: Map<string, any>, byId: Map<string, any> }>>> = {};

const normaliseName = (name: string) => {
  if (typeof name !== 'string' || !name) return '';
  return name.trim().toLowerCase();
};

function buildIndexes(list: any[]): { byName: Map<string, any>, byId: Map<string, any> } {
  const byName = new Map<string, any>();
  const byId = new Map<string, any>();
  if (Array.isArray(list)) {
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const entry: any = raw;
      // Normalise potential variants coming from different data sources
      const nameValue = entry.name || entry.sellerName || entry.seller_name || null;
      const idValue = entry.id != null ? entry.id : (entry.sellerId != null ? entry.sellerId : null);
      if (nameValue) byName.set(normaliseName(String(nameValue)), entry);
      if (idValue != null) byId.set(String(idValue), entry);
    }
  }
  return { byName, byId };
}

function currentMarket(): Market {
  try {
    if (typeof window !== 'undefined') {
      const host = window.location?.hostname || '';
      if (isHostBasedEnv(host)) return getMarketFromHost(host) as Market;
      return getMarketFromPath(window.location?.pathname || '/') as Market;
    }
  } catch {}
  return 'GB';
}

async function fetchSellersList(market: Market): Promise<any[]> {
  let list: any[] = [];
  try {
    const resApi = await fetch(`${API_ENDPOINT}?mkt=${market}`, { cache: 'no-store' });
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

export async function loadSellersIndex() {
  const mkt = currentMarket();
  if (sellersByName[mkt] && sellersById[mkt]) {
    return { byName: sellersByName[mkt]!, byId: sellersById[mkt]! } as any;
  }
  if (!loadPromises[mkt]) {
    loadPromises[mkt] = (async () => {
      const list = await fetchSellersList(mkt);
      const built = buildIndexes(list);
      sellersByName[mkt] = built.byName;
      sellersById[mkt] = built.byId;
      return { byName: built.byName, byId: built.byId };
    })().catch((err) => {
      delete loadPromises[mkt];
      throw err;
    });
  }
  return loadPromises[mkt]!;
}

export function getCachedSellerByName(name: string) {
  const mkt = currentMarket();
  const map = sellersByName[mkt];
  if (!map) return null;
  return map.get(normaliseName(name)) || null;
}

export function getCachedSellerById(id: string | number | null | undefined) {
  const mkt = currentMarket();
  const map = sellersById[mkt];
  if (!map) return null;
  if (id == null) return null;
  return map.get(String(id)) || null;
}
