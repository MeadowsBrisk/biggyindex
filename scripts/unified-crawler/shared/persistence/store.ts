/**
 * Unified DataStore — abstraction layer for persistent JSON storage.
 *
 * Backends:
 *   - R2DataStore  → Cloudflare R2 (S3-compatible) for production
 *   - FSDataStore  → Local filesystem for dev
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

  /** Write raw binary data. Throws on errors. */
  putRaw(key: string, data: Buffer | Uint8Array, contentType?: string): Promise<void>;

  /** Delete a key. No-op if key doesn't exist. Throws on real errors. */
  delete(key: string): Promise<void>;

  /** List keys with optional prefix. */
  list(prefix?: string): Promise<string[]>;

  /** Atomic read-modify-write. */
  updateJSON<T>(key: string, updater: (existing: T | null) => T): Promise<T>;

  /** Backend identifier for logging */
  readonly backend: 'r2' | 'fs';
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

    async putRaw(key: string, data: Buffer | Uint8Array, contentType = 'application/octet-stream'): Promise<void> {
      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: fullKey(key),
        Body: data,
        ContentType: contentType,
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

    async putRaw(key: string, data: Buffer | Uint8Array): Promise<void> {
      const file = path.join(rootDir, key);
      ensureDir(path.dirname(file));
      fs.writeFileSync(file, data);
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
// Factory
// ---------------------------------------------------------------------------

const R2_DATA_BUCKET_DEFAULT = 'biggyindex-data';

/**
 * Scope-to-R2-prefix mapping.
 * Store names → R2 key prefixes within the single data bucket.
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
 *   - CRAWLER_PERSIST=r2 (default) → R2
 *   - CRAWLER_PERSIST=fs           → Local filesystem (dev)
 */
export function createStore(scope: string): DataStore {
  const mode = process.env.CRAWLER_PERSIST || 'r2';
  const bucket = process.env.R2_DATA_BUCKET || R2_DATA_BUCKET_DEFAULT;

  if (mode === 'fs') {
    const path = require('path') as typeof import('path');
    return createFSStore(path.join(process.cwd(), 'public', '_blobs', scope));
  }

  // Default: R2
  return createR2Store(bucket, scopeToR2Prefix(scope));
}
