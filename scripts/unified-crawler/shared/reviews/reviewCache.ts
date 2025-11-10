import { getBlobClient } from '../persistence/blobs';
import { Keys } from '../persistence/keys';
import { loadEnv } from '../env/loadEnv';

export interface SellerReviewCacheEntry {
  sellerId: string;
  newestReviewCreated?: number; // epoch seconds
  newestReviewId?: string | number | null;
  updatedAt: string; // iso
}

export interface SellerReviewCacheMap {
  [sellerId: string]: SellerReviewCacheEntry;
}

const DEFAULT_MAX_AGE_DAYS = 2;

export async function loadSellerReviewCache(): Promise<SellerReviewCacheMap> {
  const env = loadEnv();
  const blob = getBlobClient(env.stores.shared);
  try {
    const data = await blob.getJSON<SellerReviewCacheMap>(Keys.shared.sellerReviewsCache());
    return data || {};
  } catch {
    return {};
  }
}

export async function saveSellerReviewCache(cache: SellerReviewCacheMap): Promise<void> {
  const env = loadEnv();
  const blob = getBlobClient(env.stores.shared);
  try { await blob.putJSON(Keys.shared.sellerReviewsCache(), cache); } catch {}
}

export function shouldSkipSellerReviews(cache: SellerReviewCacheMap, sellerId: string, newestCandidateCreated?: number): boolean {
  const entry = cache[sellerId];
  if (!entry) return false; // no history -> fetch
  const maxAgeDays = Number(process.env.SELLER_REVIEWS_CACHE_MAX_AGE_DAYS || DEFAULT_MAX_AGE_DAYS);
  const maxAgeMs = maxAgeDays * 86400 * 1000;
  const updatedMs = Date.parse(entry.updatedAt || '') || 0;
  const stale = !updatedMs || (Date.now() - updatedMs) > maxAgeMs;
  if (stale) return false; // stale cache -> refresh
  if (newestCandidateCreated == null) return false;
  // If newest candidate isn't newer than cached newest, we can skip
  return newestCandidateCreated <= (entry.newestReviewCreated || 0);
}

export function updateSellerReviewCache(cache: SellerReviewCacheMap, sellerId: string, newestReviewCreated?: number, newestReviewId?: string | number | null) {
  const existing = cache[sellerId];
  if (!existing || (newestReviewCreated || 0) > (existing.newestReviewCreated || 0)) {
    cache[sellerId] = {
      sellerId,
      newestReviewCreated: newestReviewCreated,
      newestReviewId: newestReviewId == null ? undefined : newestReviewId,
      updatedAt: new Date().toISOString(),
    };
  } else {
    // refresh timestamp only
    existing.updatedAt = new Date().toISOString();
  }
}
