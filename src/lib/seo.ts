// Minimal SSR helpers to load item/seller details from Netlify Blobs
// Conservative, blobs-first with optional fallback to indexData where available.

export type ItemSEO = {
  refNum: string;
  name: string;
  description: string;
  imageUrl: string | null;
  sellerName: string | null;
};

export type SellerSEO = {
  id: number;
  sellerName: string;
  sellerImageUrl: string | null;
  itemsCount: number | null;
  shareLink: string | null;
};

async function getStoreSafe(): Promise<{ get: (key: string) => Promise<string | null> } | null> {
  try {
    const mod: any = await import('@netlify/blobs');
    if (!mod || !mod.getStore) return null;
    const siteID = (process as any).env.NETLIFY_SITE_ID || (process as any).env.SITE_ID;
    const token = (process as any).env.NETLIFY_BLOBS_TOKEN || (process as any).env.NETLIFY_API_TOKEN;
    const name = (process as any).env.SHARED_STORE_NAME || 'site-index-shared';
    let store: any = null;
    if (siteID && token) {
      try { store = mod.getStore({ name, siteID, token, consistency: 'strong' }); } catch {}
    }
    if (!store) {
      try { store = mod.getStore({ name, consistency: 'strong' }); } catch {}
    }
    return store || null;
  } catch {
    return null;
  }
}

async function readBlobJSON<T = any>(key: string): Promise<T | null> {
  const store = await getStoreSafe();
  if (!store) return null;
  try {
    const raw = await store.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function loadItemForSEO(refNum: string | number): Promise<ItemSEO | null> {
  if (!refNum) return null;
  const key = `items/${encodeURIComponent(String(refNum))}.json`;
  const detail: any = await readBlobJSON(key);
  if (detail && typeof detail === 'object') {
    return {
      refNum: detail.refNum || String(refNum),
      name: detail.name || '',
      description: detail.descriptionFull || detail.description || '',
      imageUrl: detail.imageUrl || (Array.isArray(detail.imageUrls) ? detail.imageUrls[0] : null) || null,
      sellerName: detail.sellerName || null,
    };
  }
  // Fallback to indexed items list for minimal metadata
  try {
    const mod: any = await import('@/lib/indexData');
    if (mod && typeof mod.getAllItems === 'function') {
      const items = await mod.getAllItems();
      const item = Array.isArray(items) ? items.find((it: any) => String(it.refNum) === String(refNum) || String(it.id) === String(refNum)) : null;
      if (item) {
        return {
          refNum: String(item.refNum || item.id || refNum),
          name: item.name || '',
          description: item.description || '',
          imageUrl: item.imageUrl || null,
          sellerName: item.sellerName || null,
        } as ItemSEO;
      }
    }
  } catch {}
  return null;
}

export async function loadSellerForSEO(id: string | number): Promise<SellerSEO | null> {
  if (id == null) return null;
  const key = `seller-crawler/sellers/${encodeURIComponent(String(id))}.json`;
  const detail: any = await readBlobJSON(key);
  if (detail && typeof detail === 'object') {
    return {
      id: Number(detail.sellerId ?? id),
      sellerName: detail.sellerName || '',
      sellerImageUrl: detail.sellerImageUrl || null,
      itemsCount: detail?.overview?.itemsCount ?? null,
      shareLink: (detail?.share && (detail.share.shortLink || detail.share.longLink)) || detail.sellerUrl || null,
    };
  }
  try {
    const mod: any = await import('@/lib/indexData');
    if (mod && typeof mod.getSellers === 'function') {
      const sellers = await mod.getSellers();
      const s = Array.isArray(sellers) ? sellers.find((x: any) => Number(x.id) === Number(id)) : null;
      if (s) {
        return {
          id: Number(s.id),
          sellerName: s.name || '',
          sellerImageUrl: s.imageUrl || null,
          itemsCount: s.itemsCount ?? null,
          shareLink: s.url || null,
        } as SellerSEO;
      }
    }
  } catch {}
  return null;
}
