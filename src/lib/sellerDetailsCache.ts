// Simple in-memory seller detail cache keyed by sellerId (number or string)

const cache: Map<string, { data?: any; promise?: Promise<any>; error?: any }> = new Map(); // id -> { data?, promise?, error? }

export function getCachedSellerDetail(id: string | number | null | undefined) {
  const key = String(id || '');
  return cache.get(key)?.data || null;
}

export function loadSellerDetail(id: string | number) {
  const key = String(id || '');
  if (!key) return Promise.resolve(null);
  const existing = cache.get(key);
  if (existing) {
    if (existing.data) return Promise.resolve(existing.data);
    if (existing.promise) return existing.promise;
  }
  const enc = encodeURIComponent(String(id));
  const isDev = typeof process !== 'undefined' && (process as any).env && (process as any).env.NODE_ENV !== 'production';
  const buildApiUrl = (preferLocal = false) => {
    const params = new URLSearchParams();
    if (preferLocal) params.set('local', '1');
    return `/api/crawler/seller/${enc}?${params.toString()}`;
  };
  const attemptApi = (preferLocal = false) => fetch(buildApiUrl(preferLocal), { cache: 'no-store' });
  const attemptFs = () => fetch(`/seller-crawler/sellers/${enc}.json`, { cache: 'no-store' });
  const preferredLoad = () => attemptApi().then(r => {
    if (r.ok) return r.json();
    if (r.status === 404) return null;
    throw new Error(`seller detail api failed (${r.status})`);
  }).catch(() => null);

  const devFallback = async () => {
    if (!isDev) return null;
    const fsRes = await attemptFs().then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (fsRes) return fsRes;
    const apiLocal = await attemptApi(true).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (apiLocal) return apiLocal;
    return null;
  };

  const fsFallback = () => attemptFs().then(r => {
    if (r.ok) return r.json();
    if (r.status === 404) return { sellerId: id, notFound: true };
    throw new Error(`seller detail fs failed (${r.status})`);
  });

  const p = preferredLoad()
    .then(res => res || devFallback())
    .then(res => (res ? res : fsFallback()))
    .then(json => {
      cache.set(key, { data: json });
      return json;
    })
    .catch(err => { cache.set(key, { error: err }); throw err; });
  cache.set(key, { promise: p });
  return p;
}

export function prefetchSellerDetail(id: string | number) { try { return loadSellerDetail(id); } catch { return Promise.resolve(null); } }
export function clearSellerDetail(id: string | number) { cache.delete(String(id || '')); }
