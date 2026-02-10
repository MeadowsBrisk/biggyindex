// R2-only data access — reads from Cloudflare R2 via S3 SDK.

// Market-aware data access for unified crawler outputs.
// We support per-market R2 prefixes: site-index-gb, site-index-de, site-index-fr (override via env).
// Default market is GB.

import { MARKETS, type Market } from '@/lib/market/market';
import { readR2JSON, buildR2Key } from '@/lib/data/r2Client';

/**
 * Per-market R2 store prefixes, auto-derived from MARKETS.
 * Override via env: MARKET_STORE_GB, MARKET_STORE_DE, etc.
 */
const DEFAULT_STORES: Record<Market, string> = Object.fromEntries(
  MARKETS.map(m => [
    m,
    (process as any).env[`MARKET_STORE_${m}`] || `site-index-${m.toLowerCase()}`
  ])
) as Record<Market, string>;

const SHARED_STORE: string = (process as any).env.SHARED_STORE_NAME || 'site-index-shared';

function normalizeMarket(mkt?: string | Market): Market {
  const s = String(mkt || 'GB').toUpperCase();
  return MARKETS.includes(s as Market) ? (s as Market) : 'GB';
}

function storeNameForMarket(mkt?: string | Market): string {
  const M = normalizeMarket(mkt);
  if ((DEFAULT_STORES as any)[M]) return (DEFAULT_STORES as any)[M];
  return `site-index-${String(M).toLowerCase()}`;
}

// Centralized access to index data (items, manifest, category chunks, sellers, seen) via R2.
// All functions return plain JS objects/arrays (never throw) to simplify API routes.

// Simple in-memory cache for small, frequently accessed data to reduce network calls on warm functions
const memoryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minute cache — data changes at most every 30 min (crawler schedule)

async function readR2Data<T = any>(key: string, { market, store, useCache = false }: { market?: Market; store?: string; useCache?: boolean } = {}): Promise<T | null> {
  const storeName = store || storeNameForMarket(market);

  // Check memory cache if enabled
  if (useCache) {
    const cacheKey = `${storeName}:${key}`;
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data as T;
    }
  }

  try {
    const r2Key = buildR2Key(storeName, key);
    const data = await readR2JSON<T>(r2Key);
    if (data != null && useCache) {
      const cacheKey = `${storeName}:${key}`;
      memoryCache.set(cacheKey, { data, timestamp: Date.now() });
    }
    return data;
  } catch (e) {
    console.error(`[indexData] Error reading ${key} from ${storeName}:`, e);
    return null;
  }
}

async function readAggregateJSON<T = any>(primaryKey: string, fallbackKey?: string, { market, store, useCache = false }: { market?: Market; store?: string; useCache?: boolean } = {}): Promise<T | null> {
  const primary = await readR2Data<T>(primaryKey, { market, store, useCache });
  if (primary != null) return primary;
  if (!fallbackKey) return null;
  return readR2Data<T>(fallbackKey, { market, store, useCache });
}

export async function getManifest(market?: Market): Promise<{ categories: Record<string, any>; totalItems: number; [k: string]: any }>
{
  return (await readR2Data('data/manifest.json', { market, useCache: true })) || { categories: {}, totalItems: 0 };
}

export async function getAllItems(market?: Market): Promise<any[]>
{
  const result = await readR2Data<any[]>('indexed_items.json', { market, useCache: true });
  if (result) return result;
  return [];
}

export async function getSellers(market?: Market): Promise<any[]>
{
  const result = await readR2Data<any[]>('sellers.json', { market, useCache: true });
  if (result) return result;
  return [];
}

export async function getCategoryItems(categoryName: string, market?: Market): Promise<any[]>
{
  if (!categoryName) return [];
  const key = `data/items-${categoryName.toLowerCase()}.json`;
  const result = await readR2Data<any[]>(key, { market, useCache: true });
  if (result) return result;
  return [];
}

export async function getSeenMap(market?: Market): Promise<Record<string, any>>
{
  return (await readR2Data<Record<string, any>>('seen.json', { market })) || {};
}

export async function getItemIdSet(): Promise<Set<string | number>>
{
  const items = await getAllItems();
  return new Set(items.map((i: any) => i && (i.id as any)).filter(Boolean));
}

export async function getSnapshotMeta(market?: Market): Promise<any | null>
{
  const result = await readR2Data<any>('snapshot_meta.json', { market, useCache: true });
  if (result) return result;
  return null;
}

export async function getRecentReviews(market?: Market): Promise<any[]>
{
  const result = await readAggregateJSON<any[]>('aggregates/recent-reviews.json', 'analytics/recent-reviews.json', { market });
  if (result) return result;
  return [];
}

export async function getRecentMedia(market?: Market): Promise<any[]>
{
  const result = await readAggregateJSON<any[]>('aggregates/recent-media.json', 'analytics/recent-media.json', { market });
  if (result) return result;
  return [];
}

export async function getSellersLeaderboard(market?: Market): Promise<any | null>
{
  const result = await readAggregateJSON<any>('aggregates/sellers-leaderboard.json', 'analytics/sellers-leaderboard.json', { market });
  if (result) return result;
  return null;
}

export async function getSellerImages(): Promise<Record<string, any>>
{
  const result = await readAggregateJSON<Record<string, any>>('seller-images.json', 'analytics/seller-images.json', { store: SHARED_STORE });
  if (result) return result;
  return {};
}

export async function getSellerAnalytics(market?: Market): Promise<{ sellers: any[]; totalSellers: number; dataVersion: number; [k: string]: any }>
{
  const result = await readAggregateJSON<{ sellers: any[]; totalSellers: number; dataVersion: number }>('aggregates/seller-analytics.json', 'analytics/seller-analytics.json', { market });
  if (result) return result;
  return { sellers: [], totalSellers: 0, dataVersion: 1 };
}

export async function getRecentItemsCompact(market?: Market): Promise<{ added: any[]; updated: any[] }>
{
  const result = await readR2Data<{ added: any[]; updated: any[] }>('data/recent-items.json', { market });
  if (result) return result;
  return { added: [], updated: [] };
}

export async function getItemImageLookup(market?: Market): Promise<{ byRef: Record<string, any>; byId: Record<string, any> }>
{
  const result = await readR2Data<{ byRef: Record<string, any>; byId: Record<string, any> }>('data/item-image-lookup.json', { market });
  if (result) return result;
  return { byRef: {}, byId: {} };
}

// Pricing aggregates for price-per-gram sorting
export async function getPricingSummary(market?: Market): Promise<any | null>
{
  const result = await readR2Data<any>('aggregates/pricing/summary.json', { market, useCache: true });
  return result || null;
}

export async function getPricingByWeight(weight: number, market?: Market): Promise<any | null>
{
  const result = await readR2Data<any>(`aggregates/pricing/${weight}g.json`, { market, useCache: true });
  return result || null;
}
