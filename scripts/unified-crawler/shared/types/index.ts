// Shared types for the unified crawler (stub)
export type MarketCode = "GB" | "DE" | "FR" | "PT" | "IT";

export interface ItemCore {
  id: string;
  name?: string;
}

export interface GlobalState {
  lastFullCrawl?: string;
  lastReviewsRefresh?: string;
}

export interface RunMetaEntry {
  at: string;
  scope: string;
  counts?: Record<string, number>;
  error?: { message: string; code?: string };
}

export interface IndexResult {
  ok: boolean;
  market: MarketCode;
  counts?: Record<string, number>;
  artifacts?: string[];
  snapshotMeta?: Record<string, unknown>;
}

/**
 * Seller enrichment state - tracks what we know about each seller
 * to enable fast sync planning (no per-seller blob reads).
 */
export interface SellerStateEntry {
  lastEnrichedAt: string;   // ISO timestamp of last full enrichment
  hasManifesto: boolean;
  hasImage: boolean;
  hasShare: boolean;
  hasReviews: boolean;
  reviewCount: number;
  imageHash?: string;       // Hash of imageUrl for R2 cleanup when avatar changes
}

export interface SellerStateAggregate {
  version: number;
  updatedAt: string;
  sellers: Record<string, SellerStateEntry>;
}
