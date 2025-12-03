// Generic detail cache factory
// Creates type-safe in-memory caches with consistent prefetch, load, subscribe patterns

export interface CacheEntry<T> {
  data?: T;
  promise?: Promise<T | null>;
  error?: Error;
}

export interface DetailCache<T> {
  get: (id: string) => T | null;
  load: (id: string) => Promise<T | null>;
  prefetch: (id: string) => Promise<T | null>;
  clear: (id: string) => void;
  subscribe: (listener: (id: string) => void) => () => void;
  getEntry: (id: string) => CacheEntry<T> | null;
}

export interface CreateDetailCacheOptions<T> {
  /** Function to fetch data by ID. Should throw on error, return null for not-found. */
  fetcher: (id: string) => Promise<T | null>;
  /** Optional key transformer (e.g., add market suffix) */
  keyFn?: (id: string) => string;
}

export function createDetailCache<T>(options: CreateDetailCacheOptions<T>): DetailCache<T> {
  const { fetcher, keyFn = (id) => id } = options;
  
  const cache = new Map<string, CacheEntry<T>>();
  const listeners = new Set<(id: string) => void>();

  function notify(id: string) {
    for (const l of listeners) {
      try { l(id); } catch { /* ignore */ }
    }
  }

  function get(id: string): T | null {
    const key = keyFn(id);
    return cache.get(key)?.data ?? null;
  }

  function getEntry(id: string): CacheEntry<T> | null {
    const key = keyFn(id);
    return cache.get(key) ?? null;
  }

  function load(id: string): Promise<T | null> {
    if (!id) return Promise.resolve(null);
    const key = keyFn(id);
    const existing = cache.get(key);
    
    if (existing) {
      if (existing.data !== undefined) return Promise.resolve(existing.data);
      if (existing.promise) return existing.promise;
    }

    const promise = fetcher(id)
      .then((data) => {
        cache.set(key, { data: data ?? undefined });
        notify(id);
        return data;
      })
      .catch((error) => {
        cache.set(key, { error });
        notify(id);
        throw error;
      });

    cache.set(key, { promise });
    return promise;
  }

  function prefetch(id: string): Promise<T | null> {
    try {
      return load(id);
    } catch {
      return Promise.resolve(null);
    }
  }

  function clear(id: string) {
    const key = keyFn(id);
    cache.delete(key);
    notify(id);
  }

  function subscribe(listener: (id: string) => void): () => void {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  return { get, load, prefetch, clear, subscribe, getEntry };
}
