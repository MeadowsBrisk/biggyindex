/**
 * Normalize minified item keys from unified crawler to full property names expected by frontend.
 * 
 * Minified keys (from unified crawler):
 * - n: name
 * - d: description
 * - i: imageUrl (primary)
 * - is: imageUrls (small array, first 3)
 * - v: variants
 * - uMin: priceMin
 * - uMax: priceMax
 * - sid: sellerId
 * - sn: sellerName
 * - h: hotness
 * - sf: shipsFrom
 * - c: category (primary)
 * - sc: subcategories
 * - rs: reviewStats { avg, days, cnt }
 * - ec: endorsementCount
 * - sl: shareLink
 * - sh: shipping summary { min, max, free }
 * - fsa: firstSeenAt
 * - lua: lastUpdatedAt
 * - lur: lastUpdateReason
 */

export function normalizeItem(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;

  // Start with all original properties
  const normalized: any = { ...raw };

  // Override with expanded minified keys (prefer minified keys over long-form)
  if (raw.n !== undefined) normalized.name = raw.n;
  if (raw.d !== undefined) normalized.description = raw.d;
  if (raw.i !== undefined) normalized.imageUrl = raw.i;
  if (raw.is !== undefined) normalized.imageUrls = raw.is;
  if (raw.v !== undefined) normalized.variants = raw.v;
  if (raw.uMin !== undefined) normalized.priceMin = raw.uMin;
  if (raw.uMax !== undefined) normalized.priceMax = raw.uMax;
  if (raw.sid !== undefined) normalized.sellerId = raw.sid;
  if (raw.sn !== undefined) normalized.sellerName = raw.sn;
  if (raw.h !== undefined) normalized.hotness = raw.h;
  if (raw.sf !== undefined) normalized.shipsFrom = raw.sf;
  if (raw.c !== undefined) normalized.category = raw.c;
  if (raw.sc !== undefined) normalized.subcategories = raw.sc;
  if (raw.ec !== undefined) normalized.endorsementCount = raw.ec;
  if (raw.sl !== undefined) normalized.shareLink = raw.sl;
  if (raw.fsa !== undefined) normalized.firstSeenAt = raw.fsa;
  if (raw.lua !== undefined) normalized.lastUpdatedAt = raw.lua;
  if (raw.lur !== undefined) normalized.lastUpdateReason = raw.lur;

  // Expand reviewStats from minified rs object
  if (raw.rs && typeof raw.rs === 'object') {
    normalized.reviewStats = {
      averageRating: raw.rs.avg !== undefined ? raw.rs.avg : null,
      averageDaysToArrive: raw.rs.days !== undefined ? raw.rs.days : null,
      numberOfReviews: raw.rs.cnt !== undefined ? raw.rs.cnt : null,
    };
  }

  // Expand shipping summary from minified sh object
  if (raw.sh && typeof raw.sh === 'object') {
    normalized.shipping = {
      minUSD: raw.sh.min !== undefined ? raw.sh.min : null,
      maxUSD: raw.sh.max !== undefined ? raw.sh.max : null,
      free: raw.sh.free !== undefined ? (raw.sh.free === 1 || raw.sh.free === true) : null,
    };
  }

  return normalized;
}

export function normalizeItems(items: any[]): any[] {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeItem);
}
