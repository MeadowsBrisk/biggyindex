/**
 * Authenticated R2 client for server-side writes (API routes that persist data,
 * e.g. nav events). Public frontend reads go through the fetch-based r2.ts —
 * this module is exclusively for S3-authenticated operations.
 *
 * Env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * Bucket:   biggyindex-data-v2
 */

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const BUCKET = "biggyindex-data-v2";

// ─── Singleton S3 client ────────────────────────────────────────

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "[r2-server] Missing R2 credentials — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY",
    );
  }

  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 2,
  });

  return _client;
}

// ─── Read (authenticated) ───────────────────────────────────────

/** Read JSON from R2 (authenticated). Returns null for missing keys. */
export async function readR2JSON<T = unknown>(key: string): Promise<T | null> {
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as T;
  } catch (e: unknown) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw e;
  }
}

// ─── Write (authenticated) ──────────────────────────────────────

/** Write JSON to R2 (authenticated). */
export async function writeR2JSON(key: string, data: unknown): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
    }),
  );
}

// ─── List (authenticated) ───────────────────────────────────────

/** List object keys by prefix. Handles pagination automatically. */
export async function listR2Keys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;

  do {
    const res = await getClient().send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );

    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }

    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return keys;
}

// ─── Delete (authenticated) ─────────────────────────────────────

/** Batch-delete R2 keys. Chunked to the S3 API's 1000-keys-per-call limit. */
export async function deleteR2Keys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await getClient().send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }
}
