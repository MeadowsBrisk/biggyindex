// Minimal SSR helpers to load item/seller details from Netlify Blobs
// Conservative, blobs-first with optional fallback to indexData where available.

async function getStoreSafe() {
  try {
    const mod = await import('@netlify/blobs');
    if (!mod || !mod.getStore) return null;
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    let store = null;
    if (siteID && token) {
      try { store = mod.getStore({ name: 'site-index', siteID, token, consistency: 'strong' }); } catch {}
    }
    if (!store) {
      try { store = mod.getStore({ name: 'site-index', consistency: 'strong' }); } catch {}
    }
    return store || null;
  } catch {
    return null;
  }
}

async function readBlobJSON(key) {
  const store = await getStoreSafe();
  if (!store) return null;
  try {
    const raw = await store.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadItemForSEO(refNum) {
  if (!refNum) return null;
  const key = `item-crawler/items/${encodeURIComponent(String(refNum))}.json`;
  const detail = await readBlobJSON(key);
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
    const mod = await import('@/lib/indexData');
    if (mod && typeof mod.getAllItems === 'function') {
      const items = await mod.getAllItems();
      const item = Array.isArray(items) ? items.find(it => String(it.refNum) === String(refNum) || String(it.id) === String(refNum)) : null;
      if (item) {
        return {
          refNum: String(item.refNum || item.id || refNum),
          name: item.name || '',
          description: item.description || '',
          imageUrl: item.imageUrl || null,
          sellerName: item.sellerName || null,
        };
      }
    }
  } catch {}
  return null;
}

export async function loadSellerForSEO(id) {
  if (id == null) return null;
  const key = `seller-crawler/sellers/${encodeURIComponent(String(id))}.json`;
  const detail = await readBlobJSON(key);
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
    const mod = await import('@/lib/indexData');
    if (mod && typeof mod.getSellers === 'function') {
      const sellers = await mod.getSellers();
      const s = Array.isArray(sellers) ? sellers.find(x => Number(x.id) === Number(id)) : null;
      if (s) {
        return {
          id: Number(s.id),
          sellerName: s.name || '',
          sellerImageUrl: s.imageUrl || null,
          itemsCount: s.itemsCount ?? null,
          shareLink: s.url || null,
        };
      }
    }
  } catch {}
  return null;
}
