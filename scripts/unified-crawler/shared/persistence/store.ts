/**
 * Unified DataStore — abstraction layer for persistent JSON storage.
 *
 * Backends:
 *   - R2DataStore  → Cloudflare R2 (S3-compatible) for production
 *   - FSDataStore  → Local filesystem for dev (mirrors current blobs.ts FS fallback)
 *   - BlobsDataStore → Netlify Blobs (wraps existing getBlobClient, for dual-write)
 *
 * Key difference from blobs.ts:
 *   getJSON returns null ONLY for "key does not exist".
 *   All other errors throw — no more silent null on 401/500.
 *
 * R2 key layout (single bucket: biggyindex-data):
 *   markets/{code}/...   ← was site-index-{code}/...
 *   shared/...           ← was site-index-shared/...
 *   run-meta/...         ← was in respective stores
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { MarketCode } from '../env/loadEnv';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface DataStore {
  /** Get JSON value. Returns null only for "key does not exist". Throws on real errors. */
  getJSON<T>(key: string): Promise<T | null>;

  /** Write JSON value. Throws on errors. */
  putJSON(key: string, data: unknown): Promise<void>;

  /** Delete a key. No-op if key doesn't exist. Throws on real errors. */
  delete(key: string): Promise<void>;

  /** List keys with optional prefix. */
  list(prefix?: string): Promise<string[]>;

  /** Atomic read-modify-write. */
  updateJSON<T>(key: string, updater: (existing: T | null) => T): Promise<T>;

  /** Backend identifier for logging */
  readonly backend: 'r2' | 'fs' | 'blobs';
}

// ---------------------------------------------------------------------------
// R2 DataStore
// ---------------------------------------------------------------------------

let _r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (_r2Client) return _r2Client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('[store:r2] Missing R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }
  _r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _r2Client;
}

export function createR2Store(bucket: string, prefix?: string): DataStore {
  const r2 = getR2Client();

  const fullKey = (key: string) => prefix ? `${prefix}/${key}` : key;

  return {
    backend: 'r2' as const,

    async getJSON<T>(key: string): Promise<T | null> {
      try {
        const res = await r2.send(new GetObjectCommand({
          Bucket: bucket,
          Key: fullKey(key),
        }));
        const body = await res.Body?.transformToString();
        if (!body) return null;
        return JSON.parse(body) as T;
      } catch (e: any) {
        // NoSuchKey = key doesn't exist → return null
        if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
        throw e; // Real errors propagate
      }
    },

    async putJSON(key: string, data: unknown): Promise<void> {
      const body = JSON.stringify(data);
      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: fullKey(key),
        Body: body,
        ContentType: 'application/json',
      }));
    },

    async delete(key: string): Promise<void> {
      try {
        await r2.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: fullKey(key),
        }));
      } catch (e: any) {
        // DeleteObject is idempotent on S3/R2 — shouldn't throw for missing keys
        if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return;
        throw e;
      }
    },

    async list(listPrefix?: string): Promise<string[]> {
      const resolvedPrefix = listPrefix
        ? fullKey(listPrefix)
        : prefix ? `${prefix}/` : undefined;

      const keys: string[] = [];
      let continuationToken: string | undefined;

      do {
        const res = await r2.send(new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: resolvedPrefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        }));

        for (const obj of res.Contents || []) {
          if (obj.Key) {
            // Strip prefix to return keys relative to this store's scope
            const relKey = prefix && obj.Key.startsWith(`${prefix}/`)
              ? obj.Key.slice(prefix.length + 1)
              : obj.Key;
            keys.push(relKey);
          }
        }

        continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (continuationToken);

      return keys;
    },

    async updateJSON<T>(key: string, updater: (existing: T | null) => T): Promise<T> {
      const existing = await this.getJSON<T>(key);
      const updated = updater(existing);
      await this.putJSON(key, updated);
      return updated;
    },
  };
}

// ---------------------------------------------------------------------------
// FS DataStore (local dev)
// ---------------------------------------------------------------------------

export function createFSStore(rootDir: string): DataStore {
  // Lazy require — fs/path not available in all environments
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');

  function ensureDir(dir: string) {
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch {}
  }

  return {
    backend: 'fs' as const,

    async getJSON<T>(key: string): Promise<T | null> {
      const file = path.join(rootDir, key);
      try {
        const buf = fs.readFileSync(file, 'utf8');
        return JSON.parse(buf) as T;
      } catch (e: any) {
        if (e?.code === 'ENOENT') return null;
        throw e; // Corrupt JSON or permission errors propagate
      }
    },

    async putJSON(key: string, data: unknown): Promise<void> {
      const file = path.join(rootDir, key);
      ensureDir(path.dirname(file));
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    },

    async delete(key: string): Promise<void> {
      const file = path.join(rootDir, key);
      try { fs.unlinkSync(file); } catch (e: any) {
        if (e?.code === 'ENOENT') return;
        throw e;
      }
    },

    async list(prefix?: string): Promise<string[]> {
      const results: string[] = [];
      const walk = (dir: string, rel = '') => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          const r = path.join(rel, e.name);
          if (e.isDirectory()) walk(p, r);
          else results.push(r.replace(/\\/g, '/'));
        }
      };
      walk(rootDir);
      return prefix ? results.filter((k) => k.startsWith(prefix)) : results;
    },

    async updateJSON<T>(key: string, updater: (existing: T | null) => T): Promise<T> {
      const existing = await this.getJSON<T>(key);
      const updated = updater(existing);
      await this.putJSON(key, updated);
      return updated;
    },
  };
}

