import { getStore } from '@netlify/blobs';
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
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    
    let store: any = null;
    if (siteID && token) {
      try { store = getStore({ name: storeName, siteID, token, consistency: 'strong' }); } catch {}
    }
    if (!store) {
      try { store = getStore({ name: storeName, consistency: 'strong' }); } catch {}
    }

    if (store) {
      for (const key of candidateKeys) {
        try {
          const raw = await store.get(key);
          if (raw) {
            try { return JSON.parse(raw); } catch { return null; }
          }
        } catch {}
      }
    }
    
    return null;
  } catch (e) {
    console.error('fetchSellerDetail error:', e);
    return null;
  }
}
