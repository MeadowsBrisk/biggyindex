// GIF asset mapping loader + React hook
// Provides poster/video lookup for original GIF URLs.
// Mapping file shape (per entry): { hash, poster, video, width, height, frames, status, reason }

let _cache = null;            // resolved mapping object
let _pending = null;          // in-flight promise
let _subscribers = new Set(); // listeners to notify on first load

async function fetchMap() {
  try {
    const res = await fetch('/gif-cache/gif-map.json', { cache: 'no-store' });
    if (!res.ok) return {};
    const json = await res.json();
    return (json && typeof json === 'object') ? json : {};
  } catch {
    return {};
  }
}

export function loadGifMap() {
  if (_cache) return Promise.resolve(_cache);
  if (_pending) return _pending;
  _pending = fetchMap().then(m => {
    _cache = m;
    _pending = null;
    for (const fn of _subscribers) {
      try { fn(); } catch {}
    }
    _subscribers.clear();
    return _cache;
  });
  return _pending;
}

function normalizeAssetPath(p){
  if(!p || typeof p !== 'string') return p;
  if (p.startsWith('/public/')) return p.slice('/public'.length) || '/';
  if (p.startsWith('public/')) return p.slice('public'.length) || '/';
  return p;
}

export function getGifEntry(url) {
  if (!_cache || !url) return null;
  const entry = _cache[url] || null;
  if (entry) {
    if (entry.poster) entry.poster = normalizeAssetPath(entry.poster);
    if (entry.video) entry.video = normalizeAssetPath(entry.video);
  }
  return entry;
}

export async function refreshGifMap() {
  _cache = null; _pending = null; return loadGifMap();
}

function onLoaded(cb) {
  if (_cache) { cb(); return () => {}; }
  _subscribers.add(cb);
  return () => _subscribers.delete(cb);
}

// React hook
import { useEffect, useState, useRef } from 'react';
import { proxyImage } from '@/lib/images';

function buildPosterProxy(posterPath) {
  if (!posterPath) return null;
  if (typeof window === 'undefined') return posterPath; // SSR returns raw path
  try {
    const abs = posterPath.startsWith('http') ? posterPath : new URL(posterPath, window.location.origin).href;
    return proxyImage(abs); // leverage main CDN proxy (skips gifs/png, proxies jpg/webp)
  } catch {
    return posterPath;
  }
}

export function useGifAsset(originalUrl) {
  const [state, setState] = useState(() => ({ loading: true, entry: null }));
  const urlRef = useRef(originalUrl);
  if (urlRef.current !== originalUrl) {
    urlRef.current = originalUrl;
  }
  useEffect(() => {
    let mounted = true;
    if (!_cache) {
      loadGifMap();
      const unsub = onLoaded(() => {
        if (!mounted) return;
        setState({ loading: false, entry: getGifEntry(urlRef.current) });
      });
      return () => { mounted = false; unsub(); };
    } else {
      setState({ loading: false, entry: getGifEntry(urlRef.current) });
    }
    return () => { mounted = false; };
  }, [originalUrl]);

  const entry = state.entry;
  const poster = entry?.poster ? normalizeAssetPath(entry.poster) : null;
  const video = entry?.video ? normalizeAssetPath(entry.video) : null;
  // Derive proxied poster: internal proxy preferred; fall back to external generic proxy for remote GIF host if mapping missing.
  const posterProxied = poster ? buildPosterProxy(poster) : (originalUrl ? proxyImage(originalUrl) : null);
  return {
    loading: state.loading,
    hasEntry: !!entry,
    poster,
    posterProxied,
    video,
    status: entry?.status || (entry ? 'ok' : null),
    reason: entry?.reason,
  };
}
