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
    // Lazily import Netlify Blobs to avoid bundling issues in non-functions envs
    const getStore = async () => {
      const mod = await import("@netlify/blobs");
      // @ts-ignore - runtime API
      const opts: any = { name: storeName };
      // When running locally, explicitly pass creds if available
      if (siteID && token) {
        opts.siteID = siteID;
        opts.token = token;
      }
      return mod.getStore(opts);
    };
    return {
      async getJSON<T>(key: string): Promise<T | null> {
        const store = await getStore();
        // @ts-ignore
        const str = await store.get(key);
        if (!str) return null;
        try {
          return JSON.parse(String(str)) as T;
        } catch {
          return null;
        }
      },
      async putJSON<T>(key: string, value: T): Promise<void> {
        const store = await getStore();
        const body = JSON.stringify(value);
        // @ts-ignore
        await store.set(key, body, { contentType: "application/json" });
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
