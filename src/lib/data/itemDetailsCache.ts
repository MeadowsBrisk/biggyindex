// Simple in-memory detail cache keyed by refNum + market (to avoid cross-market leakage)
// Entry shape: { data?, promise?, error? }

const cache: Map<string, { data?: any; promise?: Promise<any>; error?: any }> = new Map(); // key(refNum,mkt) -> entry
const listeners: Set<(refNum: string | number) => void> = new Set(); // functions(refNum)

function notify(refNum: string | number) {
  for (const l of listeners) {
    try { l(refNum); } catch (_) { /* ignore */ }
  }
}

import { getMarketFromPath } from '@/lib/market/market';

function currentMarket(): string {
  try { return getMarketFromPath(typeof window !== 'undefined' ? window.location.pathname : '/'); } catch { return 'GB'; }
}

function keyFor(refNum: string | number, mkt: string = currentMarket()) {
  return `${String(refNum)}::${mkt}`;
}

export function getCachedDetail(refNum: string | number) {
  const k = keyFor(refNum);
  return cache.get(k)?.data || null;
}

export function loadItemDetail(refNum: string | number) {
  if (!refNum) return Promise.resolve(null);
  const mkt = currentMarket();
  const k = keyFor(refNum, mkt);
  const existing = cache.get(k);
  if (existing) {
    if (existing.data) return Promise.resolve(existing.data);
    if (existing.promise) return existing.promise;
  }
  const enc = encodeURIComponent(String(refNum));
  const attemptApi = () => fetch(`/api/crawler/item/${enc}?mkt=${encodeURIComponent(mkt)}`, { cache: 'no-store' });
  const p = attemptApi()
    .then(r => {
      if (r.ok) return r.json().then(j=>({ j, storage: r.headers.get('X-Crawler-Storage') || 'api' }));
      if (r.status === 404) return { j: { refNum, notFound: true }, storage: 'miss' } as any;
      throw new Error(`detail api failed (${r.status})`);
    })
    .catch((err) => { throw err; })
    .then(res => {
      const json = res ? (res as any).j : { refNum, notFound:true };
      try {
        if (json && typeof json === 'object' && (json as any).refNum == null) {
          (json as any).refNum = refNum;
        }
      } catch {}
      cache.set(k, { data: json });
      notify(refNum);
      return json;
    })
    .catch(err => {
      cache.set(k, { error: err });
      notify(refNum);
      throw err;
    });
  cache.set(k, { promise: p });
  return p;
}

export function clearItemDetail(refNum: string | number) {
  // Clear current-market entry
  cache.delete(keyFor(refNum));
  notify(refNum);
}

// Fire-and-forget prefetch (used on hover/focus) so overlay can appear instantly with cached data soon after.
export function prefetchItemDetail(refNum: string | number) {
  try { return loadItemDetail(refNum); } catch (_) { return Promise.resolve(null); }
}

// Helpers to inspect availability
export function getDetailEntry(refNum: string | number) { return cache.get(keyFor(refNum)) || null; }
export function isDetailNotFound(refNum: string | number) {
  const e = cache.get(keyFor(refNum));
  return !!(e && e.data && (e.data as any).notFound);
}
export function isDetailAvailable(refNum: string | number) {
  const e = cache.get(keyFor(refNum));
  return !!(e && e.data && !(e.data as any).notFound);
}

// Lightweight subscription so UI can react to availability becoming known without full detail hook
export function subscribeItemDetail(listener: (refNum: string | number) => void) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
