/**
 * Item schema using minified keys from unified crawler blob storage.
 *
 * These short keys reduce JSON size by ~40% vs full property names.
 * All components should use these keys directly.
 *
 * Key Reference:
 * - n: name
 * - d: description
 * - i: imageUrl (primary)
 * - is: imageUrls (array)
 * - sid: sellerId
 * - sn: sellerName
 * - c: category
 * - sc: subcategories
 * - sf: shipsFrom
 * - h: hotness
 * - uMin: priceMin (USD)
 * - uMax: priceMax (USD)
 * - v: variants
 * - rs: reviewStats
 * - sh: shipping summary
 * - ec: endorsementCount
 * - sl: shareLink
 * - fsa: firstSeenAt
 * - lua: lastUpdatedAt
 * - lur: lastUpdateReason
 */

/** Variant option for an item */
export interface ItemVariant {
  /** Variant ID */
  vid?: string | number;
  /** Variant description (e.g., "3.5g", "1oz") - may be translated for non-GB markets */
  d: string;
  /** English variant description (for usePerUnitLabel parsing) - only present in non-GB markets */
  dEn?: string;
  /** Price in USD */
  usd: number;
}

/** Aggregated review statistics */
export interface ItemReviewStats {
  /** Average rating (1-5) */
  avg?: number | null;
  /** Average days to arrive */
  days?: number | null;
  /** Total review count */
  cnt?: number | null;
}

/** Shipping cost summary */
export interface ItemShipping {
  /** Minimum shipping cost (USD) */
  min?: number | null;
  /** Maximum shipping cost (USD) */
  max?: number | null;
  /** 1 = free shipping available */
  free?: 1 | 0 | boolean | null;
}

/** Main item interface with minified keys */
export interface Item {
  /** Unique item ID */
  id: string | number;
  /** Reference number (for LittleBiggy URLs) */
  refNum?: string | number | null;
  /** Item name */
  n: string;
  /** Item description */
  d?: string | null;
  /** Primary image URL */
  i?: string | null;
  /** Additional image URLs */
  is?: string[] | null;
  /** Seller ID */
  sid?: number | null;
  /** Seller name */
  sn?: string | null;
  /** Primary category */
  c?: string | null;
  /** Subcategories */
  sc?: string[] | null;
  /** Ships from country code */
  sf?: string | null;
  /** Hotness score */
  h?: number | null;
  /** Minimum price (USD) */
  uMin?: number | null;
  /** Maximum price (USD) */
  uMax?: number | null;
  /** Variant options */
  v?: ItemVariant[] | null;
  /** Review statistics */
  rs?: ItemReviewStats | null;
  /** Shipping summary */
  sh?: ItemShipping | null;
  /** Endorsement count */
  ec?: number | null;
  /** Share/referral link */
  sl?: string | null;
  /** First seen timestamp (ISO) */
  fsa?: string | null;
  /** Last updated timestamp (ISO) */
  lua?: string | null;
  /** Last update reason */
  lur?: string | null;

  // Computed fields (added by atoms, not in blob)
  /** First seen timestamp (ms) - computed for sorting */
  fsaMs?: number;
  /** Last updated timestamp (ms) - computed for sorting */
  luaMs?: number;
  /** Minimum shipping cost (computed from sh.min) */
  minShip?: number | null;
  /** Shipping price range (computed from sh) */
  shippingPriceRange?: { min: number | null; max: number | null };
}

/** Props for ItemCard component */
export interface ItemCardItem {
  id: string | number;
  refNum?: string | number | null;
  n: string;
  d?: string | null;
  i?: string | null;
  is?: string[] | null;
  sn?: string | null;
  sid?: number | null;
  url?: string | null;
  rs?: ItemReviewStats | null;
  v?: ItemVariant[] | null;
  sellerOnline?: boolean | null;
  sf?: string | null;
  c?: string | null;
  fsa?: string | Date | null;
  lua?: string | Date | null;
  sl?: string | null;
  sh?: ItemShipping | null;
  lur?: string | null;
}
