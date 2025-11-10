import type { NextApiRequest, NextApiResponse } from 'next';
import { getRecentMedia, getSnapshotMeta, getItemImageLookup, getSellerImages, getRecentItemsCompact } from '@/lib/indexData';
import { conditionalJSON } from '@/lib/http/conditional';
import type { Market } from '@/lib/market';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mkt = String((req.query as any).mkt || 'GB').toUpperCase() as Market;
  const meta: any = await getSnapshotMeta(mkt);
  const mediaRaw: any[] = await getRecentMedia(mkt);
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

  const media: any[] = Array.isArray(mediaRaw)
    ? mediaRaw
        .slice(0, 40)
        .map((entry: any, index: number) => {
          if (!entry || !Array.isArray(entry.segments)) return null;

          const textSnippet = entry.segments
            .filter((segment: any) => segment && segment.type === 'text' && typeof segment.value === 'string')
            .map((segment: any) => segment.value)
            .join('')
            .replace(/\s+/g, ' ')
            .trim();

          const images = entry.segments
            .filter((segment: any) => segment && segment.type === 'image' && segment.url)
            .map((segment: any) => segment.url)
            .filter(Boolean);

          if (!images.length) return null;

          const ref = entry.item?.refNum;
          const itemId = entry.item?.id;
          const itemImageUrl =
            entry.item?.imageUrl ||
            (ref != null && imageByRefFromRecent.get(String(ref))) ||
            (itemId != null && imageByIdFromRecent.get(String(itemId))) ||
            null;

          const sellerId = entry.sellerId ?? entry.seller?.id ?? null;
          let sellerImageUrl: string | null = null;
          if (sellerId != null) {
            sellerImageUrl = sellerImageById.get(Number(sellerId)) || null;
          }

          return {
            id: entry.id ?? `media-${index}`,
            images,
            sellerName: entry.sellerName || 'Unknown seller',
            rating: typeof entry.rating === 'number' ? entry.rating : null,
            daysToArrive: Number.isFinite(entry.daysToArrive) ? entry.daysToArrive : null,
            createdAt: entry.created ? new Date(entry.created * 1000).toISOString() : null,
            itemName: entry.item?.name || 'Unknown item',
            refNum: entry.item?.refNum || null,
            itemImageUrl: itemImageUrl ?? null,
            text: textSnippet || null,
            sellerId: entry.sellerId ?? null,
            sellerImageUrl,
          };
        })
        .filter(Boolean) as any[]
    : [];

  const version = `media-${media.length}-${updatedAt.slice(0, 10)}-${mkt}`;

  await conditionalJSON(req as any, res as any, {
    prefix: `recent-media-${mkt}`,
    version,
    updatedAt,
    getBody: async () => media
  });
}
