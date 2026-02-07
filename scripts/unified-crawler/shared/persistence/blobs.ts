// Persistence layer: R2 primary, FS fallback for local dev
export interface BlobClient {
  getJSON<T>(key: string): Promise<T | null>;
  putJSON<T>(key: string, value: T): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  del(key: string): Promise<void>;
}

/** Map Netlify Blob store names to R2 key prefixes */
function scopeToR2Prefix(storeName: string): string {
  const mktMatch = storeName.match(/^site-index-(gb|de|fr|pt|it|es)$/i);
  if (mktMatch) return `markets/${mktMatch[1].toLowerCase()}`;
  if (storeName === 'site-index-shared') return 'shared';
  return storeName;
}

export function getBlobClient(storeName: string): BlobClient {
  const persistMode = process.env.CRAWLER_PERSIST || 'r2';

  // ---------------------------------------------------------------------------
  // R2 mode (default): route all reads/writes through DataStore (store.ts)
  // ---------------------------------------------------------------------------
  if (persistMode === 'r2' || persistMode === 'auto') {
    let _store: import('./store').DataStore | null = null;
    const getStore = () => {
      if (_store) return _store;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('./store') as typeof import('./store');
      _store = mod.createR2Store(
        process.env.R2_DATA_BUCKET || 'biggyindex-data',
        scopeToR2Prefix(storeName),
      );
      return _store;
    };
    return {
      async getJSON<T>(key: string): Promise<T | null> { return getStore().getJSON<T>(key); },
      async putJSON<T>(key: string, value: T): Promise<void> { return getStore().putJSON(key, value); },
      async list(prefix?: string): Promise<string[]> { return getStore().list(prefix); },
      async del(key: string): Promise<void> { return getStore().delete(key); },
    };
  }

  // ---------------------------------------------------------------------------
  // FS fallback (dev): store under public/_blobs/<storeName>/<key>
  // ---------------------------------------------------------------------------
  const fs = require("fs");
  const path = require("path");
  const root = path.join(process.cwd(), "public", "_blobs", storeName);

  function ensureDir(dir: string) {
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch {}
  }

  return {
    async getJSON<T>(key: string): Promise<T | null> {
      const file = path.join(root, key);
      try {
        const buf = fs.readFileSync(file, "utf8");
        return JSON.parse(buf) as T;
      } catch {
        return null;
      }
    },
    async putJSON<T>(key: string, value: T): Promise<void> {
      const file = path.join(root, key);
      ensureDir(path.dirname(file));
      fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
      if (process.env.DEBUG_BLOBS_FS === "1") {
        // eslint-disable-next-line no-console
        console.info(`[blobs:fs] wrote ${file}`);
      }
    },
    async list(prefix?: string): Promise<string[]> {
      const results: string[] = [];
      const walk = (dir: string, rel = "") => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          const r = path.join(rel, e.name);
          if (e.isDirectory()) walk(p, r);
          else results.push(r.replace(/\\/g, "/"));
        }
      };
      walk(root);
      return prefix ? results.filter((k) => k.startsWith(prefix)) : results;
    },
    async del(key: string): Promise<void> {
      const file = path.join(root, key);
      try { fs.unlinkSync(file); } catch {}
    },
  };
}
