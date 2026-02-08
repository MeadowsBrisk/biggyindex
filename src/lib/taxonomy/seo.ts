// SSR helpers to load item/seller details from market-specific R2 storage
// Uses the same indexData infrastructure as the frontend for consistency

import type { Market } from '@/lib/market/market';

export type ItemSEO = {
  refNum: string;
  name: string;
  description: string;
  imageUrl: string | null;
  sellerName: string | null;
  price?: number | null;
  currency?: string | null;
  url?: string | null;
  reviewsCount?: number | null;
  reviewsRating?: number | null;
};

export type SellerSEO = {
  id: number;
  sellerName: string;
  sellerImageUrl: string | null;
  itemsCount: number | null;
  shareLink: string | null;
};

export async function loadItemForSEO(refNum: string | number, market?: Market): Promise<ItemSEO | null> {
  if (!refNum) return null;
  
  try {
    // Use the same indexData module that the frontend uses - it's market-aware
    const { getAllItems } = await import('@/lib/data/indexData');
    const items = await getAllItems(market);
    
    if (!Array.isArray(items) || items.length === 0) return null;
    
    // Find item by refNum (preferred) or fallback to id
    const item = items.find((it: any) => 
      String(it.refNum) === String(refNum) || 
      String(it.id) === String(refNum)
    );
    
    if (!item) return null;
    
    // Use minified keys directly from unified crawler:
    // n: name, d: description, i: imageUrl, sn: sellerName, p: price, c: currency, u: url
    // rs: reviewStats with minified keys (avg, cnt, days)
    const rs = item.rs;
    return {
      refNum: String(item.refNum || item.id || refNum),
      name: item.n || '',
      description: item.d || '',
      imageUrl: item.i || null,
      sellerName: item.sn || null,
      price: item.p || null,
      currency: item.c || null,
      url: item.u || item.sl || null,
      reviewsCount: rs?.cnt ?? null,
      reviewsRating: rs?.avg ?? null,
    };
  } catch (err) {
    console.error('[loadItemForSEO] Error:', err);
    return null;
  }
}

export async function loadSellerForSEO(id: string | number, market?: Market): Promise<SellerSEO | null> {
  if (id == null) return null;
  
  try {
    // Use the same indexData module for sellers
    const { getSellers } = await import('@/lib/data/indexData');
    const sellers = await getSellers(market);
    
    if (!Array.isArray(sellers) || sellers.length === 0) return null;
    
    const seller = sellers.find((s: any) => Number(s.id) === Number(id));
    if (!seller) return null;
    
    // Sellers use full property names (not minified)
    return {
      id: Number(seller.id),
      sellerName: seller.name || '',
      sellerImageUrl: seller.imageUrl || null,
      itemsCount: seller.itemsCount ?? null,
      shareLink: seller.url || null,
    };
  } catch (err) {
    console.error('[loadSellerForSEO] Error:', err);
    return null;
  }
}
