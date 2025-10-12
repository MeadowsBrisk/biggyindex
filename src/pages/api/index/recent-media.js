import { getRecentMedia, getSnapshotMeta, getItemImageLookup, getSellerImages } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import fs from 'fs';
import path from 'path';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const meta = await getSnapshotMeta();
  const mediaRaw = await getRecentMedia();
  const itemImageLookup = await getItemImageLookup();
  const sellerImagesMap = await getSellerImages();
  const updatedAt = meta?.updatedAt || new Date().toISOString();
  
  // Build lookup maps for item images
  const imageByRefFromRecent = new Map(Object.entries(itemImageLookup?.byRef || {}));
  const imageByIdFromRecent = new Map(Object.entries(itemImageLookup?.byId || {}));
  
  // Build seller image lookup
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
  
  // Transform media entries to match expected format
  const media = Array.isArray(mediaRaw)
    ? mediaRaw
        .slice(0, 40)
        .map((entry, index) => {
          if (!entry || !Array.isArray(entry.segments)) return null;
          
          const textSnippet = entry.segments
            .filter((segment) => segment && segment.type === "text" && typeof segment.value === "string")
            .map((segment) => segment.value)
            .join("")
            .replace(/\s+/g, " ")
            .trim();

          const images = entry.segments
            .filter((segment) => segment && segment.type === "image" && segment.url)
            .map((segment) => segment.url)
            .filter(Boolean);

          if (!images.length) return null;

          // Get item image from lookup
          const ref = entry.item?.refNum;
          const itemId = entry.item?.id;
          const itemImageUrl =
            entry.item?.imageUrl ||
            (ref != null && imageByRefFromRecent.get(String(ref))) ||
            (itemId != null && imageByIdFromRecent.get(String(itemId))) ||
            null;

          // Enrich with seller image
          const sellerId = entry.sellerId ?? entry.seller?.id ?? null;
          let sellerImageUrl = null;
          if (sellerId) {
            sellerImageUrl = sellerImageById.get(sellerId) || null;
            if (!sellerImageUrl) sellerImageUrl = getSellerImageFromSnapshotFS(sellerId) || null;
          }

          return {
            id: entry.id ?? `media-${index}`,
            images,
            sellerName: entry.sellerName || "Unknown seller",
            rating: typeof entry.rating === "number" ? entry.rating : null,
            daysToArrive: Number.isFinite(entry.daysToArrive) ? entry.daysToArrive : null,
            createdAt: entry.created ? new Date(entry.created * 1000).toISOString() : null,
            itemName: entry.item?.name || "Unknown item",
            refNum: entry.item?.refNum || null,
            itemImageUrl: itemImageUrl ?? null,
            text: textSnippet || null,
            sellerId: entry.sellerId ?? null,
            sellerImageUrl: sellerImageUrl ?? null,
          };
        })
        .filter(Boolean)
    : [];
  
  const version = `media-${media.length}-${updatedAt.slice(0, 10)}`;
  
  await conditionalJSON(req, res, {
    prefix: 'recent-media',
    version,
    updatedAt,
    getBody: async () => media
  });
}
