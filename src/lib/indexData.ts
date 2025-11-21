// Blobs-only access: no filesystem fallbacks

// Market-aware Blobs access for unified crawler outputs.
// We support per-market stores: site-index-gb, site-index-de, site-index-fr (override via env).
// Default market is GB.

import type { Market } from '@/lib/market';

const DEFAULT_STORES: Record<Market, string> = {
  GB: (process as any).env.MARKET_STORE_GB || 'site-index-gb',
  DE: (process as any).env.MARKET_STORE_DE || 'site-index-de',
  FR: (process as any).env.MARKET_STORE_FR || 'site-index-fr',
  PT: (process as any).env.MARKET_STORE_PT || 'site-index-pt',
  IT: (process as any).env.MARKET_STORE_IT || 'site-index-it',
};

const SHARED_STORE: string = (process as any).env.SHARED_STORE_NAME || 'site-index-shared';

function normalizeMarket(mkt?: string | Market): Market {
  const s = String(mkt || 'GB').toUpperCase();
  return (s === 'GB' || s === 'DE' || s === 'FR' || s === 'PT' || s === 'IT') ? (s as Market) : 'GB';
}

function storeNameForMarket(mkt?: string | Market): string {
  const M = normalizeMarket(mkt);
  if ((DEFAULT_STORES as any)[M]) return (DEFAULT_STORES as any)[M];
  return `site-index-${String(M).toLowerCase()}`;
}

// Centralized access to index data (items, manifest, category chunks, sellers, seen) via Netlify Blobs only.
// All functions return plain JS objects/arrays (never throw) to simplify API routes.

type StoreClient = {
  get: (key: string) => Promise<string | null>;
};

const storeCache = new Map<string, StoreClient | null>();

// Simple in-memory cache for small, frequently accessed blobs to reduce network calls on warm functions
const memoryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute cache for high-frequency metadata

async function getStoreForName(name?: string): Promise<StoreClient | null> {
  if (!name) return null;
  if (storeCache.has(name)) return storeCache.get(name) || null;
  try {
    const { getStore } = await import('@netlify/blobs');
    const siteID = (process as any).env.NETLIFY_SITE_ID || (process as any).env.SITE_ID || (process as any).env.BLOBS_SITE_ID;
    const token = (process as any).env.NETLIFY_BLOBS_TOKEN || (process as any).env.NETLIFY_API_TOKEN || (process as any).env.NETLIFY_AUTH_TOKEN || (process as any).env.BLOBS_TOKEN;
    let store: StoreClient | null = null;
    if (siteID && token) {
      try { store = getStore({ name, siteID, token, consistency: 'strong' }) as unknown as StoreClient; } catch {}
    }
    if (!store) {
      try { store = getStore({ name, consistency: 'strong' }) as unknown as StoreClient; } catch {}
    }
    storeCache.set(name, store);
    return store;
  } catch {
    return null;
  }
}

async function readBlobJSON<T = any>(key: string, { market, store, useCache = false }: { market?: Market; store?: string; useCache?: boolean } = {}): Promise<T | null> {
  const storeName = store || storeNameForMarket(market);
  
  // Check memory cache if enabled
  if (useCache) {
    const cacheKey = `${storeName}:${key}`;
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data as T;
    }
  }

  const storeClient = await getStoreForName(storeName);
  if (!storeClient) return null;
  try {
    const value = await storeClient.get(key);
    if (!value) return null;
    const data = JSON.parse(value) as T;
    
    // Write to memory cache if enabled
    if (useCache) {
      const cacheKey = `${storeName}:${key}`;
      memoryCache.set(cacheKey, { data, timestamp: Date.now() });
    }
    
    return data;
  } catch {
    return null;
  }
}

async function readAggregateJSON<T = any>(primaryKey: string, fallbackKey?: string, { market, store, useCache = false }: { market?: Market; store?: string; useCache?: boolean } = {}): Promise<T | null> {
  const primary = await readBlobJSON<T>(primaryKey, { market, store, useCache });
  if (primary != null) return primary;
  if (!fallbackKey) return null;
  return readBlobJSON<T>(fallbackKey, { market, store, useCache });
}

export async function getManifest(market?: Market): Promise<{ categories: Record<string, any>; totalItems: number; [k: string]: any }>
{
  return (await readBlobJSON('data/manifest.json', { market, useCache: true })) || { categories: {}, totalItems: 0 };
}

export async function getAllItems(market?: Market): Promise<any[]>
{
  const blob = await readBlobJSON<any[]>('indexed_items.json', { market });
  if (blob) return blob;
  return [];
}

export async function getSellers(market?: Market): Promise<any[]>
{
  const blob = await readBlobJSON<any[]>('sellers.json', { market });
  if (blob) return blob;
  return [];
}

export async function getCategoryItems(categoryName: string, market?: Market): Promise<any[]>
{
  if (!categoryName) return [];
  const key = `data/items-${categoryName.toLowerCase()}.json`;
  const blob = await readBlobJSON<any[]>(key, { market });
  if (blob) return blob;
  return [];
}

export async function getSeenMap(market?: Market): Promise<Record<string, any>>
{
  return (await readBlobJSON<Record<string, any>>('seen.json', { market })) || {};
}

export async function getItemIdSet(): Promise<Set<string | number>>
{
  const items = await getAllItems();
  return new Set(items.map((i: any) => i && (i.id as any)).filter(Boolean));
}

export async function getSnapshotMeta(market?: Market): Promise<any | null>
{
  const blob = await readBlobJSON<any>('snapshot_meta.json', { market, useCache: true });
  if (blob) return blob;
  return null;
}

export async function getRecentReviews(market?: Market): Promise<any[]>
{
  const blob = await readAggregateJSON<any[]>('aggregates/recent-reviews.json', 'analytics/recent-reviews.json', { market });
  if (blob) return blob;
  return [];
}

export async function getRecentMedia(market?: Market): Promise<any[]>
{
  const blob = await readAggregateJSON<any[]>('aggregates/recent-media.json', 'analytics/recent-media.json', { market });
  if (blob) return blob;
  return [];
}

export async function getSellersLeaderboard(market?: Market): Promise<any | null>
{
  const blob = await readAggregateJSON<any>('aggregates/sellers-leaderboard.json', 'analytics/sellers-leaderboard.json', { market });
  if (blob) return blob;
  return null;
}

export async function getSellerImages(): Promise<Record<string, any>>
{
  const blob = await readAggregateJSON<Record<string, any>>('seller-images.json', 'analytics/seller-images.json', { store: SHARED_STORE });
  if (blob) return blob;
  return {};
}

export async function getSellerAnalytics(market?: Market): Promise<{ sellers: any[]; totalSellers: number; dataVersion: number; [k: string]: any }>
{
  const blob = await readAggregateJSON<{ sellers: any[]; totalSellers: number; dataVersion: number }>('aggregates/seller-analytics.json', 'analytics/seller-analytics.json', { market });
  if (blob) return blob;
  return { sellers: [], totalSellers: 0, dataVersion: 1 };
}

export async function getRecentItemsCompact(market?: Market): Promise<{ added: any[]; updated: any[] }>
{
  const blob = await readBlobJSON<{ added: any[]; updated: any[] }>('data/recent-items.json', { market });
  if (blob) return blob;
  return { added: [], updated: [] };
}

export async function getItemImageLookup(market?: Market): Promise<{ byRef: Record<string, any>; byId: Record<string, any> }>
{
  const blob = await readBlobJSON<{ byRef: Record<string, any>; byId: Record<string, any> }>('data/item-image-lookup.json', { market });
  if (blob) return blob;
  return { byRef: {}, byId: {} };
}
