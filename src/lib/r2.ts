/**
 * R2 client — public reads for the BiggyIndex frontend.
 *
 * Two buckets:
 *   1. biggyindex-data-v2 — item JSON, aggregates, configs, seller detail
 *   2. biggyindex-images  — optimized AVIF/WebP item images
 *
 * Frontend only needs public URL reads (no S3 credentials).
 * Fetch-level caching is disabled (cache: 'no-store') because callers
 * use page-level `'use cache'` + `cacheLife()` — avoids Next.js
 * fetch data cache's 2 MB entry limit.
 *
 * Pattern from: food-aggregator-example/lib/r2.ts
 */

import { R2_DATA_PUBLIC_URL, R2_IMAGES_PUBLIC_URL } from "./constants";

/**
 * Normalize a configured public bucket URL — accepts bare hostnames
 * (`cdn.biggyindex.com`) or full URLs (`https://cdn.biggyindex.com`)
 * and always returns an absolute https URL with no trailing slash.
 * Mirrors the helper in lib/images.ts so both code paths agree.
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
 * Read JSON from the R2 data bucket (public, no credentials).
 */
export async function readR2JSON<T = unknown>(key: string): Promise<T | null> {
  if (!DATA_BASE) {
    console.warn("[r2] NEXT_PUBLIC_R2_DATA_URL not set");
    return null;
  }

  const url = `${DATA_BASE}/${key}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
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
