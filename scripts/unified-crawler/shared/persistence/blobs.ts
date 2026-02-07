// @netlify/blobs wrapper with optional FS fallback (stub)
export interface BlobClient {
  getJSON<T>(key: string): Promise<T | null>;
  putJSON<T>(key: string, value: T): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  del(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// R2 dual-write shadow (active when R2_DUAL_WRITE=true or CRAWLER_PERSIST=both)
// ---------------------------------------------------------------------------

function shouldDualWrite(): boolean {
  return (
    process.env.R2_DUAL_WRITE === 'true' ||
    process.env.R2_DUAL_WRITE === '1' ||
    process.env.CRAWLER_PERSIST === 'both'
  );
}

/** Lazily loaded R2 store factory — avoids import cost when dual-write is off */
let _r2Shadow: ((storeName: string) => { putJSON: (key: string, data: unknown) => Promise<void>; del: (key: string) => Promise<void> }) | null = null;

async function r2ShadowWrite(storeName: string, key: string, value: any): Promise<void> {
  if (!shouldDualWrite()) return;
  try {
    if (!_r2Shadow) {
      const mod = await import('./store');
      _r2Shadow = (sn: string) => {
        const store = mod.createR2Store(
          process.env.R2_DATA_BUCKET || 'biggyindex-data',
          scopeToR2Prefix(sn),
        );
        return { putJSON: (k, d) => store.putJSON(k, d), del: (k) => store.delete(k) };
      };
    }
    await _r2Shadow(storeName).putJSON(key, value);
  } catch (e: any) {
    console.warn(`[dual-write] R2 write failed (non-blocking): store=${storeName} key=${key} — ${(e?.message || '').slice(0, 120)}`);
  }
}

async function r2ShadowDelete(storeName: string, key: string): Promise<void> {
  if (!shouldDualWrite()) return;
  try {
    if (!_r2Shadow) {
      const mod = await import('./store');
      _r2Shadow = (sn: string) => {
        const store = mod.createR2Store(
          process.env.R2_DATA_BUCKET || 'biggyindex-data',
          scopeToR2Prefix(sn),
        );
        return { putJSON: (k, d) => store.putJSON(k, d), del: (k) => store.delete(k) };
      };
    }
    await _r2Shadow(storeName).del(key);
  } catch (e: any) {
    console.warn(`[dual-write] R2 delete failed (non-blocking): store=${storeName} key=${key} — ${(e?.message || '').slice(0, 120)}`);
  }
}

/** Map Netlify Blob store names to R2 key prefixes */
function scopeToR2Prefix(storeName: string): string {
  const mktMatch = storeName.match(/^site-index-(gb|de|fr|pt|it|es)$/i);
  if (mktMatch) return `markets/${mktMatch[1].toLowerCase()}`;
  if (storeName === 'site-index-shared') return 'shared';
  return storeName;
}

export function getBlobClient(storeName: string): BlobClient {
  const persistMode = process.env.CRAWLER_PERSIST || "auto";

  // ---------------------------------------------------------------------------
  // R2-only mode: route all reads/writes through DataStore (store.ts)
  // ---------------------------------------------------------------------------
  if (persistMode === 'r2') {
    // Lazy-import to avoid top-level S3Client cost when not needed
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
  // "both" mode: read from Blobs (trusted), write to Blobs + R2
  // (Falls through to Blobs path below — shouldDualWrite() handles R2 shadow)
  // ---------------------------------------------------------------------------

  // Only treat NETLIFY=true as running inside Netlify (Functions/Build). Having a SITE_ID locally doesn't mean Blobs implicit auth exists.
  const isNetlify = !!process.env.NETLIFY;
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  // Accept multiple token envs (align with legacy blobStore):
  // - NETLIFY_BLOBS_TOKEN (preferred)
  // - NETLIFY_API_TOKEN (commonly used in this repo)
  // - NETLIFY_AUTH_TOKEN (alt)
  // - BLOBS_TOKEN (fallback)
  const token = process.env.NETLIFY_BLOBS_TOKEN
    || process.env.NETLIFY_API_TOKEN
    || process.env.NETLIFY_AUTH_TOKEN
    || process.env.BLOBS_TOKEN;
  const hasBlobsCreds = Boolean(siteID && token);
  // On Netlify Functions, @netlify/blobs works without explicit tokens; prefer it to avoid read-only FS writes.
  const useBlobs =
    persistMode === "blobs" || persistMode === "both"
      ? (isNetlify || hasBlobsCreds)
      : (persistMode === "auto" ? isNetlify || hasBlobsCreds : false);

  if (useBlobs) {
    // Lazily import Netlify Blobs to avoid bundling issues in non-functions envs.
    // Memoize the store so concurrent calls reuse a single client instance.
    let storePromise: Promise<any> | null = null;
    const getStore = async () => {
      if (storePromise) return storePromise;
      storePromise = (async () => {
        const mod = await import("@netlify/blobs");
        // @ts-ignore - runtime API
        const opts: any = { name: storeName };
        // IMPORTANT: When running inside Netlify, prefer implicit auth.
        // Only pass explicit credentials outside Netlify (e.g., local CLI/CI).
        if (!isNetlify && siteID && token) {
          opts.siteID = siteID;
          opts.token = token;
        }
        const store = await (mod as any).getStore(opts);
        if (process.env.DEBUG_BLOBS === "verbose") {
          // eslint-disable-next-line no-console
          console.info(`[blobs] init store name=${storeName} mode=${isNetlify ? 'implicit' : (siteID && token ? 'explicit' : 'implicit')}`);
        }
        return store;
      })();
      return storePromise;
    };
    return {
      async getJSON<T>(key: string): Promise<T | null> {
        const maxAttempts = Number(process.env.BLOBS_RETRY_ATTEMPTS || 5);
        const baseDelay = Number(process.env.BLOBS_RETRY_BASE_MS || 150);
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const store = await getStore();
            // @ts-ignore
            const str = await store.get(key);
            if (!str) return null;
            try {
              return JSON.parse(String(str)) as T;
            } catch {
              console.warn(`[blobs] corrupt JSON for key=${key} in store=${storeName} (${String(str).slice(0, 100)}...)`);
              return null;
            }
          } catch (e: any) {
            const msg = e?.message || String(e || '');
            const status = (e && typeof e.status === 'number') ? (e.status as number) : (msg.match(/\b(\d{3})\b/) ? Number(msg.match(/\b(\d{3})\b/)![1]) : 0);
            const retriable = status === 0 || status === 401 || status === 408 || status === 425 || status === 429 || (status >= 500 && status < 600);
            if (retriable && attempt < maxAttempts) {
              if (status === 401) {
                // Recreate store once in case creds/implicit context changed
                storePromise = null;
              }
              const delay = Math.min(2000, baseDelay * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 50);
              if (process.env.DEBUG_BLOBS === "1") {
                // eslint-disable-next-line no-console
                console.warn(`[blobs] get retry ${attempt}/${maxAttempts} key=${key} status=${status} wait=${delay}ms`);
              }
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            // Non-retriable or exhausted retries — log before returning null
            console.warn(`[blobs] getJSON failed for key=${key} store=${storeName} after ${attempt} attempts: ${msg.slice(0, 150)}`);
            return null; // non-retriable or exhausted
          }
        }
        return null;
      },
      async putJSON<T>(key: string, value: T): Promise<void> {
        const body = JSON.stringify(value);
        const maxAttempts = Number(process.env.BLOBS_RETRY_ATTEMPTS || 5);
        const baseDelay = Number(process.env.BLOBS_RETRY_BASE_MS || 150);
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const store = await getStore();
            // @ts-ignore
            await store.set(key, body, { contentType: "application/json" });
            // Shadow-write to R2 if dual-write is enabled
            await r2ShadowWrite(storeName, key, value);
            return;
          } catch (e: any) {
            const msg = e?.message || String(e || '');
            const status = (e && typeof e.status === 'number') ? (e.status as number) : (msg.match(/\b(\d{3})\b/) ? Number(msg.match(/\b(\d{3})\b/)![1]) : 0);
            const retriable = status === 0 || status === 401 || status === 408 || status === 425 || status === 429 || (status >= 500 && status < 600);
            if (retriable && attempt < maxAttempts) {
              if (status === 401) {
                // Outside Netlify, try switching from explicit to implicit once.
                if (!isNetlify && siteID && token) {
                  storePromise = null;
                } else {
                  // Inside Netlify or no explicit creds: still recreate the store
                  storePromise = null;
                }
              }
              const delay = Math.min(4000, baseDelay * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 100);
              if (process.env.DEBUG_BLOBS === "1") {
                // eslint-disable-next-line no-console
                console.warn(`[blobs] set retry ${attempt}/${maxAttempts} key=${key} status=${status} wait=${delay}ms`);
              }
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            throw e;
          }
        }
      },
      async list(prefix?: string): Promise<string[]> {
        const maxAttempts = 3;
        const baseDelay = 200;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const store = await getStore();
            // @ts-ignore
            const res = await store.list({ prefix });
            // @ts-ignore
            const blobs = Array.isArray(res?.blobs) ? res.blobs : [];
            return blobs.map((b: any) => b.key).filter(Boolean);
          } catch (e: any) {
            if (attempt < maxAttempts) {
              const delay = baseDelay * Math.pow(2, attempt - 1);
              console.warn(`[blobs] list retry ${attempt}/${maxAttempts} prefix=${prefix || '*'} err=${(e?.message || '').slice(0, 100)}`);
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            console.warn(`[blobs] list failed after ${maxAttempts} attempts prefix=${prefix || '*'}: ${(e?.message || '').slice(0, 150)}`);
            return [];
          }
        }
        return [];
      },
      async del(key: string): Promise<void> {
        const maxAttempts = 3;
        const baseDelay = 200;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const store = await getStore();
            // @ts-ignore
            await store.delete(key);
            // Shadow-delete from R2 if dual-write is enabled
            await r2ShadowDelete(storeName, key);
            return;
          } catch (e: any) {
            if (attempt < maxAttempts) {
              const delay = baseDelay * Math.pow(2, attempt - 1);
              console.warn(`[blobs] del retry ${attempt}/${maxAttempts} key=${key} err=${(e?.message || '').slice(0, 100)}`);
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            console.warn(`[blobs] del failed after ${maxAttempts} attempts key=${key}: ${(e?.message || '').slice(0, 150)}`);
          }
        }
      },
    };
  }

  // FS fallback (dev): store under public/_blobs/<storeName>/<key>
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
