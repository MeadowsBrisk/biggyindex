/**
 * R2 access helper for Netlify Functions.
 *
 * Provides read/write/delete operations for Netlify Functions that
 * need to access data in R2 directly.
 *
 * Usage:
 *   import { readFromR2, writeToR2 } from '../lib/r2Sync';
 *   const data = await readFromR2('site-index-shared', 'category-overrides.json');
 *   await writeToR2('site-index-shared', 'category-overrides.json', data);
 */

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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
 * Read JSON from R2. Returns null for missing keys.
 */
export async function readFromR2<T = any>(storeName: string, key: string): Promise<T | null> {
  try {
    const res = await getClient().send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: fullKey(storeName, key),
    }));
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as T;
  } catch (e: any) {
    if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

/**
 * Write JSON to R2.
 */
export async function writeToR2(storeName: string, key: string, data: unknown): Promise<void> {
  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: fullKey(storeName, key),
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }));
}

/**
 * Delete a key from R2.
 */
export async function deleteFromR2(storeName: string, key: string): Promise<void> {
  try {
    await getClient().send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: fullKey(storeName, key),
    }));
  } catch (e: any) {
    if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return;
    throw e;
  }
}

// Legacy aliases for backwards compat (used in category-dash-overrides)
export const syncToR2 = writeToR2;
