/**
 * Apply SEO fields from index entry to shipping/item payload.
 * BUG-002: Preserves name, seller, image, category fields for unavailable item fallback.
 * Used by processItem.ts in both GB shortcut and parallel markets paths.
 */
export function applySeoFields(payload: Record<string, any>, indexEntry: Record<string, any> | null | undefined): void {
  if (!indexEntry) return;
  if (indexEntry.n) payload.n = indexEntry.n;           // name
  if (indexEntry.sn) payload.sn = indexEntry.sn;        // sellerName
  if (indexEntry.sid != null) payload.sid = indexEntry.sid;  // sellerId
  if (indexEntry.i) payload.i = indexEntry.i;           // primary image
  if (Array.isArray(indexEntry.is) && indexEntry.is.length) payload.is = indexEntry.is;  // image array
  if (indexEntry.c) payload.c = indexEntry.c;           // category
  if (Array.isArray(indexEntry.sc)) payload.sc = indexEntry.sc;  // subcategories
}
