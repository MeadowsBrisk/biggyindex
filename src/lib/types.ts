/**
 * Core type definitions for BiggyIndex v2.
 *
 * All item data uses minified keys to reduce JSON payload size (~40%).
 * See CLAUDE.md "Minified Item Keys" for the full reference.
 */

/** Variant option for an item */
export interface ItemVariant {
  /** Variant ID */
  vid?: string | number;
  /** Variant description (e.g., "3.5g", "1oz") */
  d: string;
  /** English variant description (for non-GB markets) */
  dEn?: string;
  /** Price in USD */
  usd: number;
}

/** Aggregated review statistics */
export interface ItemReviewStats {
  /** Average rating (1-10 scale on LittleBiggy) */
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

/** v2 filterable attributes — per-category parsed attributes */
export interface ItemAttributes {
  /** Flower: effect (Indica, Sativa, Hybrid) */
  effect?: string[];
  /** Flower: grow type (Indoor, Outdoor, Greenhouse, Hydro) */
  grow?: string[];
  /** Shared: quality tier (Budget, Mid, Premium, Exotic/Cali) */
  tier?: string[];
  /** Shared: origin (UK, Cali/US, Spanish, Dutch, Moroccan, etc.) */
  origin?: string[];
  /** Hash: micron size (45u, 73u, 90u, 120u, etc.) */
  micron?: string[];
  /** Hash: filtration level (Single, Double, Triple, Full Melt) */
  filtration?: string[];
  /** Hash: texture (Soft, Hard, Crumbly, Sticky) */
  texture?: string[];
  /** Vapes: extract type (Distillate, Live Resin, Full Spectrum, CDT) */
  extract?: string[];
  /** Vapes/Concentrates: form (Disposable, Cart/Pod, Wax, Shatter, etc.) */
  form?: string[];
  /** Edibles: dietary (Vegan, Gluten-Free) */
  dietary?: string[];
  /** Edibles: per-piece mg strength */
  strength?: string[];
  /** Concentrates: process (BHO, Solventless, CO2, Pressed) */
  process?: string[];
  /** Catch-all for any additional parsed attributes */
  [key: string]: string[] | undefined;
}

/** Main item interface with minified keys */
export interface Item {
  /** Unique item ID */
  id: string | number;
  /** Reference number (for LittleBiggy URLs) */
  refNum?: string | number | null;
  /** Item name */
  n: string;
  /** English name (original, for non-GB markets when translated) */
  nEn?: string | null;
  /** Item description */
  d?: string | null;
  /** English description (original, for non-GB markets when translated) */
  dEn?: string | null;
  /** Primary image URL */
  i?: string | null;
  /** Additional image URLs */
  is?: string[] | null;
  /** Primary optimized image hash */
  ih?: string | null;
  /** Additional optimized image hashes, positionally matching `is` during transition */
  ish?: Array<string | null> | null;
  /** Primary image is animated */
  ia?: 1 | 0 | boolean | null;
  /** Additional image animated flags, positionally matching `is` during transition */
  isa?: Array<1 | 0 | boolean | null> | null;
  /** Seller ID */
  sid?: number | null;
  /** Seller name */
  sn?: string | null;
  /** Primary category */
  c?: string | null;
  /** Subcategories (v2: array) */
  sc?: string[] | null;
  /** Ships from country/region */
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
  /** Image optimized in R2 (1 = yes) */
  io?: number;
  /** v2 filterable attributes */
  at?: ItemAttributes | null;
  /** Categorization confidence (0-1, rounded to 2dp) */
  cf?: number | null;
}

// ─── Price History ──────────────────────────────────────────────────

/** A single price snapshot in the item's price history */
export interface PriceSnapshot {
  /** ISO date of the change */
  d: string;
  /** uMin at this point */
  min: number;
  /** uMax at this point */
  max: number;
}

// ─── Merged Detail Blob ─────────────────────────────────────────────

/**
 * The per-market item-detail blob from R2.
 *
 * This is a flat, self-contained item: the overlay can render entirely
 * from this blob without needing indexed_items.json in the Jotai store.
 *
 * Built by the merge-detail crawler stage from:
 *   core blob + shipping blob + index-meta (price history)
 */
export interface MergedDetailBlob extends Item {
  /** Full item reviews from the crawler */
  reviews?: any[];
  /** Detailed shipping options (translated for non-GB) */
  shOpts?: { label: string; cost: number }[];
  /** English shipping options (fallback for non-GB) */
  shOptsEn?: { label: string; cost: number }[];
  /** Price history snapshots (newest-last, max 20) */
  ph?: PriceSnapshot[];
  /** Source hash for change detection */
  _hash?: string;
  /** When this detail blob was built */
  _builtAt?: string;
}

/** Sort options — base keys only; direction is handled by SortDir */
export type SortKey =
  | "hottest"
  | "newest"
  | "updated"
  | "price"
  | "ppg"
  | "name";

export type SortDir = "asc" | "desc";

/** Seller summary (from sellers.json per market) */
export interface Seller {
  id: number;
  name: string;
  url: string;
  online: string | null;
  itemsCount: number;
  averageRating: number | null;
  averageDaysToArrive: number | null;
  numberOfReviews: number;
  /** Seller avatar/logo URL — enriched from leaderboard data */
  imageUrl?: string | null;
}

/** Market definition */
export interface Market {
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
  locale: string;
  flag: string;
}

// ─── Home Feed types ────────────────────────────────────────────────

/** Pre-shaped review card from home-feed.json */
export interface HomeFeedReview {
  /** LittleBiggy review id. Optional because older home-feed blobs pre-date
      the field — newer crawls always populate it. */
  id?: number | null;
  sellerId: string;
  sellerName: string | null;
  sellerAvatar?: string;
  itemName?: string;
  refNum?: string;
  itemImage?: string;
  rating: number;
  text?: string;
  daysToArrive?: number;
  createdAt: string;
  images?: string[];
}

/** Review aggregate stats */
export interface HomeFeedReviewStats {
  thisWeek: number;
  avgRating: number;
  avgDeliveryDays: number;
  perDay: number;
  total: number;
}

/** Leaderboard seller entry */
export interface HomeFeedLeaderboardEntry {
  sellerId: string;
  sellerName: string;
  imageUrl?: string;
  score: number;
  positiveCount: number;
  negativeCount: number;
  totalReviews: number;
  lastReviewAt?: string;
  joined?: string;
}

/** Lightweight item card for What's New section */
export interface HomeFeedItemCard {
  id: string | number;
  refNum?: string | number;
  n: string;
  i?: string | null;
  is?: string[] | null;
  io?: number;
  c?: string | null;
  sc?: string[] | null;
  sid?: number | null;
  sn?: string | null;
  /** Seller image URL (baked in by home-feed builder so avatars work without hydrating sellersMap) */
  si?: string | null;
  sf?: string | null;
  uMin?: number | null;
  uMax?: number | null;
  rs?: {
    avg?: number | null;
    days?: number | null;
    cnt?: number | null;
  } | null;
  h?: number | null;
  fsa?: string | null;
  lua?: string | null;
}

/** The complete home-feed.json blob */
export interface HomeFeed {
  hero: {
    totalItems: number;
    totalSellers: number;
    categoryCounts: { name: string; count: number }[];
  };
  whatsNew: {
    newest: HomeFeedItemCard[];
    updated: HomeFeedItemCard[];
  };
  sellers: {
    top: HomeFeedLeaderboardEntry[];
    bottom: HomeFeedLeaderboardEntry[];
    recentlyJoined: HomeFeedLeaderboardEntry[];
  };
  reviews: {
    list: HomeFeedReview[];
    stats: HomeFeedReviewStats;
  };
  builtAt: string;
}
