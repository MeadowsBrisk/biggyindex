/**
 * R2 sync helper for Netlify Functions.
 *
 * Provides fire-and-forget R2 writes so Netlify Functions (which use
 * @netlify/blobs directly) can also keep R2 in sync during migration.
 *
 * Usage:
 *   import { syncToR2 } from '../lib/r2Sync';
 *   await store.setJSON(key, data);
 *   await syncToR2('site-index-shared', key, data);
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('[r2Sync] Missing R2 credentials');
  }
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

const BUCKET = process.env.R2_DATA_BUCKET || 'biggyindex-data';

/** Map Netlify Blob store names to R2 key prefixes */
function scopeToR2Prefix(storeName: string): string {
  const mktMatch = storeName.match(/^site-index-(gb|de|fr|pt|it|es)$/i);
  if (mktMatch) return `markets/${mktMatch[1].toLowerCase()}`;
  if (storeName === 'site-index-shared') return 'shared';
  return storeName;
}

function fullKey(storeName: string, key: string): string {
  return `${scopeToR2Prefix(storeName)}/${key}`;
}

/**
 * Write JSON to R2. Non-blocking — logs warning on failure, never throws.
 */
export async function syncToR2(storeName: string, key: string, data: unknown): Promise<void> {
  try {
    await getClient().send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: fullKey(storeName, key),
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    }));
  } catch (e: any) {
    console.warn(`[r2Sync] Write failed (non-blocking): ${storeName}/${key} — ${(e?.message || '').slice(0, 120)}`);
  }
}

/**
 * Delete a key from R2. Non-blocking — logs warning on failure, never throws.
 */
export async function deleteFromR2(storeName: string, key: string): Promise<void> {
  try {
    await getClient().send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: fullKey(storeName, key),
    }));
  } catch (e: any) {
    console.warn(`[r2Sync] Delete failed (non-blocking): ${storeName}/${key} — ${(e?.message || '').slice(0, 120)}`);
  }
}