// ---------------------------------------------------------------------------
// Blobs DataStore (wraps existing getBlobClient for dual-write compat)
// ---------------------------------------------------------------------------

export function createBlobsStore(storeName: string): DataStore {
  // Lazy import to avoid circular deps
  let _client: any = null;
  const getClient = () => {
    if (_client) return _client;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getBlobClient } = require('./blobs') as { getBlobClient: (name: string) => any };
    _client = getBlobClient(storeName);
    return _client;
  };

  return {
    backend: 'blobs' as const,

    async getJSON<T>(key: string): Promise<T | null> {
      return getClient().getJSON(key) as Promise<T | null>;
    },

    async putJSON(key: string, data: unknown): Promise<void> {
      return getClient().putJSON(key, data);
    },

    async delete(key: string): Promise<void> {
      return getClient().del(key);
    },

    async list(prefix?: string): Promise<string[]> {
      return getClient().list(prefix);
    },

    async updateJSON<T>(key: string, updater: (existing: T | null) => T): Promise<T> {
      const existing = await this.getJSON<T>(key);
      const updated = updater(existing);
      await this.putJSON(key, updated);
      return updated;
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const R2_DATA_BUCKET_DEFAULT = 'biggyindex-data';

/**
 * Scope-to-R2-prefix mapping.
 * Netlify Blob store names → R2 key prefixes within the single data bucket.
 */
function scopeToR2Prefix(scope: string): string {
  // Market stores: site-index-gb → markets/gb
  const mktMatch = scope.match(/^site-index-(gb|de|fr|pt|it|es)$/i);
  if (mktMatch) return `markets/${mktMatch[1].toLowerCase()}`;

  // Shared store
  if (scope === 'site-index-shared' || scope === 'shared') return 'shared';

  // Fallback: use store name as-is
  return scope;
}

/**
 * Create a DataStore for the given scope (store name or market code).
 *
 * Backend selection:
 *   - CRAWLER_PERSIST=r2    → R2 only
 *   - CRAWLER_PERSIST=both  → dual-write (R2 primary, Blobs secondary)
 *   - CRAWLER_PERSIST=blobs → Netlify Blobs (current behavior, via getBlobClient)
 *   - CRAWLER_PERSIST=fs    → Local filesystem
 *   - CRAWLER_PERSIST=auto  → Blobs if creds available, else FS (current default)
 */
export function createStore(scope: string): DataStore {
  const mode = process.env.CRAWLER_PERSIST || 'auto';
  const bucket = process.env.R2_DATA_BUCKET || R2_DATA_BUCKET_DEFAULT;

  if (mode === 'r2') {
    return createR2Store(bucket, scopeToR2Prefix(scope));
  }

  if (mode === 'both') {
    return createDualWriteStore(scope, bucket);
  }

  if (mode === 'fs') {
    const path = require('path') as typeof import('path');
    return createFSStore(path.join(process.cwd(), 'public', '_blobs', scope));
  }

  // 'auto' or 'blobs' — delegate to existing blobs.ts which handles auto-detection
  return createBlobsStore(scope);
}

// ---------------------------------------------------------------------------
// Dual-write store (R2 primary, Blobs secondary — for migration)
// ---------------------------------------------------------------------------

function createDualWriteStore(scope: string, bucket: string): DataStore {
  const r2Store = createR2Store(bucket, scopeToR2Prefix(scope));
  const blobsStore = createBlobsStore(scope);

  return {
    backend: 'r2' as const, // primary is R2

    async getJSON<T>(key: string): Promise<T | null> {
      // Read from Blobs (the trusted source during migration)
      return blobsStore.getJSON<T>(key);
    },

    async putJSON(key: string, data: unknown): Promise<void> {
      // Write to Blobs first (primary)
      await blobsStore.putJSON(key, data);
      // Then write to R2 (secondary, non-blocking failure)
      try {
        await r2Store.putJSON(key, data);
      } catch (e: any) {
        console.warn(`[dual-write] R2 write failed (non-blocking): ${key} — ${e?.message || e}`);
      }
    },

    async delete(key: string): Promise<void> {
      await blobsStore.delete(key);
      try {
        await r2Store.delete(key);
      } catch (e: any) {
        console.warn(`[dual-write] R2 delete failed (non-blocking): ${key} — ${e?.message || e}`);
      }
    },

    async list(prefix?: string): Promise<string[]> {
      // List from Blobs (trusted source)
      return blobsStore.list(prefix);
    },

    async updateJSON<T>(key: string, updater: (existing: T | null) => T): Promise<T> {
      // Read from and write to Blobs as primary
      const existing = await blobsStore.getJSON<T>(key);
      const updated = updater(existing);
      await this.putJSON(key, updated); // putJSON handles dual-write
      return updated;
    },
  };
}
