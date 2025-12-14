// Simple in-memory detail cache keyed by refNum + market (to avoid cross-market leakage)
// Entry shape: { data?, promise?, error?, indexLua? }
// Smart invalidation: Cache is invalidated when the index's lua (lastUpdatedAt) is newer than the cached lua

const cache: Map<string, { data?: any; promise?: Promise<any>; error?: any; indexLua?: string }> = new Map();
const listeners: Set<(refNum: string | number) => void> = new Set();

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

/**
 * Check if cached entry is stale based on index lua comparison.
 * Returns true if we should refetch (no cache, or index has been updated since we cached).
 */
function isStale(entry: { indexLua?: string } | undefined, currentIndexLua?: string): boolean {
  if (!entry) return true;
  // If no indexLua provided, use cached data (no way to know if it's stale)
  if (!currentIndexLua) return false;
  // If we don't have a cached lua, be safe and refetch
  if (!entry.indexLua) return true;
  // Compare: if current index lua is newer, cache is stale
  try {
    return new Date(currentIndexLua) > new Date(entry.indexLua);
  } catch {
    // If dates can't be parsed, compare as strings
    return currentIndexLua !== entry.indexLua;
  }
}

export function getCachedDetail(refNum: string | number, indexLua?: string) {
  const k = keyFor(refNum);
  const entry = cache.get(k);
  if (!entry || isStale(entry, indexLua)) return null;
  return entry.data || null;
}

/**
 * Load item detail with smart cache invalidation based on index lua.
 * @param refNum - The item reference number
 * @param indexLua - Optional. The item's lastUpdatedAt from the index. If provided and newer than cached, refetches.
 */
export function loadItemDetail(refNum: string | number, indexLua?: string) {
  if (!refNum) return Promise.resolve(null);
  const mkt = currentMarket();
  const k = keyFor(refNum, mkt);
  const existing = cache.get(k);

  // Check if we have valid cached data that isn't stale
  if (existing && !isStale(existing, indexLua)) {
    if (existing.data) return Promise.resolve(existing.data);
    if (existing.promise) return existing.promise;
  }

  const enc = encodeURIComponent(String(refNum));
  const attemptApi = () => fetch(`/api/crawler/item/${enc}?mkt=${encodeURIComponent(mkt)}`, { cache: 'no-store' });
  const p = attemptApi()
    .then(r => {
      if (r.ok) return r.json().then(j => ({ j, storage: r.headers.get('X-Crawler-Storage') || 'api' }));
      if (r.status === 404) return { j: { refNum, notFound: true }, storage: 'miss' } as any;
      throw new Error(`detail api failed (${r.status})`);
    })
    .catch((err) => { throw err; })
    .then(res => {
      const json = res ? (res as any).j : { refNum, notFound: true };
      try {
        if (json && typeof json === 'object' && (json as any).refNum == null) {
          (json as any).refNum = refNum;
        }
      } catch { }
      // Store with the index lua that triggered this fetch (so we know when to invalidate)
      cache.set(k, { data: json, indexLua: indexLua || existing?.indexLua });
      notify(refNum);
      return json;
    })
    .catch(err => {
      cache.set(k, { error: err, indexLua: indexLua || existing?.indexLua });
      notify(refNum);
      throw err;
    });
  cache.set(k, { promise: p, indexLua: indexLua || existing?.indexLua });
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
  if (typeof listener !== 'function') return () => { };
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
