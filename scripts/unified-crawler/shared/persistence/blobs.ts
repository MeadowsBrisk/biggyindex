// @netlify/blobs wrapper with optional FS fallback (stub)
export interface BlobClient {
  getJSON<T>(key: string): Promise<T | null>;
  putJSON<T>(key: string, value: T): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  del(key: string): Promise<void>;
}

export function getBlobClient(storeName: string): BlobClient {
  const persistMode = process.env.CRAWLER_PERSIST || "auto";
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
    persistMode === "blobs"
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
        if (process.env.DEBUG_BLOBS === "1") {
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
        const store = await getStore();
        // @ts-ignore
        const res = await store.list({ prefix });
        // @ts-ignore
        const blobs = Array.isArray(res?.blobs) ? res.blobs : [];
        return blobs.map((b: any) => b.key).filter(Boolean);
      },
      async del(key: string): Promise<void> {
        const store = await getStore();
        // @ts-ignore
        await store.delete(key);
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
