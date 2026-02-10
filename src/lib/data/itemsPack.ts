import { decode } from '@msgpack/msgpack';
import type { Market } from '@/lib/market/market';

// In-memory cache for SPA navigations / re-renders within the same session
let cachedItems: any[] | null = null;
let cachedVersion: string | null = null;
let cachedMarket: string | null = null;

/**
 * Fetch items as MessagePack binary and decode to Item[].
 *
 * Uses version param for cache-busting so the browser disk cache
 * serves repeat visits instantly (until ISR revalidates with a new version).
 *
 * Falls back to JSON API if MessagePack fetch fails.
 */
export async function fetchItemsPack(market: Market, version?: string): Promise<any[]> {
  const v = version || 'latest';

  // Return in-memory cache if same market + version (SPA navigation / re-render)
  if (cachedItems && cachedVersion === v && cachedMarket === market) {
    return cachedItems;
  }

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

    return items;
  }
}
