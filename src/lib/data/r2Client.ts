/**
 * R2 read client for the Next.js frontend.
 *
 * All index data, item details, and seller details are read from
 * Cloudflare R2 via the S3 SDK.
 *
 * Key layout matches the crawler's store.ts R2 layout:
 *   markets/{code}/...  ← market-specific data
 *   shared/...          ← shared item/seller data
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent as HttpsAgent } from 'node:https';

const DATA_BUCKET = process.env.R2_DATA_BUCKET || 'biggyindex-data';

let _client: S3Client | null = null;

function getR2Client(): S3Client {
  if (_client) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('[r2Client] Missing R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 2, // Fail fast — 1 retry instead of default 3
    requestHandler: new NodeHttpHandler({
      httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 25 }),
      connectionTimeout: 3000,
      socketTimeout: 10000,
    }),
  });
  return _client;
}

/**
 * Read JSON from R2. Returns null only for "key not found".
 * Real errors propagate (no silent null).
 */
export async function readR2JSON<T = any>(key: string): Promise<T | null> {
  try {
    const response = await getR2Client().send(new GetObjectCommand({
      Bucket: DATA_BUCKET,
      Key: key,
    }));
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as T;
  } catch (e: any) {
    if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
    throw e; // Real errors propagate
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Write JSON to R2. Overwrites existing key.
 */
export async function writeR2JSON(key: string, data: any): Promise<void> {
  await getR2Client().send(new PutObjectCommand({
    Bucket: DATA_BUCKET,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the R2 key for a given store prefix + key.
 * Mirrors the same mapping as the crawler's store.ts scopeToR2Prefix.
 */
export function buildR2Key(storeName: string, key: string): string {
  // Market stores: site-index-gb → markets/gb
  const mktMatch = storeName.match(/^site-index-(gb|de|fr|pt|it|es)$/i);
  if (mktMatch) return `markets/${mktMatch[1].toLowerCase()}/${key}`;

  // Shared store
  if (storeName === 'site-index-shared') return `shared/${key}`;

  // Fallback
  return `${storeName}/${key}`;
}
