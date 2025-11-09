// Build a compact item image lookup from a market index list
// Output shape aligns with frontend expectations:
//   { byRef: Record<string, string>, byId: Record<string, string> }
// Supports both legacy and minified index entries.

export type IndexEntry = {
  id?: string | number;
  refNum?: string | number;
  imageUrl?: string | null;
  imageUrls?: string[];
  // Minified unified fields (optional)
  i?: string | null; // primary image
  t?: string | null; // thumbnail (alternate)
};

export function buildItemImageLookupFromIndex(index: Array<IndexEntry | any>): { byRef: Record<string, string>; byId: Record<string, string> } {
  const byRef: Record<string, string> = {};
  const byId: Record<string, string> = {};
  if (!Array.isArray(index)) return { byRef, byId };

  for (const raw of index) {
    if (!raw || typeof raw !== 'object') continue;
    const id = raw.id != null ? String(raw.id) : null;
    const ref = raw.refNum != null ? String(raw.refNum) : null;
    // Prefer explicit imageUrl, otherwise first imageUrls, otherwise minified 'i' or 't'
    const img = ((): string | null => {
      if (typeof raw.imageUrl === 'string' && raw.imageUrl) return raw.imageUrl;
      if (Array.isArray(raw.imageUrls) && raw.imageUrls.length && typeof raw.imageUrls[0] === 'string') return raw.imageUrls[0];
      if (typeof raw.i === 'string' && raw.i) return raw.i;
      if (typeof raw.t === 'string' && raw.t) return raw.t;
      return null;
    })();
    if (!img) continue;
    if (ref && !byRef[ref]) byRef[ref] = img;
    if (id && !byId[id]) byId[id] = img;
  }

  return { byRef, byId };
}
