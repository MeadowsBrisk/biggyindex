import { getRecentReviews, getSnapshotMeta, getItemImageLookup, getSellerImages } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import fs from 'fs';
import path from 'path';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const meta = await getSnapshotMeta();
  const reviewsRaw = await getRecentReviews();
  const itemImageLookup = await getItemImageLookup();
  const sellerImagesMap = await getSellerImages();
  
  const updatedAt = meta?.updatedAt || new Date().toISOString();
  
  // Build lookup maps
  const imageByRefFromRecent = new Map(Object.entries(itemImageLookup?.byRef || {}));
  const imageByIdFromRecent = new Map(Object.entries(itemImageLookup?.byId || {}));
  const sellerImageById = new Map(
    Object.entries(sellerImagesMap || {})
      .map(([k, v]) => [Number(k), v])
      .filter(([id, url]) => Number.isFinite(id) && !!url)
  );
  
  // Helper to get seller image from filesystem as fallback
  function getSellerImageFromSnapshotFS(sellerId) {
    try {
      if (!Number.isFinite(sellerId)) return null;
      const file = path.join(process.cwd(), 'public', 'seller-crawler', 'sellers', `${sellerId}.json`);
      if (!fs.existsSync(file)) return null;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const url = data && data.sellerImageUrl;
      return (typeof url === 'string' && url) ? url : null;
    } catch { 
      return null; 
    }
  }
  
  // Helper to convert created timestamp to ISO string
  function resolveCreated(created) {
    if (!created) return null;
    if (typeof created === "number") return new Date(created * 1000).toISOString();
    const parsed = new Date(created);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  
  // Enrich reviews with item images and seller images
  const reviews = Array.isArray(reviewsRaw)
    ? reviewsRaw.slice(0, 100).map((review) => {
        const ref = review?.item?.refNum;
        const itemId = review?.item?.id;
        const imageUrl =
          review?.item?.imageUrl ||
          (ref != null && imageByRefFromRecent.get(String(ref))) ||
          (itemId != null && imageByIdFromRecent.get(String(itemId))) ||
          null;
        
        // Enrich with seller image
        const sellerId = review?.sellerId ?? review?.seller?.id ?? null;
        let sellerImageUrl = null;
        if (sellerId) {
          sellerImageUrl = sellerImageById.get(sellerId) || null;
          if (!sellerImageUrl) sellerImageUrl = getSellerImageFromSnapshotFS(sellerId) || null;
        }
        
        return {
          ...review,
          createdAt: review?.created ? resolveCreated(review.created) : null,
          itemName: review?.item?.name || "Unknown item",
          refNum: review?.item?.refNum || null,
          itemImageUrl: imageUrl ?? null,
          sellerImageUrl: sellerImageUrl ?? null,
        };
      })
    : [];
  
  const version = `reviews-${reviews.length}-${updatedAt.slice(0, 10)}`;
  
  await conditionalJSON(req, res, {
    prefix: 'recent-reviews',
    version,
    updatedAt,
    getBody: async () => reviews
  });
}
