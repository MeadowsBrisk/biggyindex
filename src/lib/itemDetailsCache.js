// Simple in-memory detail cache keyed by refNum
// Entry shape: { data?, promise?, error? }

const cache = new Map(); // refNum -> entry
const listeners = new Set(); // functions(refNum)

function notify(refNum) {
  for (const l of listeners) {
    try { l(refNum); } catch (_) { /* ignore */ }
  }
}

export function getCachedDetail(refNum) {
  return cache.get(refNum)?.data || null;
}

export function loadItemDetail(refNum) {
  if (!refNum) return Promise.resolve(null);
  const existing = cache.get(refNum);
  if (existing) {
    if (existing.data) return Promise.resolve(existing.data);
    if (existing.promise) return existing.promise;
  }
  const enc = encodeURIComponent(refNum);
  const attemptApi = () => fetch(`/api/crawler/item/${enc}`, { cache: 'no-store' });
  const attemptLegacy = () => fetch(`/item-crawler/items/${enc}.json`, { cache: 'no-store' });
  const p = attemptApi()
    .then(r => {
      if (r.ok) return r.json().then(j=>({ j, storage: r.headers.get('X-Crawler-Storage') || 'api' }));
      if (r.status === 404) return null; // fallback
      throw new Error(`detail api failed (${r.status})`);
    })
    .catch(()=>null)
    .then(apiRes => apiRes || attemptLegacy().then(r=>{
      if (r.ok) return r.json().then(j=>({ j, storage:'legacy' }));
      if (r.status === 404) return { j:{ refNum, notFound:true }, storage:'legacy-404' };
      throw new Error(`detail legacy failed (${r.status})`);
    }))
    .then(res => {
      const json = res ? res.j : { refNum, notFound:true };
      cache.set(refNum, { data: json });
      notify(refNum);
      return json;
    })
    .catch(err => {
      cache.set(refNum, { error: err });
      notify(refNum);
      throw err;
    });
  cache.set(refNum, { promise: p });
  return p;
}

export function clearItemDetail(refNum) {
  cache.delete(refNum);
  notify(refNum);
}

// Fire-and-forget prefetch (used on hover/focus) so overlay can appear instantly with cached data soon after.
export function prefetchItemDetail(refNum) {
  try { return loadItemDetail(refNum); } catch (_) { return Promise.resolve(null); }
}

// Helpers to inspect availability
export function getDetailEntry(refNum) { return cache.get(refNum) || null; }
export function isDetailNotFound(refNum) {
  const e = cache.get(refNum);
  return !!(e && e.data && e.data.notFound);
}
export function isDetailAvailable(refNum) {
  const e = cache.get(refNum);
  return !!(e && e.data && !e.data.notFound);
}

// Lightweight subscription so UI can react to availability becoming known without full detail hook
export function subscribeItemDetail(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
