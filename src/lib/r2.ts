/**
 * R2 client — public reads for the BiggyIndex frontend.
 *
 * Two buckets:
 *   1. biggyindex-data-v2 — item JSON, aggregates, configs, seller detail
 *   2. biggyindex-images  — optimized AVIF/WebP item images
 *
 * Frontend only needs public URL reads (no S3 credentials).
 * Fetch-level caching is disabled (cache: 'no-store') because callers cache at
 * page level with `'use cache'` + `cacheLife()`; the fetch data cache would
 * reject these payloads anyway under its 2 MB per-entry limit.
 */

import { R2_DATA_PUBLIC_URL, R2_IMAGES_PUBLIC_URL } from "./constants";

/**
 * Normalize a configured public bucket URL — accepts bare hostnames
 * (`cdn.biggyindex.com`) or full URLs (`https://cdn.biggyindex.com`) and always
 * returns an absolute https URL with no trailing slash. Mirrors the helper in
 * lib/images.ts; keep the two in sync so both code paths build the same URL.
 */
function toAbsoluteBase(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

const DATA_BASE = R2_DATA_PUBLIC_URL ? toAbsoluteBase(R2_DATA_PUBLIC_URL) : "";
const IMAGES_BASE = R2_IMAGES_PUBLIC_URL
  ? toAbsoluteBase(R2_IMAGES_PUBLIC_URL)
  : "";

/**
 * A read that failed for any reason other than a 404. Distinct from `null` on
 * purpose: callers cache what they return, so a failure mapped to "missing"
 * would be stored as an empty catalogue or a not-found page for the whole
 * cache window. Let it escape any `'use cache'` scope.
 */
export class R2ReadError extends Error {
  /** HTTP status, when the request reached the bucket. */
  readonly status?: number;
  /** Object key that failed to read. */
  readonly key: string;

  constructor(key: string, status?: number, options?: { cause?: unknown }) {
    super(
      `[r2] read failed for ${key}${status ? ` (status ${status})` : " (network)"}`,
      options,
    );
    this.name = "R2ReadError";
    this.key = key;
    this.status = status;
  }
}

/** One retry, enough to ride out a single blip without stalling a render. */
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 250;

/** A JSON read together with the object metadata some callers need. */
export interface R2JSONWithMeta<T> {
  /** Parsed body, or null when the object is absent (404). */
  data: T | null;
  /**
   * `Last-Modified` as epoch ms, or null when the bucket sent no usable value.
   *
   * Useful as a data-derived "as of" clock: it changes only when the object is
   * rewritten, so a `'use cache'` render can format relative ages against it
   * without becoming time-dependent (which `Date.now()` would make it).
   */
  lastModified: number | null;
}

/**
 * Read JSON from the R2 data bucket (public, no credentials), keeping the
 * response metadata.
 *
 * `data` is null ONLY for a 404 (the object genuinely isn't there). Every other
 * outcome throws `R2ReadError` after one retry — see that class for why.
 */
export async function readR2JSONWithMeta<T = unknown>(
  key: string,
): Promise<R2JSONWithMeta<T>> {
  if (!DATA_BASE) {
    console.warn("[r2] NEXT_PUBLIC_R2_DATA_URL not set");
    return { data: null, lastModified: null };
  }

  const url = `${DATA_BASE}/${key}`;

  for (let attempt = 0; ; attempt++) {
    let failure: R2ReadError;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 404) return { data: null, lastModified: null };
      if (res.ok) {
        const stamp = Date.parse(res.headers.get("last-modified") ?? "");
        return {
          data: (await res.json()) as T,
          lastModified: Number.isFinite(stamp) ? stamp : null,
        };
      }
      failure = new R2ReadError(key, res.status);
      // Only 5xx (and network failures below) are worth a retry; every other
      // status surfaces immediately rather than doubling the load.
      if (res.status < 500) throw failure;
    } catch (cause) {
      if (cause instanceof R2ReadError) throw cause;
      // Network failure, abort, or an unparseable body.
      failure = new R2ReadError(key, undefined, { cause });
    }
    if (attempt >= MAX_RETRIES) throw failure;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}

/**
 * Read JSON from the R2 data bucket (public, no credentials).
 *
 * Returns null ONLY for a 404 (the object genuinely isn't there). Every other
 * outcome throws `R2ReadError` after one retry — see that class for why.
 */
export async function readR2JSON<T = unknown>(key: string): Promise<T | null> {
  return (await readR2JSONWithMeta<T>(key)).data;
}

/**
 * Read raw bytes from the R2 data bucket (public).
 */
export async function readR2Raw(key: string): Promise<ArrayBuffer | null> {
  if (!DATA_BASE) return null;

  const url = `${DATA_BASE}/${key}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Build a public image URL from an item's image key.
 */
export function imageUrl(key: string): string {
  if (!IMAGES_BASE) return key;
  return `${IMAGES_BASE}/${key}`;
}

/**
 * R2 key helpers for common data paths.
 */
export const R2Keys = {
  /** Indexed items for a market */
  items: (market: string) => `markets/${market}/indexed_items.json`,

  /** Shipping aggregate for a market */
  shipping: (market: string) => `markets/${market}/aggregates/ship.json`,

  /** Index meta (fsa, lua, lur per item) */
  indexMeta: "shared/aggregates/index-meta.json",

  /** Image meta (per-item image hashes) */
  imageMeta: "shared/aggregates/image-meta.json",

  /** Share links */
  shares: "shared/aggregates/shares.json",

  /** Seller analytics */
  sellerAnalytics: "shared/seller-analytics.json",

  /** Public Little Biggy uptime status blob (written by the crawler) */
  status: "shared/status.json",

  /** Seller summaries per market */
  sellers: (market: string) => `markets/${market}/sellers.json`,

  /** Pre-built home feed (items + sellers + manifest) */
  homeFeed: (market: string) => `markets/${market}/home-feed.json`,

  /** Individual seller detail */
  sellerDetail: (id: string | number) => `shared/sellers/${id}.json`,

  /** Per-item shipping options */
  shippingDetail: (market: string, refNum: string) =>
    `markets/${market}/market-shipping/${refNum}.json`,

  /** Per-item merged detail (item-detail/{refNum}.json) */
  mergedDetail: (market: string, refNum: string) =>
    `markets/${market}/item-detail/${encodeURIComponent(refNum)}.json`,

  /** Per-item detail (shared/items/{refNum}.json) */
  itemDetail: (refNum: string) =>
    `shared/items/${encodeURIComponent(refNum)}.json`,
} as const;
