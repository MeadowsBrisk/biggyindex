import type { NextApiRequest, NextApiResponse } from 'next';
import { getRecentReviews, getSnapshotMeta, getItemImageLookup, getSellerImages, getRecentItemsCompact } from '@/lib/indexData';
import { RECENT_REVIEWS_LIMIT } from '@/lib/constants';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market';

export const config = { runtime: 'nodejs' };

function resolveCreated(created: any): string | null {
  if (!created) return null;
  if (typeof created === 'number') return new Date(created * 1000).toISOString();
  const parsed = new Date(created);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const meta: any = await getSnapshotMeta(mkt);
  const reviewsRaw: any[] = await getRecentReviews(mkt);
  const itemImageLookup: any = await getItemImageLookup(mkt);
  const recentItemsCompact: any = await getRecentItemsCompact(mkt);
  const sellerImagesMap: any = await getSellerImages();
  const updatedAt: string = meta?.updatedAt || new Date().toISOString();

  const imageByRefFromRecent = new Map<string, string>(Object.entries((itemImageLookup?.byRef || {}) as Record<string,string>));
  const imageByIdFromRecent = new Map<string, string>(Object.entries((itemImageLookup?.byId || {}) as Record<string,string>));
  try {
    const lists = [recentItemsCompact?.added || [], recentItemsCompact?.updated || []];
    for (const list of lists) {
      for (const it of Array.isArray(list) ? list : []) {
        const ref = it?.refNum ?? it?.id ?? null;
        const img = it?.imageUrl || null;
        if (ref != null && img) {
          const key = String(ref);
          if (!imageByRefFromRecent.has(key)) imageByRefFromRecent.set(key, img);
        }
        if (it?.id != null && img) {
          const keyId = String(it.id);
          if (!imageByIdFromRecent.has(keyId)) imageByIdFromRecent.set(keyId, img);
        }
      }
    }
  } catch {}
  const sellerImageById = new Map<number, string>();
  for (const [k, v] of Object.entries(sellerImagesMap || {})) {
    const id = Number(k);
    if (Number.isFinite(id) && v) sellerImageById.set(id, String(v));
  }

  const reviews = Array.isArray(reviewsRaw)
    ? reviewsRaw.slice(0, RECENT_REVIEWS_LIMIT).map((review: any) => {
        const ref = review?.item?.refNum;
        const itemId = review?.item?.id;
        const imageUrl =
          review?.item?.imageUrl ||
          (ref != null && imageByRefFromRecent.get(String(ref))) ||
          (itemId != null && imageByIdFromRecent.get(String(itemId))) ||
          null;
        const sellerId = review?.sellerId ?? review?.seller?.id ?? null;
        let sellerImageUrl: string | null = null;
        if (sellerId != null) sellerImageUrl = sellerImageById.get(Number(sellerId)) || null;
        return {
          ...review,
          createdAt: review?.created ? resolveCreated(review.created) : null,
          itemName: review?.item?.name || 'Unknown item',
          refNum: review?.item?.refNum || null,
          itemImageUrl: imageUrl ?? null,
          sellerImageUrl,
        };
      })
    : [];

  const version = `reviews-${reviews.length}-${updatedAt.slice(0, 10)}-${mkt}`;

  await conditionalJSON(req as any, res as any, {
    prefix: `recent-reviews-${mkt}`,
    version,
    updatedAt,
    getBody: async () => reviews
  });
}
