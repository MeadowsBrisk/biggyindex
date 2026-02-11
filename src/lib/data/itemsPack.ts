import { decode } from '@msgpack/msgpack';
import type { Market } from '@/lib/market/market';

// In-memory cache for SPA navigations / re-renders within the same session
let cachedItems: any[] | null = null;
let cachedVersion: string | null = null;
let cachedMarket: string | null = null;
let cachedAt: number = 0;

// Deduplication: if a fetch is already in-flight for the same market+version,
// reuse the same promise instead of firing another network request.
// This prevents the 3-5 duplicate /api/items-pack calls per page load caused
// by multiple useEffects mounting simultaneously.
let inflightPromise: Promise<any[]> | null = null;
let inflightKey: string | null = null;

// Max age for in-memory cache: 20 minutes.
// If a user keeps the tab open longer, the next render will refetch from the API.
// This prevents long-lived tabs from showing stale data indefinitely.
const IN_MEMORY_MAX_AGE_MS = 20 * 60 * 1000;

/**
 * Fetch items as MessagePack binary and decode to Item[].
 *
 * Uses version param for cache-busting so the browser disk cache
 * serves repeat visits instantly (until ISR revalidates with a new version).
 *
 * Deduplicates concurrent calls — multiple useEffects calling this simultaneously
 * share a single network request instead of each firing their own.
 *
 * Falls back to JSON API if MessagePack fetch fails.
 */
export async function fetchItemsPack(market: Market, version?: string): Promise<any[]> {
  const v = version || 'latest';
  const now = Date.now();
  const cacheKey = `${market}:${v}`;

  // Return in-memory cache if same market + version AND not stale
  if (
    cachedItems &&
    cachedVersion === v &&
    cachedMarket === market &&
    (now - cachedAt) < IN_MEMORY_MAX_AGE_MS
  ) {
    return cachedItems;
  }

  // Deduplicate: if an identical request is already in-flight, piggyback on it
  if (inflightPromise && inflightKey === cacheKey) {
    return inflightPromise;
  }

  // Create the actual fetch promise and store it for deduplication
  const fetchPromise = _doFetch(market, v);
  inflightPromise = fetchPromise;
  inflightKey = cacheKey;

  try {
    const items = await fetchPromise;
    return items;
  } finally {
    // Clear in-flight state once resolved (success or failure)
    if (inflightKey === cacheKey) {
      inflightPromise = null;
      inflightKey = null;
    }
  }
}

/** Internal: actual fetch + decode logic (called once per unique request) */
async function _doFetch(market: Market, v: string): Promise<any[]> {

  try {
    const url = `/api/items-pack?mkt=${market}&v=${v}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`items-pack responded ${res.status}`);
    }

    const buffer = await res.arrayBuffer();
    const items = decode(new Uint8Array(buffer)) as any[];

    // Cache for this session
    cachedItems = items;
    cachedVersion = v;
    cachedMarket = market;
    cachedAt = Date.now();

    return items;
  } catch (err) {
    console.warn('[itemsPack] MessagePack fetch failed, falling back to JSON API:', err);

    // Fallback: fetch from existing JSON API endpoint
    const fallbackRes = await fetch(`/api/index/items?mkt=${market}`);
    if (!fallbackRes.ok) throw new Error(`JSON fallback also failed: ${fallbackRes.status}`);
    const data = await fallbackRes.json();
    const items = data?.items || [];

    // Cache the fallback result too
    cachedItems = items;
    cachedVersion = v;
    cachedMarket = market;
    cachedAt = Date.now();

    return items;
  }
}
