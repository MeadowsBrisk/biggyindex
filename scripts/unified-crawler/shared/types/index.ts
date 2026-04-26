// Shared types for the unified crawler (stub)
import type { IndexMetaEntry } from "../logic/indexMetaStore";

export type MarketCode = "GB" | "DE" | "FR" | "PT" | "IT" | "ES";

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
  /**
   * When `runIndexMarket` is invoked with `deferSharedFlush: true`, the
   * per-market meta updates are returned here instead of being written to
   * `shared/aggregates/index-meta.json`. The orchestrator collects updates
   * from all markets and flushes once via `flushSharedIndexMeta` to avoid
   * read-modify-write races when markets run in parallel.
   */
  metaUpdates?: Record<string, IndexMetaEntry>;
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
