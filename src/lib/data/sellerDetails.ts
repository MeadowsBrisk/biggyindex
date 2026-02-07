import { readR2JSON, buildR2Key } from '@/lib/data/r2Client';
 //used for seller slug pages, standalone, rather than loading entire index.
export async function fetchSellerDetail(id: string | number): Promise<any | null> {
  if (!id) return null;
  const idStr = String(id);
  const storeName = process.env.SHARED_STORE_NAME || 'site-index-shared';
  const candidateKeys = [
    `sellers/${idStr}.json`,
    `sellers/${encodeURIComponent(idStr)}.json`
  ];

  try {
    for (const key of candidateKeys) {
      const data = await readR2JSON<any>(buildR2Key(storeName, key));
      if (data) return data;
    }
    return null;
  } catch (e) {
    console.error('[sellerDetails] fetchSellerDetail error:', e);
    return null;
  }
}
